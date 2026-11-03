import type { FileHandle } from "node:fs/promises";
import {
	type FrameHeader,
	isId3v2Header,
	parseFrameHeader,
	parseVbrHeader,
	syncsafe,
	type VbrHeader,
} from "./frame.ts";

export interface Mp3Layout {
	size: number;
	// End of the leading ID3v2 tags.
	id3End: number;
	// The first MPEG frame, and the first byte of audio after any Xing/Info/VBRI
	// header frame. [payloadStart, payloadEnd) is what the audio hash covers.
	frameStart: number;
	payloadStart: number;
	payloadEnd: number;
	// False when no MPEG frame was found: the whole span after the tags is
	// hashed and the file is flagged as undecodable.
	framesFound: boolean;
	header: FrameHeader | null;
	vbr: VbrHeader | null;
}

const SCAN_WINDOW = 64 * 1024;

async function readAt(
	fh: FileHandle,
	position: number,
	length: number,
): Promise<Buffer> {
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

export async function readMp3Layout(
	fh: FileHandle,
	size: number,
): Promise<Mp3Layout> {
	let id3End = 0;
	for (let i = 0; i < 8; i++) {
		const head = await readAt(fh, id3End, 10);
		if (head.length < 10 || !isId3v2Header(head, 0)) break;
		const footer = ((head[5] as number) & 0x10) !== 0 ? 10 : 0;
		id3End += 10 + syncsafe(head, 6) + footer;
	}
	if (id3End > size) id3End = size;

	const window = await readAt(fh, id3End, Math.min(SCAN_WINDOW, size - id3End));
	let frameAt = -1;
	let header: FrameHeader | null = null;
	for (let i = 0; i + 4 <= window.length; i++) {
		if (window[i] !== 0xff) continue;
		const candidate = parseFrameHeader(window, i);
		if (!candidate) continue;
		// A sync pattern is a frame when the next frame header follows it (or the
		// file ends inside this frame).
		const next = i + candidate.length;
		if (next + 4 <= window.length && !parseFrameHeader(window, next)) continue;
		frameAt = i;
		header = candidate;
		break;
	}

	const framesFound = header !== null;
	const frameStart = framesFound ? id3End + frameAt : id3End;
	let payloadStart = frameStart;
	let vbr: VbrHeader | null = null;
	if (header) {
		vbr = parseVbrHeader(window, frameAt, header);
		if (vbr) payloadStart = frameStart + header.length;
	}

	const payloadEnd = await trailerStart(fh, size, payloadStart);
	return {
		size,
		id3End,
		frameStart,
		payloadStart: Math.min(payloadStart, size),
		payloadEnd: Math.max(payloadEnd, Math.min(payloadStart, size)),
		framesFound,
		header,
		vbr,
	};
}

// Where the trailing tags begin: an ID3v1 block, then APEv2 and appended
// ID3v2 (footer) tags before it, in any order.
async function trailerStart(
	fh: FileHandle,
	size: number,
	floor: number,
): Promise<number> {
	let end = size;
	const tail = await readAt(fh, Math.max(0, size - 4096), Math.min(size, 4096));
	const tailOffset = size - tail.length;
	const byteAt = (position: number): number =>
		tail[position - tailOffset] ?? -1;
	const textAt = (position: number, text: string): boolean => {
		if (position < tailOffset) return false;
		for (let i = 0; i < text.length; i++) {
			if (byteAt(position + i) !== text.charCodeAt(i)) return false;
		}
		return true;
	};
	if (end - 128 >= floor && textAt(end - 128, "TAG")) end -= 128;
	for (let i = 0; i < 4; i++) {
		if (end - 32 >= floor && textAt(end - 32, "APETAGEX")) {
			const sizeAt = end - 32 + 12;
			if (sizeAt - tailOffset + 8 > tail.length) break;
			const tagSize = tail.readUInt32LE(sizeAt - tailOffset);
			const flags = tail.readUInt32LE(sizeAt - tailOffset + 8);
			const total = tagSize + ((flags & 0x80000000) !== 0 ? 32 : 0);
			if (total < 32 || end - total < floor) break;
			end -= total;
			continue;
		}
		if (end - 10 >= floor && textAt(end - 10, "3DI")) {
			const sizeAt = end - 10 + 6;
			const body =
				((byteAt(sizeAt) & 0x7f) << 21) |
				((byteAt(sizeAt + 1) & 0x7f) << 14) |
				((byteAt(sizeAt + 2) & 0x7f) << 7) |
				(byteAt(sizeAt + 3) & 0x7f);
			const total = body + 20;
			if (end - total < floor) break;
			end -= total;
			continue;
		}
		break;
	}
	return end;
}
