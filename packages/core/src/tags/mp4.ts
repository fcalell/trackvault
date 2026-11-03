// M4A (MP4 audio: AAC, ALAC): the iTunes metadata in moov/udta/meta/ilst and the
// audio properties from mvhd/mdhd/stsd. A read walks the atom headers by seeking and
// reads only the atoms it needs, so neither the sample tables nor a cover are loaded.
// A write rebuilds moov and puts it back where it fits, cheapest first:
//   1. inside the old moov, the meta atom's own `free` padding absorbing the change;
//   2. into a `free` atom next to moov, which moves nothing else;
//   3. growing moov: in place when it is the last atom, else through a temporary copy
//      with every stco/co64 chunk offset behind moov shifted by the growth.

import { type FileHandle, open } from "node:fs/promises";
import { imageInfo } from "../art/image.ts";
import {
	bpmText,
	parseNumber,
	readAt,
	rewriteFile,
	starsOfRating,
	Window,
	writeAll,
	yearOfText,
} from "./io.ts";
import type {
	AudioInfo,
	AudioPayload,
	EmbeddedPicture,
	TagFormat,
	TagPatch,
	TagReadResult,
	TrackTags,
} from "./types.ts";

const PADDING = 4096;
const ITUNES = "com.apple.iTunes";

interface Reader {
	read(position: number, length: number): Promise<Buffer>;
}

class BufferReader implements Reader {
	readonly buf: Buffer;
	constructor(buf: Buffer) {
		this.buf = buf;
	}
	async read(position: number, length: number): Promise<Buffer> {
		return this.buf.subarray(position, position + length);
	}
}

interface Box {
	type: string;
	start: number;
	// Header length (8, or 16 with a 64-bit size).
	hdr: number;
	end: number;
}

async function listBoxes(r: Reader, from: number, to: number): Promise<Box[]> {
	const out: Box[] = [];
	let pos = from;
	while (pos + 8 <= to) {
		const h = await r.read(pos, 16);
		if (h.length < 8) break;
		let size = h.readUInt32BE(0);
		let hdr = 8;
		const type = h.toString("latin1", 4, 8);
		if (size === 1) {
			if (h.length < 16) break;
			size = h.readUInt32BE(8) * 2 ** 32 + h.readUInt32BE(12);
			hdr = 16;
		} else if (size === 0) size = to - pos;
		if (size < hdr) break;
		out.push({ type, start: pos, hdr, end: Math.min(pos + size, to) });
		pos += size;
	}
	return out;
}

const childrenOf = (r: Reader, box: Box, extra = 0): Promise<Box[]> =>
	listBoxes(r, box.start + box.hdr + extra, box.end);

async function dig(
	r: Reader,
	box: Box,
	...path: string[]
): Promise<Box | null> {
	let at: Box = box;
	for (const type of path) {
		const next = (await childrenOf(r, at)).find((b) => b.type === type);
		if (!next) return null;
		at = next;
	}
	return at;
}

function mk(type: string, ...parts: Buffer[]): Buffer {
	const body = Buffer.concat(parts);
	const head = Buffer.alloc(8);
	head.writeUInt32BE(8 + body.length);
	head.write(type, 4, "latin1");
	return Buffer.concat([head, body]);
}

// --- ilst items -----------------------------------------------------------

interface ItemInfo {
	type: string;
	mean: string;
	name: string;
	// The data atoms: type indicator (1 text, 13 jpeg, 14 png, 21 integer) and bytes.
	data: Array<{ kind: number; bytes: Buffer }>;
}

function itemInfo(raw: Buffer): ItemInfo {
	const info: ItemInfo = {
		type: raw.toString("latin1", 4, 8),
		mean: "",
		name: "",
		data: [],
	};
	let at = 8;
	while (at + 8 <= raw.length) {
		const size = raw.readUInt32BE(at);
		const type = raw.toString("latin1", at + 4, at + 8);
		if (size < 8 || at + size > raw.length) break;
		if (type === "mean") info.mean = raw.toString("utf8", at + 12, at + size);
		else if (type === "name")
			info.name = raw.toString("utf8", at + 12, at + size);
		else if (type === "data" && size >= 16)
			info.data.push({
				kind: raw.readUInt32BE(at + 8) & 0xffffff,
				bytes: raw.subarray(at + 16, at + size),
			});
		at += size;
	}
	return info;
}

