import type { ByteSource } from "../backup/crypto.ts";
import type { S3Client } from "./client.ts";

// Uploads a source as one object: a single PUT when small, else a multipart upload
// in parts, remembering the upload id and the parts done (through `store`) so a
// stopped job continues where it was, asking the storage which parts it holds.

export interface UploadState {
	uploadId: string;
	partSize: number;
	size: number;
	// Tells a changed file from the one the upload started with.
	version: string;
	salt?: string;
}

export interface UploadStore {
	load(): UploadState | undefined;
	save(state: UploadState): void;
	clear(): void;
}

export interface UploadOptions {
	meta?: Record<string, string>;
	contentType?: string;
	version?: string;
	store?: UploadStore;
	signal?: AbortSignal;
	// Bytes of this object sent so far, after each part.
	onBytes?: (sent: number) => void;
	partSize?: number;
	multipartAbove?: number;
}

const MIB = 1024 * 1024;
const MAX_PARTS = 9000;

export async function upload(
	client: S3Client,
	key: string,
	source: ByteSource,
	options: UploadOptions = {},
): Promise<{ multipart: boolean }> {
	const { signal } = options;
	const above = options.multipartAbove ?? 16 * MIB;
	if (source.size <= above) {
		const body = await source.read(0, source.size);
		await client.put(key, body, {
			meta: options.meta,
			contentType: options.contentType,
			signal,
		});
		options.onBytes?.(source.size);
		return { multipart: false };
	}
	const partSize = Math.max(
		options.partSize ?? 16 * MIB,
		Math.ceil(source.size / MAX_PARTS / MIB) * MIB,
	);
	const version = options.version ?? "";
	let state = options.store?.load();
	let done = new Map<number, string>();
	if (
		state &&
		(state.size !== source.size ||
			state.partSize !== partSize ||
			state.version !== version ||
			(state.salt ?? "") !== (source.salt ?? ""))
	) {
		await client.abortMultipart(key, state.uploadId, signal).catch(() => {});
		options.store?.clear();
		state = undefined;
	}
	if (state) {
		const held = await client.listParts(key, state.uploadId, signal);
		if (!held) {
			options.store?.clear();
			state = undefined;
		} else {
			for (const part of held) {
				const expected = Math.min(
					partSize,
					source.size - (part.number - 1) * partSize,
				);
				if (part.size === expected) done.set(part.number, part.etag);
			}
		}
	}
	if (!state) {
		done = new Map();
		const uploadId = await client.createMultipart(key, {
			meta: options.meta,
			contentType: options.contentType,
			signal,
		});
		state = {
			uploadId,
			partSize,
			size: source.size,
			version,
			salt: source.salt,
		};
		options.store?.save(state);
	}
	const count = Math.ceil(source.size / partSize);
	let sent = 0;
	for (const number of done.keys()) {
		sent += Math.min(partSize, source.size - (number - 1) * partSize);
	}
	options.onBytes?.(sent);
	for (let number = 1; number <= count; number++) {
		if (done.has(number)) continue;
		signal?.throwIfAborted();
		const start = (number - 1) * partSize;
		const body = await source.read(
			start,
			Math.min(start + partSize, source.size),
		);
		done.set(
			number,
			await client.uploadPart(key, state.uploadId, number, body, signal),
		);
		sent += body.length;
		options.onBytes?.(sent);
	}
	await client.completeMultipart(
		key,
		state.uploadId,
		[...done].map(([number, etag]) => ({ number, etag })),
		signal,
	);
	options.store?.clear();
	return { multipart: true };
}
