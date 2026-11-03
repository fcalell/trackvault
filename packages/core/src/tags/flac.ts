// FLAC: STREAMINFO for the audio properties, VORBIS_COMMENT for the tags, PICTURE
// blocks for covers. A read walks the block headers by seeking, so a cover's bytes
// are never loaded. A write re-lays the blocks from the first one that changes to the
// end of the metadata and fills what is left with PADDING, so most edits are done in
// place; when the blocks outgrow their space the file is rewritten with fresh padding.

import { type FileHandle, open } from "node:fs/promises";
import { imageInfo } from "../art/image.ts";
import { isId3v2Header, syncsafe } from "../mp3/frame.ts";
import { type Piece, readAt, rewriteFile, Window, writeAll } from "./io.ts";
import type {
	AudioInfo,
	AudioPayload,
	EmbeddedPicture,
	TagFormat,
	TagPatch,
	TagReadResult,
} from "./types.ts";
import {
	applyVorbis,
	type Comments,
	emptyComments,
	parseComments,
	readVorbis,
	serializeComments,
} from "./vorbis.ts";

const STREAMINFO = 0;
const PADDING = 1;
const VORBIS_COMMENT = 4;
const PICTURE = 6;
const FRESH_PADDING = 8192;

interface Block {
	type: number;
	// Offset of the 4-byte block header.
	start: number;
	length: number;
	last: boolean;
}

interface Layout {
	// Where "fLaC" sits (after any leading ID3v2 tag).
	magicAt: number;
	blocks: Block[];
	// First byte of the audio frames.
	audioStart: number;
}

async function layoutOf(fh: FileHandle, size: number): Promise<Layout | null> {
	const win = new Window(fh, size);
	let magicAt = 0;
	for (let i = 0; i < 4; i++) {
		const head = await win.read(magicAt, 10);
		if (head.length < 10 || !isId3v2Header(head, 0)) break;
		magicAt += 10 + syncsafe(head, 6) + ((head[5] as number) & 0x10 ? 10 : 0);
	}
	const magic = await win.read(magicAt, 4);
	if (magic.length < 4 || magic.toString("latin1") !== "fLaC") return null;
	const blocks: Block[] = [];
	let at = magicAt + 4;
	for (;;) {
		const h = await win.read(at, 4);
		if (h.length < 4) return null;
		const type = (h[0] as number) & 0x7f;
		const last = ((h[0] as number) & 0x80) !== 0;
		const length = h.readUIntBE(1, 3);
		if (type === 127 || at + 4 + length > size) return null;
		blocks.push({ type, start: at, length, last });
		at += 4 + length;
		if (last) break;
	}
	if (blocks[0]?.type !== STREAMINFO || blocks[0].length < 34) return null;
	return { magicAt, blocks, audioStart: at };
}

async function body(fh: FileHandle, block: Block): Promise<Buffer> {
	return readAt(fh, block.start + 4, block.length);
}

// PICTURE block: type, mime, description, size/depth fields, data.
function parsePicture(
	b: Buffer,
): { type: number; mime: string; data: Buffer } | null {
	try {
		const type = b.readUInt32BE(0);
		const mimeLength = b.readUInt32BE(4);
		const mime = b.toString("latin1", 8, 8 + mimeLength);
		let at = 8 + mimeLength;
		const descLength = b.readUInt32BE(at);
		at += 4 + descLength + 16;
		const dataLength = b.readUInt32BE(at);
		at += 4;
		if (at + dataLength > b.length) return null;
		return { type, mime, data: b.subarray(at, at + dataLength) };
	} catch {
		return null;
	}
}

