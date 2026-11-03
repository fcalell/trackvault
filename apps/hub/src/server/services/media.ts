import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq } from "@fcalell/plugin-db/orm";
import { defineService } from "@fcalell/plugin-node/server";
import { isUnderRoot, safeJoin } from "@trackvault/core/paths";
import { files, inboxItems } from "../../schema/index.ts";
import { artSize, thumbnail } from "../lib/art.ts";
import { db } from "../lib/db.ts";
import { verifyMediaToken } from "../lib/media-token.ts";
import { peaksPath } from "../lib/peaks.ts";
import { parseRange } from "../lib/range.ts";
import { readSettings } from "../lib/settings.ts";

const TYPES: Record<string, string> = {
	".mp3": "audio/mpeg",
	".flac": "audio/flac",
	".m4a": "audio/mp4",
	".aiff": "audio/aiff",
	".aif": "audio/aiff",
	".aifc": "audio/aiff",
	".wav": "audio/wav",
	".wave": "audio/wav",
};

const plain = (status: number, text: string): Response =>
	new Response(text, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});

// GET /media/<id>/peaks: the track's waveform, made by the `peaks` job.
async function servePeaks(request: Request, id: string): Promise<Response> {
	if (id === "" || id.includes("/")) return plain(404, "Not found");
	try {
		const bytes = await readFile(peaksPath(id));
		return new Response(request.method === "HEAD" ? null : bytes, {
			headers: {
				"content-type": "application/octet-stream",
				"content-length": String(bytes.length),
				// A track's id names its audio for good: the peaks never change.
				"cache-control": "private, max-age=31536000, immutable",
			},
		});
	} catch {
		return plain(404, "No waveform yet");
	}
}

// GET /media/<id>/art?size=320: the track's cover, resized once and kept on disk.
// The thumbnail's name carries the file's hash, so the URL's ETag changes with the art.
async function serveArt(request: Request, id: string): Promise<Response> {
	if (id === "" || id.includes("/")) return plain(404, "Not found");
	const wanted = Number(new URL(request.url).searchParams.get("size")) || 320;
	const file = await thumbnail(id, artSize(wanted)).catch(() => null);
	if (!file) return plain(404, "No cover");
	const info = await stat(file).catch(() => null);
	if (!info) return plain(404, "No cover");
	const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
	const headers = new Headers({
		"content-type": "image/jpeg",
		"content-length": String(info.size),
		etag,
		// Revalidated cheaply: a new cover changes the ETag, not the address.
		"cache-control": "private, max-age=3600, stale-while-revalidate=86400",
	});
	if (request.headers.get("if-none-match") === etag)
		return new Response(null, { status: 304, headers });
	return new Response(request.method === "HEAD" ? null : await readFile(file), {
		headers,
	});
}

async function serve(
	request: Request,
	signedIn: (request: Request) => Promise<unknown>,
): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD")
		return plain(405, "Method not allowed");
	const url = new URL(request.url);
	const path = decodeURIComponent(url.pathname.slice("/media/".length));
	// A signed address (`?t=`, minted by `media.url`) opens its own track without a
	// session; anything else needs the session the cookie or bearer key holds.
	const owner = path.split("/")[0] ?? "";
	if (
		!verifyMediaToken(owner, url.searchParams.get("t")) &&
		!(await signedIn(request))
	)
		return plain(401, "Sign in first");
	if (path.endsWith("/peaks")) return servePeaks(request, path.slice(0, -6));
	if (path.endsWith("/art")) return serveArt(request, path.slice(0, -4));
	const id = path;
	if (id === "" || id.includes("/")) return plain(404, "Not found");
	const root = readSettings().libraryRoot;
	if (!root) return plain(404, "The library folder is not set");
	// A track's file, or the file of an inbox item (the preview before it is filed).
	const row =
		db()
			.select({ path: files.path })
			.from(files)
			.where(and(eq(files.trackId, id), eq(files.state, "ok")))
			.orderBy(files.id)
			.limit(1)
			.get() ??
		db()
			.select({ path: inboxItems.path })
			.from(inboxItems)
			.where(eq(inboxItems.id, id))
			.get();
	if (!row) return plain(404, "Not found");

	let absolute: string;
	try {
		absolute = safeJoin(root, row.path);
		// A link inside the library must not lead out of it.
		if (!isUnderRoot(await realpath(root), await realpath(absolute)))
			return plain(404, "Not found");
	} catch {
		return plain(404, "Not found");
	}
	const info = await stat(absolute).catch(() => null);
	if (!info?.isFile()) return plain(404, "Not found");

	const extension = absolute.slice(absolute.lastIndexOf(".")).toLowerCase();
	const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
	const headers = new Headers({
		"content-type": TYPES[extension] ?? "application/octet-stream",
		"accept-ranges": "bytes",
		etag,
		"cache-control": "private, no-cache",
	});
	if (request.headers.get("if-none-match") === etag)
		return new Response(null, { status: 304, headers });

	// An If-Range that no longer matches asks for the whole file.
	const ifRange = request.headers.get("if-range");
	const range =
		ifRange && ifRange !== etag
			? null
			: parseRange(request.headers.get("range"), info.size);
	if (range === "unsatisfiable") {
		headers.set("content-range", `bytes */${info.size}`);
		return new Response(null, { status: 416, headers });
	}
	const start = range?.start ?? 0;
	const end = range?.end ?? info.size - 1;
	headers.set("content-length", String(info.size === 0 ? 0 : end - start + 1));
	if (range) headers.set("content-range", `bytes ${start}-${end}/${info.size}`);
	const status = range ? 206 : 200;
	if (request.method === "HEAD" || info.size === 0)
		return new Response(null, { status, headers });

	const stream = createReadStream(absolute, { start, end });
	// A player that seeks drops the request: stop reading with it.
	request.signal.addEventListener("abort", () => stream.destroy(), {
		once: true,
	});
	return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
		status,
		headers,
	});
}

// GET /media/<trackId>: the track's file, with Range support, to a signed-in session
// (the session the cookie or bearer token holds, as `/ws` resolves it).
export default defineService({
	name: "media",
	start({ http }) {
		http.mount("/media", (request) =>
			serve(request, http.session).catch(() =>
				plain(500, "Could not read the file"),
			),
		);
	},
});
