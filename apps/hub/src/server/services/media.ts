import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { and, eq } from "@fcalell/plugin-db/orm";
import { defineService } from "@fcalell/plugin-node/server";
import { isUnderRoot, safeJoin } from "@trackvault/core/paths";
import { files } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { readSettings } from "../lib/settings.ts";

const TYPES: Record<string, string> = {
	".mp3": "audio/mpeg",
};

// A session cookie is asked of the auth endpoint once in this long: a player
// makes many Range requests in a row.
const SESSION_TTL_MS = 30_000;
const sessions = new Map<string, number>();

async function signedIn(request: Request, port: number): Promise<boolean> {
	const cookie = request.headers.get("cookie");
	const authorization = request.headers.get("authorization");
	const key = `${cookie ?? ""}\n${authorization ?? ""}`;
	if (key === "\n") return false;
	const cached = sessions.get(key);
	if (cached !== undefined && cached > Date.now()) return true;
	const headers = new Headers({ accept: "application/json" });
	if (cookie) headers.set("cookie", cookie);
	if (authorization) headers.set("authorization", authorization);
	try {
		const response = await fetch(
			`http://127.0.0.1:${port}/api/auth/get-session`,
			{ headers },
		);
		if (!response.ok) return false;
		const body = (await response.json()) as { session?: unknown } | null;
		if (!body?.session) return false;
	} catch {
		return false;
	}
	if (sessions.size > 64) sessions.clear();
	sessions.set(key, Date.now() + SESSION_TTL_MS);
	return true;
}

type Range = { start: number; end: number } | "unsatisfiable" | null;

// A single byte range of a `Range` header; several ranges are served as the whole file.
function parseRange(header: string | null, size: number): Range {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, from, to] = match;
	if (from === "" && to === "") return null;
	let start: number;
	let end: number;
	if (from === "") {
		const suffix = Number(to);
		if (suffix === 0) return "unsatisfiable";
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(from);
		end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
	}
	if (start >= size || start > end) return "unsatisfiable";
	return { start, end };
}

const plain = (status: number, text: string): Response =>
	new Response(text, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});

async function serve(request: Request, port: number): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD")
		return plain(405, "Method not allowed");
	if (!(await signedIn(request, port))) return plain(401, "Sign in first");

	const id = decodeURIComponent(
		new URL(request.url).pathname.slice("/media/".length),
	);
	if (id === "" || id.includes("/")) return plain(404, "Not found");
	const root = readSettings().libraryRoot;
	if (!root) return plain(404, "The library folder is not set");
	const row = db()
		.select({ path: files.path })
		.from(files)
		.where(and(eq(files.trackId, id), eq(files.state, "ok")))
		.orderBy(files.id)
		.limit(1)
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

// GET /media/<trackId>: the track's file, with Range support, to a signed-in session.
export default defineService({
	name: "media",
	start({ http }) {
		http.mount("/media", (request) =>
			serve(request, http.port).catch(() =>
				plain(500, "Could not read the file"),
			),
		);
	},
});