const isFree = (i: ItemInfo, names: readonly string[]): boolean =>
	i.type === "----" &&
	i.mean.toLowerCase() === ITUNES.toLowerCase() &&
	names.includes(i.name.toLowerCase());

const hasType = (i: ItemInfo, ...types: string[]): boolean =>
	types.includes(i.type);

function textOf(i: ItemInfo | undefined): string | null {
	if (!i) return null;
	const values = i.data
		.filter((d) => d.kind === 1 || d.kind === 0)
		.map((d) => d.bytes.toString("utf8").trim())
		.filter((v) => v !== "");
	return values.length > 0 ? values.join("; ") : null;
}

function intOf(i: ItemInfo | undefined): number | null {
	const d = i?.data[0];
	if (!d) return null;
	if (d.kind === 1) return parseNumber(d.bytes.toString("utf8"));
	if (d.bytes.length === 1) return d.bytes.readUInt8(0);
	if (d.bytes.length === 2) return d.bytes.readUInt16BE(0);
	if (d.bytes.length === 4) return d.bytes.readUInt32BE(0);
	return null;
}

const ID3_GENRES =
	"Blues,Classic Rock,Country,Dance,Disco,Funk,Grunge,Hip-Hop,Jazz,Metal,New Age,Oldies,Other,Pop,R&B,Rap,Reggae,Rock,Techno,Industrial,Alternative,Ska,Death Metal,Pranks,Soundtrack,Euro-Techno,Ambient,Trip-Hop,Vocal,Jazz+Funk,Fusion,Trance,Classical,Instrumental,Acid,House,Game,Sound Clip,Gospel,Noise,AlternRock,Bass,Soul,Punk,Space,Meditative,Instrumental Pop,Instrumental Rock,Ethnic,Gothic,Darkwave,Techno-Industrial,Electronic,Pop-Folk,Eurodance,Dream,Southern Rock,Comedy,Cult,Gangsta,Top 40,Christian Rap,Pop/Funk,Jungle,Native American,Cabaret,New Wave,Psychadelic,Rave,Showtunes,Trailer,Lo-Fi,Tribal,Acid Punk,Acid Jazz,Polka,Retro,Musical,Rock & Roll,Hard Rock".split(
		",",
	);

const FREE_KEY = ["initialkey", "key", "initial key"];
const FREE_LABEL = ["label", "organization", "publisher"];
const FREE_ENERGY = ["energylevel", "energy"];
const FREE_REMIXER = ["remixer", "mixartist"];

function tagsOf(items: ItemInfo[]): TrackTags {
	const std = (type: string) => items.find((i) => i.type === type);
	const free = (names: readonly string[]) =>
		items.find((i) => isFree(i, names));
	const genre =
		textOf(std("©gen")) ??
		(() => {
			const n = intOf(std("gnre"));
			return n && ID3_GENRES[n - 1] ? (ID3_GENRES[n - 1] as string) : null;
		})();
	const energy = parseNumber(textOf(free(FREE_ENERGY)));
	const rated = parseNumber(textOf(free(["rating"])));
	const bpm = parseNumber(textOf(free(["bpm"]))) ?? intOf(std("tmpo"));
	return {
		title: textOf(std("©nam")),
		artist: textOf(std("©ART")),
		albumArtist: textOf(std("aART")),
		album: textOf(std("©alb")),
		genre,
		year: yearOfText(textOf(std("©day"))),
		label: textOf(free(FREE_LABEL)),
		isrc: textOf(free(["isrc"])),
		bpm: bpm && bpm > 0 ? bpm : null,
		key: textOf(free(FREE_KEY)),
		comment: textOf(std("©cmt")),
		rating: rated === null ? 0 : starsOfRating(rated),
		energy:
			energy !== null && energy >= 1 && energy <= 10
				? Math.round(energy)
				: null,
		remixer: textOf(free(FREE_REMIXER)),
	};
}

const WANTED_STD = new Set([
	"©nam",
	"©ART",
	"aART",
	"©alb",
	"©gen",
	"gnre",
	"©day",
	"©cmt",
	"tmpo",
]);
const WANTED_FREE = [
	"bpm",
	"isrc",
	"rating",
	...FREE_KEY,
	...FREE_LABEL,
	...FREE_ENERGY,
	...FREE_REMIXER,
];

