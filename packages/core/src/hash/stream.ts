import { createHash, type Hash } from "node:crypto";
import type { FileHandle } from "node:fs/promises";

const CHUNK = 1 << 20;
const pool: Buffer[] = [];

export function take(): Buffer {
	return pool.pop() ?? Buffer.allocUnsafe(CHUNK);
}

export function give(buffer: Buffer): void {
	if (pool.length < 8) pool.push(buffer);
}

// Reads [start, end) in chunks and feeds every hash with each one.
export async function feed(
	fh: FileHandle,
	start: number,
	end: number,
	buffer: Buffer,
	...hashes: Hash[]
): Promise<void> {
	let position = start;
	while (position < end) {
		const want = Math.min(buffer.length, end - position);
		const { bytesRead } = await fh.read(buffer, 0, want, position);
		if (bytesRead === 0) break;
		const slice = buffer.subarray(0, bytesRead);
		for (const hash of hashes) hash.update(slice);
		position += bytesRead;
	}
}

export function u32(value: number): Buffer {
	const b = Buffer.allocUnsafe(4);
	b.writeUInt32BE(value >>> 0);
	return b;
}

// sha256 of one byte range.
export async function hashRange(
	fh: FileHandle,
	start: number,
	end: number,
): Promise<Buffer> {
	const buffer = take();
	try {
		const hash = createHash("sha256");
		await feed(fh, start, end, buffer, hash);
		return hash.digest();
	} finally {
		give(buffer);
	}
}
