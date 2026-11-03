// Vorbis comments (the FLAC VORBIS_COMMENT block body): parsing, the mapping to
// TrackTags, and the edit. A comment a patch does not touch keeps its bytes.

import { bpmText, parseNumber, starsOfRating, yearOfText } from "./io.ts";
import type { TagPatch, TrackTags } from "./types.ts";

interface Comment {
	// Upper-cased field name.
	name: string;
	value: string;
	// The original bytes, reused when the comment is not edited.
	raw: Buffer | null;
}

export interface Comments {
	vendor: Buffer;
	items: Comment[];
}

export function emptyComments(): Comments {
	return { vendor: Buffer.from("trackvault", "utf8"), items: [] };
}

export function parseComments(body: Buffer): Comments {
	const out: Comments = { vendor: Buffer.alloc(0), items: [] };
	if (body.length < 8) return emptyComments();
	const vendorLength = body.readUInt32LE(0);
	if (4 + vendorLength + 4 > body.length) return emptyComments();
	out.vendor = body.subarray(4, 4 + vendorLength);
	let at = 4 + vendorLength;
	const count = body.readUInt32LE(at);
	at += 4;
	for (let i = 0; i < count && at + 4 <= body.length; i++) {
		const length = body.readUInt32LE(at);
		at += 4;
		if (at + length > body.length) break;
		const raw = body.subarray(at, at + length);
		at += length;
		const eq = raw.indexOf(0x3d);
		if (eq <= 0) continue;
		out.items.push({
			name: raw.toString("latin1", 0, eq).toUpperCase(),
			value: raw.toString("utf8", eq + 1),
			raw,
		});
	}
	return out;
}

export function serializeComments(comments: Comments): Buffer {
	const parts: Buffer[] = [];
	const head = Buffer.alloc(4);
	head.writeUInt32LE(comments.vendor.length);
	parts.push(head, comments.vendor);
	const count = Buffer.alloc(4);
	count.writeUInt32LE(comments.items.length);
	parts.push(count);
	for (const item of comments.items) {
		const raw = item.raw ?? Buffer.from(`${item.name}=${item.value}`, "utf8");
		const length = Buffer.alloc(4);
		length.writeUInt32LE(raw.length);
		parts.push(length, raw);
	}
	return Buffer.concat(parts);
}

const ALBUM_ARTIST = ["ALBUMARTIST", "ALBUM ARTIST", "ALBUM_ARTIST"];
const YEAR = ["DATE", "YEAR"];
const LABEL = ["LABEL", "ORGANIZATION", "PUBLISHER"];
const BPM = ["BPM", "TEMPO"];
const KEY = ["INITIALKEY", "KEY", "INITIAL KEY"];
const COMMENT = ["COMMENT", "DESCRIPTION"];
const RATING = ["RATING"];
const FMPS_RATING = ["FMPS_RATING"];
const ENERGY = ["ENERGYLEVEL", "ENERGY"];
const REMIXER = ["REMIXER", "MIXARTIST"];

function values(comments: Comments, names: readonly string[]): string[] {
	for (const name of names) {
		const found = comments.items
			.filter((c) => c.name === name)
			.map((c) => c.value.trim())
			.filter((v) => v !== "");
		if (found.length > 0) return found;
	}
	return [];
}

function text(comments: Comments, names: readonly string[]): string | null {
	const found = values(comments, names);
	return found.length > 0 ? found.join("; ") : null;
}

export function readVorbis(comments: Comments): TrackTags {
	const energy = parseNumber(values(comments, ENERGY)[0]);
	let rating = 0;
	const rated = parseNumber(values(comments, RATING)[0]);
	if (rated !== null) rating = starsOfRating(rated);
	else {
		const fmps = parseNumber(values(comments, FMPS_RATING)[0]);
		if (fmps !== null) rating = Math.min(5, Math.max(0, Math.round(fmps * 5)));
	}
	return {
		title: text(comments, ["TITLE"]),
		artist: text(comments, ["ARTIST"]),
		albumArtist: text(comments, ALBUM_ARTIST),
		album: text(comments, ["ALBUM"]),
		genre: text(comments, ["GENRE"]),
		year: yearOfText(values(comments, YEAR)[0]),
		label: text(comments, LABEL),
		isrc: text(comments, ["ISRC"]),
		bpm: parseNumber(values(comments, BPM)[0]),
		key: text(comments, KEY),
		comment: text(comments, COMMENT),
		rating,
		energy:
			energy !== null && energy >= 1 && energy <= 10
				? Math.round(energy)
				: null,
		remixer: text(comments, REMIXER),
	};
}

function drop(comments: Comments, names: readonly string[]): void {
	comments.items = comments.items.filter((c) => !names.includes(c.name));
}

// Replaces every alias of a field by one comment named `name` (null clears).
function set(
	comments: Comments,
	name: string,
	aliases: readonly string[],
	value: string | null | undefined,
): void {
	if (value === undefined) return;
	const index = comments.items.findIndex((c) => aliases.includes(c.name));
	drop(comments, aliases);
	if (value === null || value === "") return;
	const item = { name, value, raw: null };
	if (index === -1 || index > comments.items.length) comments.items.push(item);
	else comments.items.splice(index, 0, item);
}

// A field that keeps the name the file already uses for it.
function nameOf(
	comments: Comments,
	aliases: readonly string[],
	fallback: string,
): string {
	return comments.items.find((c) => aliases.includes(c.name))?.name ?? fallback;
}

export function applyVorbis(comments: Comments, patch: TagPatch): void {
	set(comments, "TITLE", ["TITLE"], patch.title);
	set(comments, "ARTIST", ["ARTIST"], patch.artist);
	set(comments, "ALBUMARTIST", ALBUM_ARTIST, patch.albumArtist);
	set(comments, "ALBUM", ["ALBUM"], patch.album);
	set(comments, "GENRE", ["GENRE"], patch.genre);
	set(comments, "LABEL", LABEL, patch.label);
	set(comments, "ISRC", ["ISRC"], patch.isrc);
	set(comments, "REMIXER", REMIXER, patch.remixer);
	set(comments, nameOf(comments, KEY, "INITIALKEY"), KEY, patch.key);
	set(comments, "COMMENT", COMMENT, patch.comment);
	if (patch.bpm !== undefined)
		set(comments, "BPM", BPM, patch.bpm === null ? null : bpmText(patch.bpm));
	if (patch.year !== undefined) {
		if (yearOfText(values(comments, YEAR)[0]) !== patch.year)
			set(
				comments,
				"DATE",
				YEAR,
				patch.year === null ? null : String(patch.year),
			);
	}
	if (patch.energy !== undefined)
		set(
			comments,
			nameOf(comments, ENERGY, "ENERGYLEVEL"),
			ENERGY,
			patch.energy === null ? null : String(patch.energy),
		);
	if (patch.rating !== undefined) {
		const stars = Math.max(0, Math.min(5, Math.round(patch.rating)));
		const current = parseNumber(values(comments, RATING)[0]);
		// A file that keeps its rating as stars (1-5) keeps doing so.
		const scale = current !== null && current > 0 && current <= 5 ? 1 : 20;
		drop(comments, FMPS_RATING);
		set(comments, "RATING", RATING, stars === 0 ? null : String(stars * scale));
	}
}
