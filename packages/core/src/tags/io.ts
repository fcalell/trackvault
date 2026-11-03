// Byte-level helpers the container formats share: positioned reads through a small
// window cache, and the rewrite of a file through a temporary copy.

import { type FileHandle, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const BLOCK = 16 * 1024;
const COPY_CHUNK = 1 << 20;

export async function readAt(
	fh: FileHandle,
	position: number,
	length: number,
): Promise<Buffer> {
	if (length <= 0) return Buffer.alloc(0);
	const buffer = Buffer.allocUnsafe(length);
	let filled = 0;
	while (filled < length) {
		const { bytesRead } = await fh.read(
			buffer,
			filled,
			length - filled,
			position + filled,
		);
		if (bytesRead === 0) break;
		filled += bytesRead;
	}
	return filled === length ? buffer : buffer.subarray(0, filled);
}

// Reads that walk a container's headers: one 16 KiB read serves the many small ones
// around it, a bigger read goes straight to the file. A short result means the end.
export class Window {
	readonly fh: FileHandle;
	readonly size: number;
	private start = 0;
	private data: Buffer = Buffer.alloc(0);
	reads = 0;

	constructor(fh: FileHandle, size: number) {
		this.fh = fh;
		this.size = size;
	}

	async read(position: number, length: number): Promise<Buffer> {
		if (length <= 0 || position < 0 || position >= this.size)
			return Buffer.alloc(0);
		length = Math.min(length, this.size - position);
		const at = position - this.start;
		if (at >= 0 && at + length <= this.data.length)
			return this.data.subarray(at, at + length);
		this.reads++;
		if (length > BLOCK) return readAt(this.fh, position, length);
		const block = await readAt(
			this.fh,
			position,
			Math.min(BLOCK, this.size - position),
		);
		this.start = position;
		this.data = block;
		return block.subarray(0, length);
	}
}

// A piece of a rewritten file: new bytes, or a range copied from the old one.
export type Piece = Buffer | { from: number; to: number };

// Writes the pieces to a temporary file next to `path` and renames it over the file.
export async function rewriteFile(
	path: string,
	source: FileHandle,
	pieces: readonly Piece[],
): Promise<void> {
	const temporary = join(dirname(path), `.${basename(path)}.tvtmp`);
	const { mode } = await source.stat();
	const out = await open(temporary, "w", mode);
	let done = false;
	try {
		let to = 0;
		const buffer = Buffer.allocUnsafe(COPY_CHUNK);
		for (const piece of pieces) {
			if (Buffer.isBuffer(piece)) {
				await writeAll(out, piece, to);
				to += piece.length;
				continue;
			}
			let from = piece.from;
			while (from < piece.to) {
				const { bytesRead } = await source.read(
					buffer,
					0,
					Math.min(COPY_CHUNK, piece.to - from),
					from,
				);
				if (bytesRead === 0) throw new Error("file shrank while rewriting");
				await writeAll(out, buffer.subarray(0, bytesRead), to);
				from += bytesRead;
				to += bytesRead;
			}
		}
		await out.sync();
		done = true;
	} finally {
		await out.close();
		if (!done) await rm(temporary, { force: true });
	}
	try {
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
}

export async function writeAll(
	fh: FileHandle,
	data: Buffer,
	position: number,
): Promise<void> {
	let done = 0;
	while (done < data.length) {
		const { bytesWritten } = await fh.write(
			data,
			done,
			data.length - done,
			position + done,
		);
		done += bytesWritten;
	}
}

export function bpmText(bpm: number): string {
	return String(Number.isInteger(bpm) ? bpm : Math.round(bpm * 100) / 100);
}

export function parseNumber(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Number.parseFloat(value.trim().replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
}

export function yearOfText(value: string | null | undefined): number | null {
	if (!value) return null;
	const year = Number.parseInt(value.trim().slice(0, 4), 10);
	return year > 0 ? year : null;
}

// Stars (0-5) from a rating that is either stars or a 0-100 scale.
export function starsOfRating(value: number): number {
	if (!(value > 0)) return 0;
	if (value <= 5) return Math.round(value);
	return Math.min(5, Math.ceil(value / 20));
}

export const EMPTY_TAGS_AUDIO = {
	bitrateKbps: 0,
	sampleRate: 0,
	channels: 0,
	bitDepth: 0,
	durationMs: 0,
} as const;
