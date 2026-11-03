// Chunked containers that carry an ID3v2 tag in a chunk: WAV (RIFF, little-endian)
// and AIFF (IFF, big-endian). The chunk walk, the tag read and the tag write (in place
// when the new tag fits the chunk, appended or relocated otherwise) live here; the
// formats supply their audio properties and payload.

import { type FileHandle, open } from "node:fs/promises";
import type { Id3Frame } from "./id3.ts";
import { type Id3Tag, readId3, serializeId3 } from "./id3.ts";
import { type Piece, readAt, rewriteFile, Window, writeAll } from "./io.ts";
import {
	apply,
	convert,
	id3Picture,
	PADDING,
	readFrames,
	wantedOnRead,
} from "./mp3.ts";
import type {
	AudioInfo,
	AudioPayload,
	EmbeddedPicture,
	TagFormat,
	TagPatch,
	TagReadResult,
	TrackTags,
} from "./types.ts";

export interface Chunk {
	id: string;
	// Offset of the chunk header.
	start: number;
	dataStart: number;
	// The declared size, clamped to the file.
	size: number;
	// Where the next chunk begins (pad byte included).
	next: number;
}

export interface Form {
	// RIFF/FORM header: the form type ("WAVE", "AIFF", "AIFC").
	type: string;
	// End of the form's chunks (declared by the header, clamped to the file).
	end: number;
	chunks: Chunk[];
}

export async function readForm(
	fh: FileHandle,
	size: number,
	be: boolean,
): Promise<Form | null> {
	const win = new Window(fh, size);
	const head = await win.read(0, 12);
	if (head.length < 12) return null;
	let declared = be ? head.readUInt32BE(4) : head.readUInt32LE(4);
	declared += 8;
	const end = declared < 12 || declared > size ? size : declared;
	const chunks: Chunk[] = [];
	let at = 12;
	while (at + 8 <= end) {
		const h = await win.read(at, 8);
		if (h.length < 8) break;
		const declaredSize = be ? h.readUInt32BE(4) : h.readUInt32LE(4);
		const dataStart = at + 8;
		const clamped = Math.min(declaredSize, end - dataStart);
		chunks.push({
			id: h.toString("latin1", 0, 4),
			start: at,
			dataStart,
			size: clamped,
			next: dataStart + declaredSize + (declaredSize & 1),
		});
		at = dataStart + declaredSize + (declaredSize & 1);
	}
	return { type: head.toString("latin1", 8, 12), end, chunks };
}

export interface IffSpec {
	name: string;
	extensions: readonly string[];
	be: boolean;
	sniff: (head: Buffer) => boolean;
	// Chunk ids (compared case-insensitively) that hold the ID3 tag, and the id a new
	// chunk gets.
	id3Ids: readonly string[];
	newId: string;
	audio(fh: FileHandle, form: Form, size: number): Promise<AudioInfo>;
	payload(form: Form): AudioPayload | null;
	// Tags the container keeps outside ID3 (WAV's LIST/INFO): read when there is no
	// ID3 chunk, and used to seed the first ID3 tag written.
	legacy?(fh: FileHandle, form: Form): Promise<Partial<TrackTags>>;
}

const emptyTags = (): TrackTags => ({
	title: null,
	artist: null,
	albumArtist: null,
	album: null,
	genre: null,
	year: null,
	label: null,
	isrc: null,
	bpm: null,
	key: null,
	comment: null,
	rating: 0,
	energy: null,
	remixer: null,
});

