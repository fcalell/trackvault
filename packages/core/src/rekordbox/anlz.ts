// Rekordbox ANLZ analysis files (.DAT / .EXT / .2EX): pure Buffer parsing.
//
// Layout (Deep Symmetry "Rekordbox Export Structure Analysis" + pyrekordbox structs):
//   file header "PMAI": fourcc, lenHeader (usually 28), lenFile, then 16 unknown bytes
//   tags, back to back, each: fourcc(4) lenHeader(4) lenTag(4) body...; the next tag
//   starts at tagStart + lenTag. All integers are big-endian.
//
// Nothing here touches the disk or the database.

export interface AnlzTagRef {
	type: string;
	offset: number;
	lenHeader: number;
	lenTag: number;
}

export interface AnlzBeat {
	// 1 to 4, the beat's position in its bar.
	beat: number;
	bpm: number;
	timeMs: number;
}

export interface AnlzCue {
	// 0 is a memory cue, 1.. a hot cue (1 = A).
	hotCue: number;
	type: "cue" | "loop";
	timeMs: number;
	loopTimeMs: number | null;
	// Only in PCO2 (.EXT) entries.
	comment: string | null;
	colorId: number | null;
	rgb: [number, number, number] | null;
}

export interface WaveformPreview {
	source: "PWV5" | "PWV3" | "PWAV";
	// 0..1, one value per column, loudest sample of the column's window.
	peaks: number[];
	// Packed 0xRRGGBB per column, only for the colour source (PWV5).
	colors: number[] | null;
}

export interface AnlzSummary {
	path: string | null;
	beatgrid: AnlzBeat[];
	cues: AnlzCue[];
	tags: AnlzTagRef[];
}

const MAGIC = "PMAI";

function fourcc(buf: Buffer, at: number): string {
	return buf.toString("latin1", at, at + 4);
}

// Tag table of a file. Stops quietly at a truncated or malformed tag, so a
// half-written file yields the tags before the damage.
export function listTags(buf: Buffer): AnlzTagRef[] {
	if (buf.length < 28 || fourcc(buf, 0) !== MAGIC) {
		throw new Error("not an ANLZ file (missing PMAI header)");
	}
	const tags: AnlzTagRef[] = [];
	let offset = buf.readUInt32BE(4);
	while (offset + 12 <= buf.length) {
		const lenHeader = buf.readUInt32BE(offset + 4);
		const lenTag = buf.readUInt32BE(offset + 8);
		if (lenTag < 12 || lenHeader < 12 || offset + lenTag > buf.length) break;
		tags.push({ type: fourcc(buf, offset), offset, lenHeader, lenTag });
		offset += lenTag;
	}
	return tags;
}

function find(tags: AnlzTagRef[], type: string): AnlzTagRef | undefined {
	return tags.find((t) => t.type === type);
}

// PPTH: the audio file's path, UTF-16BE with a trailing NUL. Rekordbox writes it
// with "/" separators.
export function parsePath(buf: Buffer, tag: AnlzTagRef): string {
	const len = buf.readUInt32BE(tag.offset + 12);
	const start = tag.offset + tag.lenHeader;
	const end = Math.min(start + len, tag.offset + tag.lenTag);
	let text = utf16be(buf, start, end);
	const nul = text.indexOf("\0");
	if (nul >= 0) text = text.slice(0, nul);
	return text;
}

function utf16be(buf: Buffer, start: number, end: number): string {
	const length = (end - start) & ~1;
	const copy = Buffer.from(buf.subarray(start, start + length));
	copy.swap16();
	return copy.toString("utf16le");
}

// PQTZ: 8 bytes per beat: beat-in-bar u16, tempo u16 (BPM x 100), time u32 (ms).
export function parseBeatgrid(buf: Buffer, tag: AnlzTagRef): AnlzBeat[] {
	const count = buf.readUInt32BE(tag.offset + 20);
	const start = tag.offset + tag.lenHeader;
	const max = Math.floor((tag.offset + tag.lenTag - start) / 8);
	const n = Math.min(count, max);
	const beats: AnlzBeat[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const at = start + i * 8;
		beats[i] = {
			beat: buf.readUInt16BE(at),
			bpm: buf.readUInt16BE(at + 2) / 100,
			timeMs: buf.readUInt32BE(at + 4),
		};
	}
	return beats;
}

