// ID3v2.2/2.3/2.4 reading and writing, by hand: a read walks the frame headers
// and decodes only the frames the library uses, so a cover's megabytes are never
// loaded; a write rebuilds the tag from the frames and leaves every frame it does
// not edit byte for byte as it was.

import type { FileHandle } from "node:fs/promises";
import { isId3v2Header, syncsafe } from "../mp3/frame.ts";

export interface Id3Frame {
	// Four-character id (a v2.2 id is translated to its v2.3 one).
	id: string;
	// The frame's declared size, whether or not its body was loaded.
	size: number;
	// Empty when the frame was skipped (`wanted` said no).
	body: Buffer;
	// Compressed, encrypted or grouped: kept and rewritten verbatim.
	opaque: boolean;
	flags: number;
}

export interface Id3Tag {
	version: 2 | 3 | 4;
	frames: Id3Frame[];
}

const V22_IDS: Record<string, string> = {
	TT2: "TIT2",
	TP1: "TPE1",
	TP2: "TPE2",
	TP4: "TPE4",
	TAL: "TALB",
	TCO: "TCON",
	TYE: "TYER",
	TPB: "TPUB",
	TRC: "TSRC",
	TBP: "TBPM",
	TKE: "TKEY",
	TRK: "TRCK",
	TPA: "TPOS",
	TCM: "TCOM",
	TXX: "TXXX",
	COM: "COMM",
	POP: "POPM",
	PIC: "APIC",
	ULT: "USLT",
};

export function deunsync(input: Buffer): Buffer {
	if (input.indexOf(0xff) === -1) return input;
	const out = Buffer.allocUnsafe(input.length);
	let n = 0;
	for (let i = 0; i < input.length; i++) {
		const byte = input[i] as number;
		out[n++] = byte;
		if (byte === 0xff && input[i + 1] === 0) i++;
	}
	return out.subarray(0, n);
}

type Source = (offset: number, length: number) => Promise<Buffer>;

// The frames of the ID3v2 tag at the start of the file, or null when there is
// none. `wanted` picks the frames whose bodies are loaded.
export async function readId3(
	fh: FileHandle,
	size: number,
	wanted: (id: string) => boolean,
): Promise<Id3Tag | null> {
	const head = Buffer.allocUnsafe(Math.min(size, 64 * 1024));
	const { bytesRead } = await fh.read(head, 0, head.length, 0);
	const cache = head.subarray(0, bytesRead);
	if (cache.length < 10 || !isId3v2Header(cache, 0)) return null;
	const major = cache[3] as number;
	if (major < 2 || major > 4) return null;
	const flags = cache[5] as number;
	const bodySize = syncsafe(cache, 6);

	let source: Source;
	let base = 10;
	let end = Math.min(10 + bodySize, size);
	if (major === 3 && (flags & 0x80) !== 0) {
		// Whole-tag unsynchronisation (v2.2 and v2.3): decode it once.
		const raw = Buffer.allocUnsafe(end - 10);
		await fh.read(raw, 0, raw.length, 10);
		const plain = deunsync(raw);
		source = async (offset, length) => plain.subarray(offset, offset + length);
		base = 0;
		end = plain.length;
	} else {
		source = async (offset, length) => {
			if (offset + length <= cache.length)
				return cache.subarray(offset, offset + length);
			const out = Buffer.allocUnsafe(length);
			const { bytesRead: got } = await fh.read(out, 0, length, offset);
			return out.subarray(0, got);
		};
	}
	return {
		version: major as 2 | 3 | 4,
		frames: await walk(source, base, end, major, flags, wanted),
	};
}

async function walk(
	source: Source,
	start: number,
	end: number,
	major: number,
	tagFlags: number,
	wanted: (id: string) => boolean,
): Promise<Id3Frame[]> {
	let at = start;
	if (major >= 3 && (tagFlags & 0x40) !== 0) {
		const ext = await source(at, 4);
		at += major === 4 ? syncsafe(ext, 0) : ext.readUInt32BE(0) + 4;
	}
	const headerLength = major === 2 ? 6 : 10;
	const frames: Id3Frame[] = [];
	while (at + headerLength <= end) {
		const h = await source(at, headerLength);
		if (h.length < headerLength || h[0] === 0) break;
		let rawId: string;
		let frameSize: number;
		let flags = 0;
		if (major === 2) {
			rawId = h.toString("latin1", 0, 3);
			frameSize =
				(h[3] as number) * 65536 + (h[4] as number) * 256 + (h[5] as number);
		} else {
			rawId = h.toString("latin1", 0, 4);
			frameSize = major === 4 ? syncsafe(h, 4) : h.readUInt32BE(4);
			flags = h.readUInt16BE(8);
		}
		if (!/^[A-Z0-9]{3,4}$/.test(rawId)) break;
		const bodyAt = at + headerLength;
		if (bodyAt + frameSize > end) break;
		at = bodyAt + frameSize;
		const id = major === 2 ? (V22_IDS[rawId] ?? rawId) : rawId;
		if (!wanted(id)) {
			frames.push({
				id,
				size: frameSize,
				body: EMPTY,
				opaque: false,
				flags: 0,
			});
			continue;
		}
		let body = await source(bodyAt, frameSize);
		if (major === 2) {
			if (id === "APIC") body = picToApic(body);
			frames.push({
				id,
				size: frameSize,
				body: Buffer.from(body),
				opaque: false,
				flags: 0,
			});
			continue;
		}
		const opaque = major === 4 ? (flags & 0x4c) !== 0 : (flags & 0xe0) !== 0;
		if (opaque) {
			frames.push({
				id,
				size: frameSize,
				body: Buffer.from(body),
				opaque: true,
				flags,
			});
			continue;
		}
		if (major === 4) {
			if ((flags & 0x01) !== 0) body = body.subarray(4);
			if ((flags & 0x02) !== 0) body = deunsync(body);
		}
		frames.push({
			id,
			size: frameSize,
			body: Buffer.from(body),
			opaque: false,
			flags: 0,
		});
	}
	return frames;
}