// --- the file's structure -------------------------------------------------

interface Meta {
	// The atoms from moov down to the one holding meta.
	chain: Box[];
	meta: Box;
	ilst: Box | null;
}

// moov/udta/meta (or moov/meta). Offsets are the reader's.
async function findMeta(r: Reader, moov: Box): Promise<Meta | null> {
	let found: Meta | null = null;
	const consider = async (chain: Box[], parent: Box) => {
		for (const meta of (await childrenOf(r, parent)).filter(
			(b) => b.type === "meta",
		)) {
			const ilst =
				(await childrenOf(r, meta, 4)).find((b) => b.type === "ilst") ?? null;
			if (!found || (!found.ilst && ilst)) found = { chain, meta, ilst };
		}
	};
	await consider([moov], moov);
	for (const udta of (await childrenOf(r, moov)).filter(
		(b) => b.type === "udta",
	))
		await consider([moov, udta], udta);
	return found;
}

interface AudioTrack {
	timescale: number;
	duration: number;
	entry: Buffer;
}

async function audioTrack(r: Reader, moov: Box): Promise<AudioTrack | null> {
	for (const trak of (await childrenOf(r, moov)).filter(
		(b) => b.type === "trak",
	)) {
		const mdia = await dig(r, trak, "mdia");
		if (!mdia) continue;
		const parts = await childrenOf(r, mdia);
		const hdlr = parts.find((b) => b.type === "hdlr");
		const mdhd = parts.find((b) => b.type === "mdhd");
		if (!hdlr || !mdhd) continue;
		const kind = await r.read(hdlr.start + hdlr.hdr + 8, 4);
		if (kind.toString("latin1") !== "soun") continue;
		const h = await r.read(mdhd.start + mdhd.hdr, 32);
		const version = h[0];
		const timescale = version === 1 ? h.readUInt32BE(20) : h.readUInt32BE(12);
		const duration =
			version === 1
				? h.readUInt32BE(24) * 2 ** 32 + h.readUInt32BE(28)
				: h.readUInt32BE(16);
		const stsd = await dig(r, mdia, "minf", "stbl", "stsd");
		const entry = stsd
			? await r.read(stsd.start + stsd.hdr + 8, 128)
			: Buffer.alloc(0);
		return { timescale, duration, entry };
	}
	return null;
}

function audioOf(
	track: AudioTrack | null,
	movie: { timescale: number; duration: number } | null,
	payload: number,
): AudioInfo {
	const info: AudioInfo = {
		format: "m4a",
		codec: "",
		bitrateKbps: 0,
		sampleRate: 0,
		channels: 0,
		bitDepth: 0,
		durationMs: 0,
	};
	let seconds = 0;
	if (track && track.timescale > 0) seconds = track.duration / track.timescale;
	else if (movie && movie.timescale > 0)
		seconds = movie.duration / movie.timescale;
	info.durationMs = Math.round(seconds * 1000);
	if (seconds > 0)
		info.bitrateKbps = Math.round((payload * 8) / seconds / 1000);
	const e = track?.entry;
	if (e && e.length >= 36) {
		const type = e.toString("latin1", 4, 8);
		info.codec = type === "mp4a" ? "aac" : type.trim();
		info.channels = e.readUInt16BE(8 + 16);
		info.sampleRate = e.readUInt16BE(8 + 24);
		const version = e.readUInt16BE(16);
		if (type === "alac") {
			// The inner alac atom: version/flags, then the specific config.
			const childAt = 8 + 28 + (version === 1 ? 16 : 0);
			let at = childAt;
			while (at + 8 <= e.length) {
				const size = e.readUInt32BE(at);
				if (size < 8) break;
				if (
					e.toString("latin1", at + 4, at + 8) === "alac" &&
					at + 8 + 28 <= e.length
				) {
					const c = at + 8 + 4;
					info.bitDepth = e.readUInt8(c + 5);
					info.channels = e.readUInt8(c + 9);
					info.sampleRate = e.readUInt32BE(c + 20);
					break;
				}
				at += size;
			}
		}
	}
	return info;
}

