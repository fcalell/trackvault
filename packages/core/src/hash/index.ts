import { createHash, type Hash } from "node:crypto";
import { type FileHandle, open } from "node:fs/promises";
import { type Mp3Layout, readMp3Layout } from "../mp3/layout.ts";

export interface FileIdentity {
	// Identity of the audio payload alone: tags, covers, padding, the Xing/Info
	// header frame and the ID3v1/APE trailers are excluded, so a tag edit keeps it.
	audioHash: string;
	// Identity of the whole file. It hashes the head and tail bytes (every tag)
	// with the audio hash between them, so each audio byte is read and hashed once.
	fileHash: string;
	size: number;
	// False when no MPEG frame was found: the file is not decodable as MP3.
	framesFound: boolean;
	layout: Mp3Layout;
}

const CHUNK = 1 << 20;
const pool: Buffer[] = [];

function take(): Buffer {
	return pool.pop() ?? Buffer.allocUnsafe(CHUNK);
}

async function feed(
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

function u32(value: number): Buffer {
	const b = Buffer.allocUnsafe(4);
	b.writeUInt32BE(value >>> 0);
	return b;
}

export async function hashFile(path: string): Promise<FileIdentity> {
	const fh = await open(path, "r");
	const buffer = take();
	try {
		const { size } = await fh.stat();
		const layout = await readMp3Layout(fh, size);
		const audio = createHash("sha256");
		const file = createHash("sha256");
		const headEnd = layout.payloadStart;
		const tailStart = layout.payloadEnd;

		file.update("tvf1");
		file.update(u32(headEnd));
		await feed(fh, 0, headEnd, buffer, file);
		await feed(fh, headEnd, tailStart, buffer, audio);
		const audioDigest = audio.digest();
		file.update(audioDigest);
		file.update(u32(size - tailStart));
		await feed(fh, tailStart, size, buffer, file);

		return {
			audioHash: audioDigest.toString("hex"),
			fileHash: file.digest("hex"),
			size,
			framesFound: layout.framesFound,
			layout,
		};
	} finally {
		if (pool.length < 8) pool.push(buffer);
		await fh.close();
	}
}
