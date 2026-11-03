import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { type Mp3Layout, readMp3Layout } from "../mp3/layout.ts";
import { detectFormat } from "../tags/index.ts";
import type { AudioPayload } from "../tags/types.ts";
import { feed, give, take, u32 } from "./stream.ts";

export interface FileIdentity {
	// Identity of the audio payload alone: tags, covers, padding and every container
	// chunk or atom around the audio are excluded (for MP3 also the Xing/Info header
	// frame and the ID3v1/APE trailers), so a tag edit keeps it.
	audioHash: string;
	// Identity of the whole file. It hashes the head and tail bytes (every tag)
	// with the audio hash between them, so each audio byte is read and hashed once.
	fileHash: string;
	size: number;
	// False when no audio stream was found: the file is not decodable.
	framesFound: boolean;
	// The MP3 layout; null for the other formats.
	layout: Mp3Layout | null;
}

// Where the audio of the file is: the MP3 layout, or the container's own payload.
async function locate(
	path: string,
	fh: Awaited<ReturnType<typeof open>>,
	size: number,
): Promise<{ payload: AudioPayload; layout: Mp3Layout | null }> {
	const format = await detectFormat(fh, size, path);
	if (!format || format.name === "mp3") {
		const layout = await readMp3Layout(fh, size);
		return {
			layout,
			payload: {
				start: layout.payloadStart,
				end: layout.payloadEnd,
				found: layout.framesFound,
			},
		};
	}
	let payload: AudioPayload;
	try {
		payload = await format.payloadOf(fh, size);
	} catch {
		payload = { start: 0, end: size, found: false };
	}
	return {
		layout: null,
		payload: {
			start: Math.min(payload.start, size),
			end: Math.max(Math.min(payload.end, size), Math.min(payload.start, size)),
			found: payload.found,
		},
	};
}

export async function hashFile(path: string): Promise<FileIdentity> {
	const fh = await open(path, "r");
	const buffer = take();
	try {
		const { size } = await fh.stat();
		const { payload, layout } = await locate(path, fh, size);
		const audio = createHash("sha256");
		const file = createHash("sha256");
		const headEnd = payload.start;
		const tailStart = payload.end;

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
			framesFound: payload.found,
			layout,
		};
	} finally {
		give(buffer);
		await fh.close();
	}
}

// The file hash of a file whose audio is known to be unchanged (a tag edit): only the
// head and the tail are read, the audio hash between them is the one given. Equal to
// `hashFile(path).fileHash` while the audio payload is the one `audioHash` names.
export async function refreshFileHash(
	path: string,
	audioHash: string,
): Promise<{ fileHash: string; size: number }> {
	const fh = await open(path, "r");
	const buffer = take();
	try {
		const { size } = await fh.stat();
		const { payload } = await locate(path, fh, size);
		const file = createHash("sha256");
		const headEnd = payload.start;
		const tailStart = payload.end;
		file.update("tvf1");
		file.update(u32(headEnd));
		await feed(fh, 0, headEnd, buffer, file);
		file.update(Buffer.from(audioHash, "hex"));
		file.update(u32(size - tailStart));
		await feed(fh, tailStart, size, buffer, file);
		return { fileHash: file.digest("hex"), size };
	} finally {
		give(buffer);
		await fh.close();
	}
}