async function mvhdOf(
	r: Reader,
	moov: Box,
): Promise<{ timescale: number; duration: number } | null> {
	const mvhd = (await childrenOf(r, moov)).find((b) => b.type === "mvhd");
	if (!mvhd) return null;
	const h = await r.read(mvhd.start + mvhd.hdr, 32);
	if (h.length < 20) return null;
	return h[0] === 1
		? {
				timescale: h.readUInt32BE(20),
				duration: h.readUInt32BE(24) * 2 ** 32 + h.readUInt32BE(28),
			}
		: { timescale: h.readUInt32BE(12), duration: h.readUInt32BE(16) };
}

interface Scan {
	top: Box[];
	moov: Box | null;
	mdat: Box | null;
}

async function scanTop(win: Window, size: number): Promise<Scan> {
	const top = await listBoxes(win, 0, size);
	let mdat: Box | null = null;
	for (const b of top)
		if (b.type === "mdat" && (!mdat || b.end - b.start > mdat.end - mdat.start))
			mdat = b;
	return { top, moov: top.find((b) => b.type === "moov") ?? null, mdat };
}

async function readFrom(fh: FileHandle, size: number): Promise<TagReadResult> {
	const win = new Window(fh, size);
	const { moov, mdat } = await scanTop(win, size);
	if (!moov) throw new Error("not an M4A file (no moov atom)");
	const meta = await findMeta(win, moov);
	const items: ItemInfo[] = [];
	let hasArt = false;
	if (meta?.ilst) {
		for (const box of await childrenOf(win, meta.ilst)) {
			if (box.type === "covr") {
				if (box.end - box.start > 40) hasArt = true;
				continue;
			}
			const length = box.end - box.start;
			if (box.type === "----") {
				const head = itemInfo(await win.read(box.start, Math.min(length, 256)));
				if (!isFree(head, WANTED_FREE)) continue;
			} else if (!WANTED_STD.has(box.type)) continue;
			if (length > 1 << 20) continue;
			items.push(itemInfo(await win.read(box.start, length)));
		}
	}
	const payload = mdat ? mdat.end - mdat.start - mdat.hdr : 0;
	return {
		tags: tagsOf(items),
		audio: audioOf(
			await audioTrack(win, moov),
			await mvhdOf(win, moov),
			payload,
		),
		hasArt,
	};
}

async function probeFrom(fh: FileHandle, size: number): Promise<AudioInfo> {
	const win = new Window(fh, size);
	const { moov, mdat } = await scanTop(win, size);
	if (!moov) return audioOf(null, null, 0);
	return audioOf(
		await audioTrack(win, moov),
		await mvhdOf(win, moov),
		mdat ? mdat.end - mdat.start - mdat.hdr : 0,
	);
}

async function payloadOf(fh: FileHandle, size: number): Promise<AudioPayload> {
	const { mdat } = await scanTop(new Window(fh, size), size);
	if (!mdat) return { start: 0, end: size, found: false };
	return {
		start: mdat.start + mdat.hdr,
		end: mdat.end,
		found: mdat.end > mdat.start + mdat.hdr,
	};
}

async function pictureOf(
	fh: FileHandle,
	size: number,
): Promise<EmbeddedPicture | null> {
	const win = new Window(fh, size);
	const { moov } = await scanTop(win, size);
	if (!moov) return null;
	const meta = await findMeta(win, moov);
	if (!meta?.ilst) return null;
	const covr = (await childrenOf(win, meta.ilst)).find(
		(b) => b.type === "covr",
	);
	if (!covr) return null;
	const info = itemInfo(await readAt(fh, covr.start, covr.end - covr.start));
	const first = info.data.find((d) => d.bytes.length > 0);
	if (!first) return null;
	const sniffed = imageInfo(first.bytes);
	return {
		mime: sniffed?.mime ?? (first.kind === 14 ? "image/png" : "image/jpeg"),
		data: new Uint8Array(first.bytes),
	};
}

// --- writing --------------------------------------------------------------

interface Item {
	raw: Buffer;
	info: ItemInfo;
}

const dataBox = (kind: number, bytes: Buffer): Buffer => {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(kind);
	return mk("data", head, bytes);
};

