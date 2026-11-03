import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { hashFile } from "@trackvault/core/hash";
import type { HubClient } from "../hub/client.ts";
import type { FileRow } from "../state.ts";
import {
	fileSize,
	localPath,
	partialPath,
	pruneEmptyDirs,
	removeFile,
} from "./files.ts";

export class HashMismatch extends Error {
	constructor(what: string) {
		super(`downloaded file does not match the manifest (${what})`);
		this.name = "HashMismatch";
	}
}

// The hub serves another version than the manifest said: the manifest is stale.
export class StaleManifest extends Error {
	constructor() {
		super(
			"hub serves a different version of the file than the manifest listed",
		);
		this.name = "StaleManifest";
	}
}

const IDLE_MS = 60_000;

// Streams the body into `part`, appending from `offset`. Aborts when no bytes arrive for
// a minute. Returns the bytes written by this call.
async function stream(
	response: Response,
	part: string,
	append: boolean,
	signal: AbortSignal,
): Promise<number> {
	if (!response.body) throw new Error("empty response body");
	const fh = await open(part, append ? "a" : "w");
	const reader = response.body.getReader();
	const abort = new AbortController();
	let idle = setTimeout(() => abort.abort(), IDLE_MS);
	const onAbort = () => abort.abort();
	signal.addEventListener("abort", onAbort, { once: true });
	let written = 0;
	try {
		for (;;) {
			const next = await Promise.race([
				reader.read(),
				new Promise<never>((_, reject) =>
					abort.signal.addEventListener(
						"abort",
						() =>
							reject(
								new Error(signal.aborted ? "aborted" : "download stalled"),
							),
						{ once: true },
					),
				),
			]);
			if (next.done) break;
			clearTimeout(idle);
			idle = setTimeout(() => abort.abort(), IDLE_MS);
			await fh.write(next.value);
			written += next.value.byteLength;
		}
	} finally {
		clearTimeout(idle);
		signal.removeEventListener("abort", onAbort);
		reader.cancel().catch(() => {});
		await fh.close();
	}
	return written;
}

// Downloads one file into place: resumes a partial file with a Range request, verifies
// size, fileHash and audioHash with core's hash, then renames it atomically over the
// destination. Throws HubError (hub side), HashMismatch (the partial is deleted) or an
// I/O error (the partial is kept for the next try).
export async function downloadFile(
	hub: HubClient,
	root: string,
	row: FileRow,
	signal: AbortSignal,
): Promise<void> {
	const dest = localPath(root, row.relPath);
	const part = partialPath(root, row.trackId, row.fileHash);
	await mkdir(dirname(part), { recursive: true });

	let offset = (await fileSize(part)) ?? 0;
	if (offset > row.size) {
		await removeFile(part);
		offset = 0;
	}
	if (offset < row.size) {
		const response = await hub.file(row.trackId, {
			fileHash: row.fileHash,
			rangeFrom: offset,
			signal,
		});
		let append = false;
		if (offset > 0) {
			if (response.status === 206) {
				const range = /^bytes (\d+)-/.exec(
					response.headers.get("content-range") ?? "",
				);
				append = range !== null && Number(range[1]) === offset;
			}
			// 200 is the whole file again (the hub's copy changed or ignored the range).
		}
		const headerHash = response.headers.get("x-tv-file-hash");
		if (headerHash && headerHash !== row.fileHash) {
			await response.body?.cancel().catch(() => {});
			throw new StaleManifest();
		}
		await stream(response, part, append, signal);
	}

	const size = (await stat(part)).size;
	if (size !== row.size) {
		if (size > row.size) await removeFile(part);
		throw size > row.size
			? new HashMismatch(`size ${size} > ${row.size}`)
			: new Error(`short download: ${size} of ${row.size} bytes (will resume)`);
	}
	const id = await hashFile(part);
	if (id.fileHash !== row.fileHash || id.audioHash !== row.audioHash) {
		await removeFile(part);
		throw new HashMismatch(
			id.fileHash !== row.fileHash ? "fileHash" : "audioHash",
		);
	}

	await mkdir(dirname(dest), { recursive: true });
	await rename(part, dest);
	if (row.haveRelPath && row.haveRelPath !== row.relPath) {
		const old = localPath(root, row.haveRelPath);
		await unlink(old).catch(() => {});
		await pruneEmptyDirs(root, dirname(old));
	}
}