export function defineIff(spec: IffSpec): TagFormat {
	const findId3 = (form: Form): Chunk | undefined =>
		form.chunks.find((c) => spec.id3Ids.includes(c.id.toLowerCase()));

	const open_ = async (fh: FileHandle, size: number): Promise<Form> => {
		const form = await readForm(fh, size, spec.be);
		if (!form || !spec.sniff(await readAt(fh, 0, 16)))
			throw new Error(`not a ${spec.name} file`);
		return form;
	};

	async function readFrom(
		fh: FileHandle,
		size: number,
	): Promise<TagReadResult> {
		const form = await open_(fh, size);
		const audio = await spec.audio(fh, form, size);
		const chunk = findId3(form);
		if (chunk) {
			const tag = await readId3(
				fh,
				chunk.dataStart + chunk.size,
				(id) => wantedOnRead(id),
				chunk.dataStart,
			);
			const { hasArt, ...tags } = readFrames(tag);
			return { tags, audio, hasArt };
		}
		const legacy = spec.legacy ? await spec.legacy(fh, form) : {};
		return { tags: { ...emptyTags(), ...legacy }, audio, hasArt: false };
	}

	async function probeFrom(fh: FileHandle, size: number): Promise<AudioInfo> {
		return spec.audio(fh, await open_(fh, size), size);
	}

	async function payloadOf(
		fh: FileHandle,
		size: number,
	): Promise<AudioPayload> {
		const form = await readForm(fh, size, spec.be);
		const payload = form ? spec.payload(form) : null;
		return payload ?? { start: 0, end: size, found: false };
	}

	async function pictureOf(
		fh: FileHandle,
		size: number,
	): Promise<EmbeddedPicture | null> {
		const form = await open_(fh, size);
		const chunk = findId3(form);
		return chunk
			? id3Picture(fh, chunk.dataStart + chunk.size, chunk.dataStart)
			: null;
	}

	async function write(path: string, patch: TagPatch): Promise<void> {
		const fh = await open(path, "r+");
		try {
			const { size } = await fh.stat();
			const form = await open_(fh, size);
			const chunk = findId3(form);

			let tag: Id3Tag | null = null;
			if (chunk)
				tag = await readId3(
					fh,
					chunk.dataStart + chunk.size,
					() => true,
					chunk.dataStart,
				);
			const version: 3 | 4 = tag?.version === 4 ? 4 : 3;
			const frames: Id3Frame[] = convert(
				tag?.frames ?? [],
				tag?.version ?? 3,
				version,
			);
			if (!chunk && spec.legacy) {
				const legacy = await spec.legacy(fh, form);
				// A first tag starts from what the file already said in its old place.
				apply(frames, version, legacy as TagPatch);
			}
			apply(frames, version, patch);

			// Fits when the tag, padded, is exactly the chunk it replaces.
			if (chunk) {
				const exact = serializeId3(version, frames, chunk.size, 0);
				if (exact.length === chunk.size) {
					await writeAll(fh, exact, chunk.dataStart);
					return;
				}
			}
			const fresh = serializeId3(version, frames, null, PADDING);
			const head = Buffer.alloc(8);
			head.write(chunk?.id ?? spec.newId, 0, "latin1");
			if (spec.be) head.writeUInt32BE(fresh.length, 4);
			else head.writeUInt32LE(fresh.length, 4);
			const entry = Buffer.concat([
				head,
				fresh,
				Buffer.alloc(fresh.length & 1),
			]);

			const sizeField = (end: number): Buffer => {
				const field = Buffer.alloc(4);
				if (spec.be) field.writeUInt32BE(end - 8);
				else field.writeUInt32LE(end - 8);
				return field;
			};
			const last = form.chunks[form.chunks.length - 1];
			const isLast = chunk === undefined || chunk === last;

			if (isLast && form.end === size) {
				// The tag is (or goes) at the end of the file: written there, after the
				// pad byte an odd final chunk may be missing.
				const tailStart = chunk
					? chunk.start
					: last
						? last.dataStart + last.size
						: 12;
				const lead = Buffer.alloc(tailStart & 1);
				const end = tailStart + lead.length + entry.length;
				await writeAll(fh, Buffer.concat([lead, entry]), tailStart);
				await fh.truncate(end);
				await writeAll(fh, sizeField(end), 4);
				return;
			}

			// Anywhere else: a copy with the tag chunk moved to the end.
			const header = await readAt(fh, 0, 12);
			const before: Piece = chunk
				? { from: 12, to: chunk.start }
				: { from: 12, to: form.end };
			const after: Piece | null = chunk
				? { from: Math.min(chunk.next, form.end), to: form.end }
				: null;
			let length = before.to - before.from + 12;
			if (after && after.to > after.from) length += after.to - after.from;
			const pad = Buffer.alloc(length & 1);
			length += pad.length + entry.length;
			sizeField(length).copy(header, 4);
			const pieces: Piece[] = [header, before];
			if (after && after.to > after.from) pieces.push(after);
			pieces.push(pad, entry);
			if (form.end < size) pieces.push({ from: form.end, to: size });
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

	return {
		name: spec.name,
		extensions: spec.extensions,
		sniff: spec.sniff,
		read,
		write,
		readFrom,
		probeFrom,
		payloadOf,
		pictureOf,
	};
}