const textItem = (type: string, value: string): Item => {
	const raw = mk(type, dataBox(1, Buffer.from(value, "utf8")));
	return { raw, info: itemInfo(raw) };
};

const freeItem = (mean: string, name: string, value: string): Item => {
	const zero = Buffer.alloc(4);
	const raw = mk(
		"----",
		mk("mean", zero, Buffer.from(mean, "utf8")),
		mk("name", zero, Buffer.from(name, "utf8")),
		dataBox(1, Buffer.from(value, "utf8")),
	);
	return { raw, info: itemInfo(raw) };
};

function replace(
	items: Item[],
	match: (i: ItemInfo) => boolean,
	next: Item | null,
): void {
	const index = items.findIndex((i) => match(i.info));
	const kept = items.filter((i) => !match(i.info));
	if (next === null) {
		items.splice(0, items.length, ...kept);
		return;
	}
	const at = index === -1 ? kept.length : Math.min(index, kept.length);
	kept.splice(at, 0, next);
	items.splice(0, items.length, ...kept);
}

function setStd(
	items: Item[],
	type: string,
	value: string | null | undefined,
	...also: string[]
): void {
	if (value === undefined) return;
	replace(
		items,
		(i) => hasType(i, type, ...also),
		value === null || value === "" ? null : textItem(type, value),
	);
}

function setFree(
	items: Item[],
	names: readonly string[],
	fallback: string,
	value: string | null | undefined,
): void {
	if (value === undefined) return;
	const current = items.find((i) => isFree(i.info, names))?.info;
	replace(
		items,
		(i) => isFree(i, names),
		value === null || value === ""
			? null
			: freeItem(current?.mean || ITUNES, current?.name || fallback, value),
	);
}

function applyPatch(items: Item[], patch: TagPatch): void {
	setStd(items, "©nam", patch.title);
	setStd(items, "©ART", patch.artist);
	setStd(items, "aART", patch.albumArtist);
	setStd(items, "©alb", patch.album);
	setStd(items, "©gen", patch.genre, "gnre");
	setStd(items, "©cmt", patch.comment);
	setFree(items, FREE_LABEL, "LABEL", patch.label);
	setFree(items, ["isrc"], "ISRC", patch.isrc);
	setFree(items, FREE_REMIXER, "REMIXER", patch.remixer);
	setFree(items, FREE_KEY, "initialkey", patch.key);
	if (patch.energy !== undefined)
		setFree(
			items,
			FREE_ENERGY,
			"EnergyLevel",
			patch.energy === null ? null : String(patch.energy),
		);
	if (patch.year !== undefined) {
		const current = yearOfText(
			textOf(items.find((i) => hasType(i.info, "©day"))?.info),
		);
		if (current !== patch.year)
			setStd(items, "©day", patch.year === null ? null : String(patch.year));
	}
	if (patch.bpm !== undefined) {
		replace(items, (i) => hasType(i, "tmpo"), null);
		setFree(items, ["bpm"], "BPM", null);
		if (patch.bpm !== null) {
			const whole = Math.max(0, Math.min(65535, Math.round(patch.bpm)));
			const value = Buffer.alloc(2);
			value.writeUInt16BE(whole);
			const raw = mk("tmpo", dataBox(21, value));
			items.push({ raw, info: itemInfo(raw) });
			// tmpo holds whole numbers: a fractional tempo is kept in full beside it.
			if (!Number.isInteger(patch.bpm))
				setFree(items, ["bpm"], "BPM", bpmText(patch.bpm));
		}
	}
	if (patch.rating !== undefined) {
		const stars = Math.max(0, Math.min(5, Math.round(patch.rating)));
		const current = parseNumber(
			textOf(items.find((i) => isFree(i.info, ["rating"]))?.info),
		);
		const scale = current !== null && current > 0 && current <= 5 ? 1 : 20;
		setFree(
			items,
			["rating"],
			"RATING",
			stars === 0 ? null : String(stars * scale),
		);
	}
	if (patch.picture !== undefined) {
		replace(items, (i) => hasType(i, "covr"), null);
		if (patch.picture !== null) {
			const raw = mk(
				"covr",
				dataBox(
					patch.picture.mime === "image/png" ? 14 : 13,
					Buffer.from(patch.picture.data),
				),
			);
			items.push({ raw, info: itemInfo(raw) });
		}
	}
}