// PCOB: fixed 56-byte "PCPT" entries; `time` and `loop_time` in ms, 0xFFFFFFFF
// for "no loop end". status 0 = disabled entry.
function parsePcob(buf: Buffer, tag: AnlzTagRef): AnlzCue[] {
	const count = buf.readUInt16BE(tag.offset + 18);
	const cues: AnlzCue[] = [];
	let at = tag.offset + tag.lenHeader;
	const end = tag.offset + tag.lenTag;
	for (let i = 0; i < count && at + 56 <= end; i++) {
		const lenEntry = buf.readUInt32BE(at + 8);
		if (fourcc(buf, at) !== "PCPT" || lenEntry < 56) break;
		const status = buf.readUInt32BE(at + 16);
		const loopRaw = buf.readUInt32BE(at + 36);
		if (status !== 0) {
			cues.push({
				hotCue: buf.readUInt32BE(at + 12),
				type: buf.readUInt8(at + 28) === 2 ? "loop" : "cue",
				timeMs: buf.readUInt32BE(at + 32),
				loopTimeMs: loopRaw === 0xffffffff ? null : loopRaw,
				comment: null,
				colorId: null,
				rgb: null,
			});
		}
		at += lenEntry;
	}
	return cues;
}

// PCO2: "PCP2" entries with a UTF-16BE comment and a colour, the form the .EXT
// file carries (and Rekordbox 6+ prefers).
function parsePco2(buf: Buffer, tag: AnlzTagRef): AnlzCue[] {
	const count = buf.readUInt16BE(tag.offset + 16);
	const cues: AnlzCue[] = [];
	let at = tag.offset + tag.lenHeader;
	const end = tag.offset + tag.lenTag;
	for (let i = 0; i < count && at + 44 <= end; i++) {
		const lenEntry = buf.readUInt32BE(at + 8);
		if (fourcc(buf, at) !== "PCP2" || lenEntry < 48 || at + lenEntry > end)
			break;
		const lenComment = buf.readUInt32BE(at + 40);
		const loopRaw = buf.readUInt32BE(at + 24);
		let comment: string | null = null;
		let rgb: [number, number, number] | null = null;
		if (lenComment > 0 && 44 + lenComment + 4 <= lenEntry) {
			const text = utf16be(buf, at + 44, at + 44 + lenComment);
			const nul = text.indexOf("\0");
			comment = nul >= 0 ? text.slice(0, nul) : text;
			const c = at + 44 + lenComment;
			rgb = [buf[c + 1] ?? 0, buf[c + 2] ?? 0, buf[c + 3] ?? 0];
		} else if (lenComment === 0 && 48 <= lenEntry) {
			rgb = [buf[at + 45] ?? 0, buf[at + 46] ?? 0, buf[at + 47] ?? 0];
		}
		cues.push({
			hotCue: buf.readUInt32BE(at + 12),
			type: buf.readUInt8(at + 16) === 2 ? "loop" : "cue",
			timeMs: buf.readUInt32BE(at + 20),
			loopTimeMs: loopRaw === 0xffffffff ? null : loopRaw,
			comment: comment === "" ? null : comment,
			colorId: buf.readUInt8(at + 28),
			rgb,
		});
		at += lenEntry;
	}
	return cues;
}

// Every cue of the file. PCO2 (.EXT) wins when present; otherwise the PCOB
// lists (one memory list, one hot-cue list) of the .DAT.
export function parseCues(buf: Buffer, tags = listTags(buf)): AnlzCue[] {
	const pco2 = tags.filter((t) => t.type === "PCO2");
	if (pco2.length > 0) return pco2.flatMap((t) => parsePco2(buf, t));
	return tags
		.filter((t) => t.type === "PCOB")
		.flatMap((t) => parsePcob(buf, t));
}

export function parseAnlz(buf: Buffer): AnlzSummary {
	const tags = listTags(buf);
	const ppth = find(tags, "PPTH");
	const pqtz = find(tags, "PQTZ");
	return {
		path: ppth ? parsePath(buf, ppth) : null,
		beatgrid: pqtz ? parseBeatgrid(buf, pqtz) : [],
		cues: parseCues(buf, tags),
		tags,
	};
}

// Bucket-max reduction of `values` (already 0..1) down to `points` columns.
function reduce(values: Float32Array, points: number): number[] {
	const n = values.length;
	if (n <= points) return Array.from(values, round3);
	const out = new Array<number>(points);
	for (let i = 0; i < points; i++) {
		const from = Math.floor((i * n) / points);
		const to = Math.max(from + 1, Math.floor(((i + 1) * n) / points));
		let peak = 0;
		for (let j = from; j < to; j++) peak = Math.max(peak, values[j] ?? 0);
		out[i] = round3(peak);
	}
	return out;
}

