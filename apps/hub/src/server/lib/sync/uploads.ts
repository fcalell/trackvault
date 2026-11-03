import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
	copyFile,
	mkdir,
	open,
	rename,
	rm,
	stat,
	truncate,
	utimes,
} from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { hashFile } from "@trackvault/core/hash";
import { safeJoin, sanitizeFilename } from "@trackvault/core/paths";
import type {
	InboxCheckResponse,
	UploadChunkResponse,
	UploadComplete,
	UploadCompleteResponse,
	UploadInit,
	UploadInitResponse,
	UploadStatus,
} from "@trackvault/core/sync";
import { requestInbox } from "../../services/inbox.ts";
import { INBOX_DIR } from "../inbox/paths.ts";
import { freeName } from "../quarantine.ts";
import { statement } from "../raw.ts";
import { readSettings } from "../settings.ts";
import { CHUNK_SIZE } from "./devices.ts";
import { SyncError } from "./http.ts";
import { uploadPath } from "./paths.ts";

// The inbox upload: an agent sends a file it found in a watched folder. The file is
// received in resumable chunks into a part file beside the database, hashed when
// complete, and then lands in `<library>/Inbox/<device>/…`, where the inbox job finds it
// (the scanner leaves that folder alone) and runs it through the pipeline.

const MAX_SIZE = 4 * 1024 ** 3;

interface UploadRow {
	id: string;
	device_id: string;
	audio_hash: string;
	fileHash: string;
	size: number;
	name: string;
	source_rel_path: string | null;
	mtime_ms: number;
	received: number;
	state: "receiving" | "complete" | "aborted";
	landed_path: string | null;
}

const SELECT = `SELECT id, device_id, audio_hash, file_hash AS fileHash, size, name, source_rel_path,
	mtime_ms, received, state, landed_path FROM uploads`;

const busy = new Set<string>();

// Audio the hub has (a track) or already holds in its inbox, rejected files included:
// an agent does not send what the owner turned away.
const has = (audioHash: string): boolean =>
	statement(
		`SELECT 1 AS x FROM tracks WHERE audio_hash = @h
		 UNION ALL SELECT 1 FROM inbox_items WHERE audio_hash = @h AND state != 'failed' LIMIT 1`,
	).get({ h: audioHash }) !== undefined;

export function inboxCheck(
	items: Array<{ audioHash: string }>,
): InboxCheckResponse {
	const found = statement(
		`SELECT audio_hash AS h FROM tracks WHERE audio_hash IN (SELECT value FROM json_each(@h))
		 UNION SELECT audio_hash FROM uploads WHERE state = 'complete' AND audio_hash IN (SELECT value FROM json_each(@h))
		 UNION SELECT audio_hash FROM inbox_items WHERE state != 'failed' AND audio_hash IN (SELECT value FROM json_each(@h))`,
	).all({ h: JSON.stringify(items.map((item) => item.audioHash)) }) as {
		h: string;
	}[];
	return { known: found.map((row) => row.h) };
}

function owned(deviceId: string, uploadId: string): UploadRow {
	const row = statement(`${SELECT} WHERE id = @id`).get({ id: uploadId }) as
		| UploadRow
		| undefined;
	if (!row || row.device_id !== deviceId)
		throw new SyncError("not-found", "No such upload");
	return row;
}