function hdlrMdir(): Buffer {
	return mk(
		"hdlr",
		Buffer.alloc(4),
		Buffer.alloc(4),
		Buffer.from("mdir", "latin1"),
		Buffer.from("appl", "latin1"),
		Buffer.alloc(8),
		Buffer.alloc(1),
	);
}

// Adds `delta` to the declared size of an atom inside `buf`.
function grow(buf: Buffer, box: Box, delta: number): void {
	if (box.hdr === 8) buf.writeUInt32BE(box.end - box.start + delta, box.start);
	else {
		const total = box.end - box.start + delta;
		buf.writeUInt32BE(Math.floor(total / 2 ** 32), box.start + 8);
		buf.writeUInt32BE(total % 2 ** 32, box.start + 12);
	}
}

// moov with the new item list in place; `pad` (0 or at least 8) is the size of the
// `free` atom that ends the meta atom.
async function rebuildMoov(
	old: Buffer,
	moov: Box,
	meta: Meta | null,
	items: readonly Item[],
	pad: number,
): Promise<Buffer> {
	const ilst = mk("ilst", ...items.map((i) => i.raw));
	const free = pad >= 8 ? mk("free", Buffer.alloc(pad - 8)) : Buffer.alloc(0);
	const r = new BufferReader(old);
	let out: Buffer;
	if (meta) {
		const kids = await childrenOf(r, meta.meta, 4);
		const parts: Buffer[] = [];
		let placed = false;
		let hasHandler = false;
		for (const kid of kids) {
			if (kid.type === "hdlr") hasHandler = true;
			if (kid.type === "ilst") {
				if (!placed) parts.push(ilst);
				placed = true;
				continue;
			}
			if (kid.type === "free" || kid.type === "skip") continue;
			parts.push(old.subarray(kid.start, kid.end));
		}
		if (!hasHandler) parts.unshift(hdlrMdir());
		if (!placed) parts.push(ilst);
		const fresh = mk("meta", Buffer.alloc(4), ...parts, free);
		out = Buffer.concat([
			old.subarray(0, meta.meta.start),
			fresh,
			old.subarray(meta.meta.end),
		]);
		const delta = fresh.length - (meta.meta.end - meta.meta.start);
		for (const box of meta.chain) grow(out, box, delta);
		return out;
	}
	const fresh = mk("meta", Buffer.alloc(4), hdlrMdir(), ilst, free);
	const udta = (await childrenOf(r, moov)).find((b) => b.type === "udta");
	if (udta) {
		out = Buffer.concat([
			old.subarray(0, udta.end),
			fresh,
			old.subarray(udta.end),
		]);
		grow(out, moov, fresh.length);
		grow(out, udta, fresh.length);
		return out;
	}
	const wrapped = mk("udta", fresh);
	out = Buffer.concat([
		old.subarray(0, moov.end),
		wrapped,
		old.subarray(moov.end),
	]);
	grow(out, moov, wrapped.length);
	return out;
}

// Adds `delta` to every chunk offset at or past `from` in the stco/co64 tables.
async function shiftOffsets(
	moov: Buffer,
	from: number,
	delta: number,
): Promise<void> {
	const r = new BufferReader(moov);
	const top = (await listBoxes(r, 0, moov.length))[0] as Box;
	for (const trak of (await childrenOf(r, top)).filter(
		(b) => b.type === "trak",
	)) {
		const stbl = await dig(r, trak, "mdia", "minf", "stbl");
		if (!stbl) continue;
		for (const table of (await childrenOf(r, stbl)).filter(
			(b) => b.type === "stco" || b.type === "co64",
		)) {
			const base = table.start + table.hdr;
			const count = moov.readUInt32BE(base + 4);
			const wide = table.type === "co64";
			for (let i = 0; i < count; i++) {
				const at = base + 8 + i * (wide ? 8 : 4);
				if (wide) {
					const value =
						moov.readUInt32BE(at) * 2 ** 32 + moov.readUInt32BE(at + 4);
					if (value < from) continue;
					const next = value + delta;
					moov.writeUInt32BE(Math.floor(next / 2 ** 32), at);
					moov.writeUInt32BE(next % 2 ** 32, at + 4);
				} else {
					const value = moov.readUInt32BE(at);
					if (value < from) continue;
					if (value + delta > 0xffffffff)
						throw new Error("chunk offset exceeds 32 bits");
					moov.writeUInt32BE(value + delta, at);
				}
			}
		}
	}
}

