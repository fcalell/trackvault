import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { isUnderRoot, safeJoin } from "@trackvault/core/paths";
import { FILE_HEADERS } from "@trackvault/core/sync";
import { parseRange } from "../range.ts";
import { statement } from "../raw.ts";
import { readSettings } from "../settings.ts";
import { SyncError } from "./http.ts";

// GET /sync/files/:trackId: the track's primary file, whole or from a byte (`Range`),
// named by its `fileHash` as ETag. `If-Range` with a stale hash answers the whole current
// file; `?fileHash=` that is no longer current answers 409 `file-changed`.
export async function serveFile(
	request: Request,
	trackId: string,
): Promise<Response> {
	const url = new URL(request.url);
	const root = readSettings().libraryRoot;
	if (!root)
		throw new SyncError("busy", "The library folder is not set", undefined, 60);
	const row = statement(
		`SELECT f.path AS path, f.file_hash AS hash, t.audio_hash AS audio
		 FROM files f JOIN tracks t ON t.id = f.track_id
		 WHERE f.track_id = @id AND f.state = 'ok' AND (t.issues & 2048) = 0
		 ORDER BY f.id LIMIT 1`,
	).get({ id: trackId }) as
		| { path: string; hash: string | null; audio: string }
		| undefined;
	if (!row) throw new SyncError("not-found", "No such track");
	if (!row.hash)
		throw new SyncError("busy", "The file is not hashed yet", undefined, 5);
	const wanted = url.searchParams.get("fileHash");
	if (wanted && wanted !== row.hash)
		throw new SyncError("file-changed", "The file changed", {
			fileHash: row.hash,
		});

	let absolute: string;
	try {
		absolute = safeJoin(root, row.path);
		if (!isUnderRoot(await realpath(root), await realpath(absolute)))
			throw new Error("outside");
	} catch {
		throw new SyncError("not-found", "No such file");
	}
	const info = await stat(absolute).catch(() => null);
	if (!info?.isFile()) throw new SyncError("not-found", "No such file");

	const etag = `"${row.hash}"`;
	const headers = new Headers({
		"content-type": "application/octet-stream",
		"accept-ranges": "bytes",
		etag,
		[FILE_HEADERS.fileHash]: row.hash,
		[FILE_HEADERS.audioHash]: row.audio,
		"cache-control": "private, no-cache",
	});
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
	request.signal.addEventListener("abort", () => stream.destroy(), {
		once: true,
	});
	return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
		status,
		headers,
	});
}