export async function startUpload(
	deviceId: string,
	init: UploadInit,
): Promise<UploadInitResponse> {
	if (init.size > MAX_SIZE)
		throw new SyncError("too-large", "That file is too large");
	if (has(init.audioHash))
		return {
			uploadId: "",
			status: "exists",
			received: 0,
			chunkSize: CHUNK_SIZE,
		};
	const found = statement(
		`${SELECT} WHERE device_id = @d AND file_hash = @h`,
	).get({
		d: deviceId,
		h: init.fileHash,
	}) as UploadRow | undefined;
	const now = Date.now();
	if (found && found.state === "receiving") {
		// What is on disk decides where to resume.
		const onDisk = await stat(uploadPath(found.id)).then(
			(s) => s.size,
			() => 0,
		);
		const received = Math.min(found.received, onDisk);
		if (received !== found.received)
			statement(
				"UPDATE uploads SET received = @r, updated_at = @now WHERE id = @id",
			).run({ id: found.id, r: received, now });
		return {
			uploadId: found.id,
			status: received > 0 ? "resumed" : "new",
			received,
			chunkSize: CHUNK_SIZE,
		};
	}
	if (found && found.state === "complete")
		return {
			uploadId: "",
			status: "exists",
			received: 0,
			chunkSize: CHUNK_SIZE,
		};
	const id = found?.id ?? randomUUID();
	if (found) {
		statement(
			"UPDATE uploads SET state = 'receiving', received = 0, size = @size, name = @name, source_rel_path = @src, mtime_ms = @mtime, audio_hash = @audio, updated_at = @now WHERE id = @id",
		).run({
			id,
			size: init.size,
			name: init.name,
			src: init.sourceRelPath ?? null,
			mtime: init.mtimeMs,
			audio: init.audioHash,
			now,
		});
	} else {
		statement(
			`INSERT INTO uploads (id, device_id, audio_hash, file_hash, size, name, source_rel_path, mtime_ms, received, state, created_at, updated_at)
			 VALUES (@id, @d, @audio, @hash, @size, @name, @src, @mtime, 0, 'receiving', @now, @now)`,
		).run({
			id,
			d: deviceId,
			audio: init.audioHash,
			hash: init.fileHash,
			size: init.size,
			name: init.name,
			src: init.sourceRelPath ?? null,
			mtime: init.mtimeMs,
			now,
		});
	}
	await rm(uploadPath(id), { force: true });
	return { uploadId: id, status: "new", received: 0, chunkSize: CHUNK_SIZE };
}

export function uploadStatus(deviceId: string, uploadId: string): UploadStatus {
	const row = owned(deviceId, uploadId);
	return { received: row.received, size: row.size, state: row.state };
}

export async function receiveChunk(
	deviceId: string,
	uploadId: string,
	offset: number,
	request: Request,
): Promise<UploadChunkResponse> {
	const row = owned(deviceId, uploadId);
	if (row.state !== "receiving")
		throw new SyncError("not-found", "That upload is over");
	if (busy.has(uploadId))
		throw new SyncError("busy", "A chunk is still arriving", undefined, 2);
	if (!Number.isSafeInteger(offset) || offset < 0)
		throw new SyncError("bad-request", "offset must be a whole number");
	if (offset !== row.received && offset !== 0)
		throw new SyncError("offset-mismatch", "The hub expects another offset", {
			received: row.received,
		});
	if (!request.body) throw new SyncError("bad-request", "No chunk body");
	busy.add(uploadId);
	const path = uploadPath(uploadId);
	try {
		await mkdir(dirname(path), { recursive: true });
		// A chunk at 0 starts over; anything else appends where the hub stopped.
		if (offset === 0)
			await truncate(path, 0).catch(async () =>
				(await open(path, "w")).close(),
			);
		let written = 0;
		const limit = row.size - offset;
		const counter = new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				written += chunk.byteLength;
				if (written > limit)
					throw new SyncError("too-large", "More than the declared size");
				controller.enqueue(chunk);
			},
		});
		const sink = createWriteStream(path, { flags: offset === 0 ? "w" : "a" });
		await pipeline(
			Readable.fromWeb(request.body.pipeThrough(counter) as never),
			sink,
		);
		const received = offset + written;
		statement(
			"UPDATE uploads SET received = @r, updated_at = @now WHERE id = @id",
		).run({ id: uploadId, r: received, now: Date.now() });
		return { received };
	} catch (error) {
		// Whatever reached the disk is what was received.
		const onDisk = await stat(path).then(
			(s) => s.size,
			() => 0,
		);
		statement(
			"UPDATE uploads SET received = @r, updated_at = @now WHERE id = @id",
		).run({ id: uploadId, r: onDisk, now: Date.now() });
		if (error instanceof SyncError) throw error;
		throw new SyncError(
			"busy",
			"The chunk did not arrive whole",
			{ received: onDisk },
			1,
		);
	} finally {
		busy.delete(uploadId);
	}
}