function pictureBlockBody(mime: string, data: Uint8Array): Buffer {
	const info = imageInfo(data);
	const mimeBytes = Buffer.from(mime, "latin1");
	const head = Buffer.alloc(8 + mimeBytes.length + 4 + 20);
	head.writeUInt32BE(3, 0);
	head.writeUInt32BE(mimeBytes.length, 4);
	mimeBytes.copy(head, 8);
	let at = 8 + mimeBytes.length;
	head.writeUInt32BE(0, at); // empty description
	at += 4;
	head.writeUInt32BE(info?.width ?? 0, at);
	head.writeUInt32BE(info?.height ?? 0, at + 4);
	head.writeUInt32BE(24, at + 8);
	head.writeUInt32BE(0, at + 12);
	head.writeUInt32BE(data.length, at + 16);
	return Buffer.concat([head, data]);
}

function streamInfo(b: Buffer): {
	sampleRate: number;
	channels: number;
	bitDepth: number;
	samples: number;
} {
	const b10 = b[10] as number;
	const b11 = b[11] as number;
	const b12 = b[12] as number;
	const b13 = b[13] as number;
	return {
		sampleRate: (b10 << 12) | (b11 << 4) | (b12 >> 4),
		channels: ((b12 >> 1) & 7) + 1,
		bitDepth: (((b12 & 1) << 4) | (b13 >> 4)) + 1,
		samples: (b13 & 0x0f) * 2 ** 32 + b.readUInt32BE(14),
	};
}

async function probeFrom(fh: FileHandle, size: number): Promise<AudioInfo> {
	const layout = await layoutOf(fh, size);
	return audioOf(fh, size, layout);
}

async function audioOf(
	fh: FileHandle,
	size: number,
	layout: Layout | null,
): Promise<AudioInfo> {
	const none: AudioInfo = {
		format: "flac",
		codec: "flac",
		bitrateKbps: 0,
		sampleRate: 0,
		channels: 0,
		bitDepth: 0,
		durationMs: 0,
	};
	const first = layout?.blocks[0];
	if (!layout || !first) return none;
	const info = streamInfo(await body(fh, first));
	if (info.sampleRate === 0) return none;
	const seconds = info.samples / info.sampleRate;
	const payload = Math.max(0, size - layout.audioStart);
	return {
		format: "flac",
		codec: "flac",
		bitrateKbps: seconds > 0 ? Math.round((payload * 8) / seconds / 1000) : 0,
		sampleRate: info.sampleRate,
		channels: info.channels,
		bitDepth: info.bitDepth,
		durationMs: Math.round(seconds * 1000),
	};
}

async function readFrom(fh: FileHandle, size: number): Promise<TagReadResult> {
	const layout = await layoutOf(fh, size);
	if (!layout) throw new Error("not a FLAC file");
	const vorbis = layout.blocks.find((b) => b.type === VORBIS_COMMENT);
	const comments = vorbis
		? parseComments(await body(fh, vorbis))
		: emptyComments();
	return {
		tags: readVorbis(comments),
		audio: await audioOf(fh, size, layout),
		hasArt: layout.blocks.some((b) => b.type === PICTURE && b.length > 16),
	};
}

async function payloadOf(fh: FileHandle, size: number): Promise<AudioPayload> {
	const layout = await layoutOf(fh, size);
	if (!layout) return { start: 0, end: size, found: false };
	return {
		start: layout.audioStart,
		end: size,
		found: layout.audioStart < size,
	};
}

async function pictureOf(
	fh: FileHandle,
	size: number,
): Promise<EmbeddedPicture | null> {
	const layout = await layoutOf(fh, size);
	if (!layout) return null;
	let fallback: EmbeddedPicture | null = null;
	for (const block of layout.blocks) {
		if (block.type !== PICTURE) continue;
		const picture = parsePicture(await body(fh, block));
		if (!picture || picture.data.length === 0) continue;
		const found = { mime: picture.mime, data: new Uint8Array(picture.data) };
		if (picture.type === 3) return found;
		fallback ??= found;
	}
	return fallback;
}

// A block as it will be written: kept from the file, or new bytes.
interface Planned {
	type: number;
	old: Block | null;
	data: Buffer | null;
}

const blockSize = (p: Planned): number =>
	4 + (p.data ? p.data.length : (p.old as Block).length);

