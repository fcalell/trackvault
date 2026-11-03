import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ANLZ_KINDS } from "@trackvault/core/sync";
import { statement } from "../raw.ts";
import { SyncError } from "./http.ts";
import { blobPath } from "./paths.ts";

// ANLZ analysis files, addressed by the sha256 of their bytes.

const MAX_BLOB = 64 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;

export function assertHash(hash: string): void {
	if (!HASH.test(hash))
		throw new SyncError("bad-request", "A blob hash is 64 hex characters");
}

export async function hasBlob(hash: string): Promise<boolean> {
	assertHash(hash);
	return stat(blobPath(hash)).then(
		(s) => s.isFile(),
		() => false,
	);
}

export async function readBlob(hash: string): Promise<Uint8Array> {
	assertHash(hash);
	try {
		return await readFile(blobPath(hash));
	} catch {
		throw new SyncError("not-found", "No such blob");
	}
}

export async function putBlob(
	deviceId: string,
	hash: string,
	trackId: string | null,
	kind: string | null,
	request: Request,
): Promise<void> {
	assertHash(hash);
	if (!kind || !(ANLZ_KINDS as readonly string[]).includes(kind))
		throw new SyncError("bad-request", "kind must be DAT, EXT or 2EX");
	if (!trackId) throw new SyncError("bad-request", "trackId is required");
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.length > MAX_BLOB)
		throw new SyncError("too-large", "That blob is too large");
	if (createHash("sha256").update(bytes).digest("hex") !== hash)
		throw new SyncError("hash-mismatch", "The bytes do not hash to the name");
	const path = blobPath(hash);
	if (!(await hasBlob(hash))) {
		await mkdir(dirname(path), { recursive: true });
		const temporary = `${path}.${process.pid}.tmp`;
		await writeFile(temporary, bytes);
		await rename(temporary, path).catch(async (error) => {
			await rm(temporary, { force: true });
			throw error;
		});
	}
	const now = Date.now();
	statement(
		`INSERT OR IGNORE INTO analysis_blobs (hash, track_id, device_id, kind, size, at)
		 VALUES (@hash, @t, @d, @kind, @size, @now)`,
	).run({ hash, t: trackId, d: deviceId, kind, size: bytes.length, now });
	statement(
		`INSERT INTO track_analysis (track_id, kind, device_id, hash, size, at)
		 VALUES (@t, @kind, @d, @hash, @size, @now)
		 ON CONFLICT(track_id, kind, device_id) DO UPDATE SET hash = @hash, size = @size, at = @now`,
	).run({ hash, t: trackId, d: deviceId, kind, size: bytes.length, now });
}