function round3(v: number): number {
	return Math.round(v * 1000) / 1000;
}

export interface WaveformOptions {
	// Columns of the result (default 400, the size of the .DAT preview).
	points?: number;
	// Also return the per-column colour when the file has the colour waveform.
	colors?: boolean;
}

// A waveform for a UI component, from the richest tag the file has:
// PWV5 (.EXT, colour detail, 150 columns/s, 16 bit: r3 g3 b3 height5 + 2 spare),
// else PWV3 (.EXT, 1 byte/column, height in the low 5 bits),
// else PWAV (.DAT, the 400-column preview, height in the low 5 bits).
// Returns null when the file has none of them.
export function extractWaveformPreview(
	buf: Buffer,
	options: WaveformOptions = {},
): WaveformPreview | null {
	const points = Math.max(1, options.points ?? 400);
	const tags = listTags(buf);

	const pwv5 = find(tags, "PWV5");
	if (pwv5) {
		const count = buf.readUInt32BE(pwv5.offset + 16);
		const start = pwv5.offset + pwv5.lenHeader;
		const n = Math.min(
			count,
			Math.floor((pwv5.offset + pwv5.lenTag - start) / 2),
		);
		const heights = new Float32Array(n);
		const rgb = options.colors ? new Uint32Array(n) : null;
		for (let i = 0; i < n; i++) {
			const v = buf.readUInt16BE(start + i * 2);
			heights[i] = ((v >> 2) & 0x1f) / 31;
			if (rgb) {
				const r = Math.round((((v >> 13) & 7) * 255) / 7);
				const g = Math.round((((v >> 10) & 7) * 255) / 7);
				const b = Math.round((((v >> 7) & 7) * 255) / 7);
				rgb[i] = (r << 16) | (g << 8) | b;
			}
		}
		const peaks = reduce(heights, points);
		let colors: number[] | null = null;
		if (rgb) {
			// The colour of a column is the one of its tallest sample.
			colors = new Array<number>(Math.min(points, n));
			for (let i = 0; i < colors.length; i++) {
				const from = Math.floor((i * n) / colors.length);
				const to = Math.max(
					from + 1,
					Math.floor(((i + 1) * n) / colors.length),
				);
				let best = from;
				for (let j = from; j < to; j++) {
					if ((heights[j] ?? 0) > (heights[best] ?? 0)) best = j;
				}
				colors[i] = rgb[best] ?? 0;
			}
		}
		return { source: "PWV5", peaks, colors };
	}

	for (const type of ["PWV3", "PWAV"] as const) {
		const tag = find(tags, type);
		if (!tag) continue;
		// PWV3: lenEntryBytes, lenEntries, 0x960000. PWAV: lenPreview, 0x10000.
		const count =
			type === "PWV3"
				? buf.readUInt32BE(tag.offset + 16)
				: buf.readUInt32BE(tag.offset + 12);
		const start = tag.offset + tag.lenHeader;
		const n = Math.min(count, tag.offset + tag.lenTag - start);
		const heights = new Float32Array(n);
		for (let i = 0; i < n; i++)
			heights[i] = ((buf[start + i] ?? 0) & 0x1f) / 31;
		return { source: type, peaks: reduce(heights, points), colors: null };
	}
	return null;
}

// Rewrites the PPTH of an ANLZ file (a relinked track): the same bytes with the
// path tag rebuilt and the lengths fixed. Throws when the file has no PPTH.
export function withAnlzPath(buf: Buffer, newPath: string): Buffer {
	const tag = find(listTags(buf), "PPTH");
	if (!tag) throw new Error("ANLZ file has no PPTH tag");
	const utf = Buffer.from(`${newPath}\0`, "utf16le");
	utf.swap16();
	const header = Buffer.from(
		buf.subarray(tag.offset, tag.offset + tag.lenHeader),
	);
	const lenTag = tag.lenHeader + utf.length;
	header.writeUInt32BE(lenTag, 8);
	header.writeUInt32BE(utf.length, 12);
	const out = Buffer.concat([
		buf.subarray(0, tag.offset),
		header,
		utf,
		buf.subarray(tag.offset + tag.lenTag),
	]);
	out.writeUInt32BE(out.length, 8);
	return out;
}