function header(type: number, last: boolean, length: number): Buffer {
	const h = Buffer.alloc(4);
	h[0] = type | (last ? 0x80 : 0);
	h.writeUIntBE(length, 1, 3);
	return h;
}

async function write(path: string, patch: TagPatch): Promise<void> {
	const fh = await open(path, "r+");
	try {
		const { size } = await fh.stat();
		const layout = await layoutOf(fh, size);
		if (!layout) throw new Error("not a FLAC file");

		let comments: Comments = emptyComments();
		const vorbis = layout.blocks.find((b) => b.type === VORBIS_COMMENT);
		if (vorbis) comments = parseComments(await body(fh, vorbis));
		applyVorbis(comments, patch);
		const commentBody = serializeComments(comments);
		const replacesPictures = patch.picture !== undefined;

		const plan: Planned[] = [];
		let placedComment = false;
		const placeComment = () => {
			plan.push({ type: VORBIS_COMMENT, old: null, data: commentBody });
			placedComment = true;
			if (patch.picture)
				plan.push({
					type: PICTURE,
					old: null,
					data: pictureBlockBody(patch.picture.mime, patch.picture.data),
				});
		};
		for (const block of layout.blocks) {
			if (block.type === PADDING) continue;
			if (block.type === VORBIS_COMMENT) {
				if (!placedComment) placeComment();
				continue;
			}
			if (block.type === PICTURE && replacesPictures) continue;
			plan.push({ type: block.type, old: block, data: null });
			// The comment follows STREAMINFO when the file had none.
			if (block.type === STREAMINFO && !vorbis && !placedComment)
				placeComment();
		}

		// Positions of the new layout; the first block that differs starts the rewrite.
		let at = layout.magicAt + 4;
		let firstChanged = -1;
		const positions: number[] = [];
		for (let i = 0; i < plan.length; i++) {
			const p = plan[i] as Planned;
			positions.push(at);
			if (firstChanged === -1) {
				const same =
					p.old !== null && p.old.start === at && p.old.last === false;
				if (!same) firstChanged = i;
			}
			at += blockSize(p);
		}
		// Unchanged blocks keep their header, last flag included: only blocks that are
		// not last in the file can be reused as they are.
		const total = at;
		const fixedStart =
			firstChanged === -1 ? total : (positions[firstChanged] as number);
		const space = layout.audioStart - fixedStart;
		const needed = total - fixedStart;
		const rest = space - needed;

		const emit = async (padding: number): Promise<Buffer> => {
			const parts: Buffer[] = [];
			const from = firstChanged === -1 ? plan.length : firstChanged;
			for (let i = from; i < plan.length; i++) {
				const p = plan[i] as Planned;
				const content = p.data ?? (await body(fh, p.old as Block));
				const lastReal = i === plan.length - 1 && padding < 0;
				parts.push(header(p.type, lastReal, content.length), content);
			}
			if (padding >= 0) {
				parts.push(header(PADDING, true, padding), Buffer.alloc(padding));
			}
			return Buffer.concat(parts);
		};

		if (rest === 0 || rest >= 4) {
			const blocks = await emit(rest === 0 ? -1 : rest - 4);
			await writeAll(fh, blocks, fixedStart);
			return;
		}

		const head = await emit(FRESH_PADDING);
		const pieces: Piece[] = [
			{ from: 0, to: fixedStart },
			head,
			{ from: layout.audioStart, to: size },
		];
		await rewriteFile(path, fh, pieces);
	} finally {
		await fh.close();
	}
}

async function read(path: string): Promise<TagReadResult> {
	const fh = await open(path, "r");
	try {
		return await readFrom(fh, (await fh.stat()).size);
	} finally {
		await fh.close();
	}
}

export const flacTags: TagFormat = {
	name: "flac",
	extensions: [".flac"],
	sniff: (head) => head.toString("latin1", 0, 4) === "fLaC",
	read,
	write,
	readFrom,
	probeFrom,
	payloadOf,
	pictureOf,
};