// The padding that leaves `rest` bytes of slack as a free atom of 0 or at least 8
// bytes, given the growth `diff` of moov before any padding.
function planSlack(
	slack: number,
	diff: number,
): { pad: number; rest: number } | null {
	const avail = slack - diff;
	if (avail < 0) return null;
	let pad = Math.min(PADDING, avail);
	let rest = avail - pad;
	if (rest > 0 && rest < 8) {
		pad += rest;
		rest = 0;
	}
	if (pad > 0 && pad < 8) return null;
	return { pad, rest };
}

async function write(path: string, patch: TagPatch): Promise<void> {
	const fh = await open(path, "r+");
	try {
		const { size } = await fh.stat();
		const win = new Window(fh, size);
		const { top, moov: at } = await scanTop(win, size);
		if (!at) throw new Error("not an M4A file (no moov atom)");
		const old = await readAt(fh, at.start, at.end - at.start);
		const r = new BufferReader(old);
		const moov = (await listBoxes(r, 0, old.length))[0] as Box;
		const meta = await findMeta(r, moov);

		const items: Item[] = [];
		if (meta?.ilst)
			for (const box of await childrenOf(r, meta.ilst)) {
				const raw = old.subarray(box.start, box.end);
				items.push({ raw, info: itemInfo(raw) });
			}
		applyPatch(items, patch);

		const bare = (await rebuildMoov(old, moov, meta, items, 0)).length;
		const diff = bare - old.length;

		// 1. Inside the old moov: same size, only the differing bytes are written.
		if (meta && (diff === 0 || diff <= -8)) {
			const next = await rebuildMoov(old, moov, meta, items, -diff);
			let first = 0;
			while (first < old.length && old[first] === next[first]) first++;
			let last = old.length;
			while (last > first && old[last - 1] === next[last - 1]) last--;
			if (last > first)
				await writeAll(fh, next.subarray(first, last), at.start + first);
			return;
		}

		// 2. A free atom beside moov.
		const index = top.indexOf(at);
		const before = top[index - 1];
		const after = top[index + 1];
		const isSlack = (b: Box | undefined): b is Box =>
			b !== undefined &&
			(b.type === "free" || b.type === "skip") &&
			b.hdr === 8;
		if (isSlack(after)) {
			const slack = after.end - after.start;
			const plan = planSlack(slack, diff);
			if (plan) {
				const moved = await rebuildMoov(old, moov, meta, items, plan.pad);
				const tail =
					plan.rest >= 8
						? mk("free", Buffer.alloc(plan.rest - 8))
						: Buffer.alloc(0);
				await writeAll(fh, Buffer.concat([moved, tail]), at.start);
				return;
			}
		}
		if (isSlack(before)) {
			const slack = before.end - before.start;
			const plan = planSlack(slack, diff);
			if (plan) {
				const moved = await rebuildMoov(old, moov, meta, items, plan.pad);
				const lead =
					plan.rest >= 8
						? mk("free", Buffer.alloc(plan.rest - 8))
						: Buffer.alloc(0);
				await writeAll(fh, Buffer.concat([lead, moved]), before.start);
				return;
			}
		}

		// 3. Grow moov, with padding for the next edits.
		const grown = await rebuildMoov(old, moov, meta, items, PADDING);
		if (at.end === size) {
			await writeAll(fh, grown, at.start);
			await fh.truncate(at.start + grown.length);
			return;
		}
		if (top.some((b) => b.type === "moof"))
			throw new Error("cannot grow the tags of a fragmented MP4");
		await shiftOffsets(grown, at.end, grown.length - old.length);
		await rewriteFile(path, fh, [
			{ from: 0, to: at.start },
			grown,
			{ from: at.end, to: size },
		]);
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

export const m4aTags: TagFormat = {
	name: "m4a",
	extensions: [".m4a"],
	sniff: (head) => head.toString("latin1", 4, 8) === "ftyp",
	read,
	write,
	readFrom,
	probeFrom,
	payloadOf,
	pictureOf,
};