const EMPTY = Buffer.alloc(0);

// v2.2 PIC: encoding, three-letter image format, type, description, data.
function picToApic(body: Buffer): Buffer {
	if (body.length < 6) return body;
	const mime = `image/${body.toString("latin1", 1, 4).toLowerCase().replace("jpg", "jpeg")}`;
	return Buffer.concat([
		body.subarray(0, 1),
		Buffer.from(`${mime}\0`, "latin1"),
		body.subarray(4),
	]);
}

// --- text decoding -------------------------------------------------------

function decode(encoding: number, bytes: Buffer): string {
	if (bytes.length === 0) return "";
	switch (encoding) {
		case 1: {
			if (bytes[0] === 0xfe && bytes[1] === 0xff)
				return utf16be(bytes.subarray(2));
			if (bytes[0] === 0xff && bytes[1] === 0xfe)
				return bytes.toString("utf16le", 2);
			return bytes.toString("utf16le");
		}
		case 2:
			return utf16be(bytes);
		case 3:
			return bytes.toString("utf8");
		default:
			return bytes.toString("latin1");
	}
}

function utf16be(bytes: Buffer): string {
	const swapped = Buffer.from(bytes);
	swapped.swap16();
	return swapped.toString("utf16le");
}

const wide = (encoding: number): boolean => encoding === 1 || encoding === 2;

// The offset after the terminator that ends the string starting at `from`.
function terminator(
	encoding: number,
	body: Buffer,
	from: number,
): { end: number; next: number } {
	if (wide(encoding)) {
		for (let i = from; i + 1 < body.length; i += 2) {
			if (body[i] === 0 && body[i + 1] === 0) return { end: i, next: i + 2 };
		}
	} else {
		const i = body.indexOf(0, from);
		if (i !== -1) return { end: i, next: i + 1 };
	}
	return { end: body.length, next: body.length };
}

// The values of a text information frame (v2.4 separates them with NUL).
export function textValues(body: Buffer): string[] {
	if (body.length < 2) return [];
	const encoding = body[0] as number;
	return decode(encoding, body.subarray(1))
		.split("\0")
		.map((s) => s.replace(/﻿/g, "").trim())
		.filter((s) => s !== "");
}

export interface Described {
	language: string;
	description: string;
	text: string;
}

// COMM / USLT: encoding, language, description, text.
export function commentOf(body: Buffer): Described | null {
	if (body.length < 5) return null;
	const encoding = body[0] as number;
	const language = body.toString("latin1", 1, 4);
	const d = terminator(encoding, body, 4);
	return {
		language,
		description: decode(encoding, body.subarray(4, d.end)),
		text: decode(encoding, body.subarray(d.next)).replace(/\0+$/, ""),
	};
}

// TXXX: encoding, description, value.
export function userTextOf(
	body: Buffer,
): { description: string; value: string } | null {
	if (body.length < 2) return null;
	const encoding = body[0] as number;
	const d = terminator(encoding, body, 1);
	return {
		description: decode(encoding, body.subarray(1, d.end)),
		value: decode(encoding, body.subarray(d.next))
			.split("\0")
			.filter((s) => s !== "")
			.join("; "),
	};
}

// POPM: owner, rating byte, play counter.
export function popularimeterOf(
	body: Buffer,
): { owner: string; rating: number; counter: number } | null {
	const end = body.indexOf(0);
	if (end === -1 || end + 2 > body.length) return null;
	let counter = 0;
	for (let i = end + 2; i < body.length && i < end + 10; i++)
		counter = counter * 256 + (body[i] as number);
	return {
		owner: body.toString("latin1", 0, end),
		rating: body[end + 1] as number,
		counter,
	};
}