export async function abortUpload(
	deviceId: string,
	uploadId: string,
): Promise<void> {
	const row = owned(deviceId, uploadId);
	if (row.state === "complete") return;
	await rm(uploadPath(uploadId), { force: true });
	statement(
		"UPDATE uploads SET state = 'aborted', received = 0, updated_at = @now WHERE id = @id",
	).run({ id: uploadId, now: Date.now() });
}

const cleanSegment = (text: string): string => sanitizeFilename(text, "_");

async function moveAcross(from: string, to: string): Promise<void> {
	try {
		await rename(from, to);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
		await copyFile(from, to);
		await rm(from, { force: true });
	}
}

export async function completeUpload(
	deviceId: string,
	uploadId: string,
	done: UploadComplete,
): Promise<UploadCompleteResponse> {
	const row = owned(deviceId, uploadId);
	if (row.state === "complete")
		return { status: "accepted", inboxId: row.id, trackId: null };
	if (row.state !== "receiving")
		throw new SyncError("not-found", "That upload is over");
	if (row.received !== row.size)
		throw new SyncError("bad-request", "The upload is not whole yet", {
			received: row.received,
		});
	if (busy.has(uploadId))
		throw new SyncError("busy", "Still working on this upload", undefined, 2);
	busy.add(uploadId);
	try {
		const part = uploadPath(uploadId);
		const identity = await hashFile(part).catch(() => null);
		if (
			!identity ||
			identity.fileHash !== done.fileHash ||
			identity.audioHash !== done.audioHash ||
			identity.fileHash !== row.fileHash
		) {
			await rm(part, { force: true });
			statement(
				"UPDATE uploads SET state = 'aborted', received = 0, updated_at = @now WHERE id = @id",
			).run({ id: uploadId, now: Date.now() });
			throw new SyncError(
				"hash-mismatch",
				"The file does not hash to what was declared",
			);
		}
		if (has(identity.audioHash)) {
			await rm(part, { force: true });
			statement(
				"UPDATE uploads SET state = 'complete', updated_at = @now WHERE id = @id",
			).run({ id: uploadId, now: Date.now() });
			return { status: "duplicate", inboxId: null, trackId: null };
		}
		const root = readSettings().libraryRoot;
		if (!root)
			throw new SyncError(
				"busy",
				"The library folder is not set",
				undefined,
				60,
			);
		const device = statement("SELECT name FROM devices WHERE id = @id").get({
			id: deviceId,
		}) as { name: string } | undefined;
		const hint = (row.source_rel_path ?? row.name)
			.split("/")
			.filter((s) => s && s !== "." && s !== "..")
			.map(cleanSegment);
		const relative = [
			INBOX_DIR,
			cleanSegment(device?.name ?? deviceId),
			...hint,
		].join("/");
		const landed = await freeName(root, relative, () => false);
		const target = safeJoin(root, landed);
		await mkdir(dirname(target), { recursive: true });
		await moveAcross(part, target);
		await utimes(target, new Date(), new Date(row.mtime_ms)).catch(() => {});
		statement(
			"UPDATE uploads SET state = 'complete', landed_path = @p, updated_at = @now WHERE id = @id",
		).run({ id: uploadId, p: landed, now: Date.now() });
		// The inbox pipeline takes the file from here; the part file is gone.
		requestInbox();
		return { status: "accepted", inboxId: row.id, trackId: null };
	} finally {
		busy.delete(uploadId);
	}
}

// Receiving files that nobody finished are cleaned up after a week.
export async function purgeStaleUploads(): Promise<number> {
	const old = statement(
		"SELECT id FROM uploads WHERE state != 'complete' AND updated_at < @before",
	).all({ before: Date.now() - 7 * 86_400_000 }) as { id: string }[];
	for (const { id } of old) {
		await rm(uploadPath(id), { force: true });
		statement("DELETE FROM uploads WHERE id = @id").run({ id });
	}
	return old.length;
}