// --- text encoding -------------------------------------------------------

// v2.4 writes UTF-8; v2.3 writes Latin-1 when the text fits it, UTF-16 otherwise.
function encode(
	version: number,
	text: string,
): { encoding: number; bytes: Buffer; nul: Buffer } {
	if (version === 4)
		return {
			encoding: 3,
			bytes: Buffer.from(text, "utf8"),
			nul: Buffer.alloc(1),
		};
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Latin-1 is U+0000 to U+00FF
	if (/^[\u0000-ÿ]*$/.test(text)) {
		return {
			encoding: 0,
			bytes: Buffer.from(text, "latin1"),
			nul: Buffer.alloc(1),
		};
	}
	return {
		encoding: 1,
		bytes: Buffer.concat([
			Buffer.from([0xff, 0xfe]),
			Buffer.from(text, "utf16le"),
		]),
		nul: Buffer.alloc(2),
	};
}

export function textFrame(version: number, id: string, text: string): Id3Frame {
	const e = encode(version, text);
	const body = Buffer.concat([Buffer.from([e.encoding]), e.bytes]);
	return { id, size: body.length, body, opaque: false, flags: 0 };
}

export function commentFrame(
	version: number,
	id: "COMM" | "USLT",
	language: string,
	description: string,
	text: string,
): Id3Frame {
	// One encoding for the whole frame: the wider of the two parts.
	const encoding = Math.max(
		encode(version, description).encoding,
		encode(version, text).encoding,
	);
	const body = Buffer.concat([
		Buffer.from([encoding]),
		Buffer.from(language.padEnd(3, " ").slice(0, 3), "latin1"),
		reencode(encoding, description),
		nulOf(encoding),
		reencode(encoding, text),
	]);
	return { id, size: body.length, body, opaque: false, flags: 0 };
}

export function userTextFrame(
	version: number,
	description: string,
	value: string,
): Id3Frame {
	const d = encode(version, description);
	const t = encode(version, value);
	const encoding = Math.max(d.encoding, t.encoding);
	const body = Buffer.concat([
		Buffer.from([encoding]),
		reencode(encoding, description),
		nulOf(encoding),
		reencode(encoding, value),
	]);
	return { id: "TXXX", size: body.length, body, opaque: false, flags: 0 };
}

function nulOf(encoding: number): Buffer {
	return Buffer.alloc(wide(encoding) ? 2 : 1);
}

function reencode(encoding: number, text: string): Buffer {
	if (encoding === 3) return Buffer.from(text, "utf8");
	if (encoding === 1)
		return Buffer.concat([
			Buffer.from([0xff, 0xfe]),
			Buffer.from(text, "utf16le"),
		]);
	return Buffer.from(text, "latin1");
}

export function popularimeterFrame(
	owner: string,
	rating: number,
	counter: number,
): Id3Frame {
	const count = Buffer.alloc(counter > 0xffffffff ? 8 : 4);
	if (count.length === 8) count.writeBigUInt64BE(BigInt(counter));
	else count.writeUInt32BE(counter >>> 0);
	const body = Buffer.concat([
		Buffer.from(owner, "latin1"),
		Buffer.from([0, rating]),
		count,
	]);
	return { id: "POPM", size: body.length, body, opaque: false, flags: 0 };
}

// --- serialising ---------------------------------------------------------

function writeSyncsafe(value: number): Buffer {
	return Buffer.from([
		(value >> 21) & 0x7f,
		(value >> 14) & 0x7f,
		(value >> 7) & 0x7f,
		value & 0x7f,
	]);
}

// The tag as bytes: header, frames, then zero padding up to `total` bytes
// (when the frames are shorter than it) or `minimumPadding` after them.
export function serializeId3(
	version: 3 | 4,
	frames: readonly Id3Frame[],
	total: number | null,
	minimumPadding: number,
): Buffer {
	const parts: Buffer[] = [];
	let length = 0;
	for (const frame of frames) {
		const header = Buffer.alloc(10);
		header.write(frame.id, 0, "latin1");
		if (version === 4) writeSyncsafe(frame.body.length).copy(header, 4);
		else header.writeUInt32BE(frame.body.length, 4);
		header.writeUInt16BE(frame.opaque ? frame.flags : 0, 8);
		parts.push(header, frame.body);
		length += 10 + frame.body.length;
	}
	const padding =
		total !== null && 10 + length <= total
			? total - 10 - length
			: minimumPadding;
	const tag = Buffer.alloc(10 + length + padding);
	tag.write("ID3", 0, "latin1");
	tag[3] = version;
	tag[4] = 0;
	tag[5] = 0;
	writeSyncsafe(length + padding).copy(tag, 6);
	let at = 10;
	for (const part of parts) {
		part.copy(tag, at);
		at += part.length;
	}
	return tag;
}
