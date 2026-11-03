import { open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type Mp3Layout, readMp3Layout } from "../mp3/layout.ts";
import {
	commentFrame,
	commentOf,
	type Id3Frame,
	type Id3Tag,
	popularimeterFrame,
	popularimeterOf,
	readId3,
	serializeId3,
	textFrame,
	textValues,
	userTextFrame,
	userTextOf,
} from "./id3.ts";
import type {
	AudioInfo,
	TagFormat,
	TagPatch,
	TagReadResult,
	TrackTags,
} from "./types.ts";

const ENERGY_NAMES = ["energylevel", "energy"];
const WMP = "Windows Media Player 9 Series";
// The padding a rewritten tag keeps, so the next edits fit in place.
const PADDING = 4096;
const COPY_CHUNK = 1 << 20;

// The frames a read decodes. Everything else (covers, lyrics, ...) is skipped
// on the way past, with its size alone noted.
const READ = new Set([
	"TIT2",
	"TPE1",
	"TPE2",
	"TPE4",
	"TALB",
	"TCON",
	"TYER",
	"TDRC",
	"TPUB",
	"TSRC",
	"TBPM",
	"TKEY",
	"COMM",
	"POPM",
	"TXXX",
]);
const wantedOnRead = (id: string): boolean => READ.has(id) || id === "APIC";
const wantedOnWrite = (): boolean => true;

// ID3v1 genre numbers, as the old "(17)" and "17" forms of TCON name them.
const GENRES =
	"Blues,Classic Rock,Country,Dance,Disco,Funk,Grunge,Hip-Hop,Jazz,Metal,New Age,Oldies,Other,Pop,R&B,Rap,Reggae,Rock,Techno,Industrial,Alternative,Ska,Death Metal,Pranks,Soundtrack,Euro-Techno,Ambient,Trip-Hop,Vocal,Jazz+Funk,Fusion,Trance,Classical,Instrumental,Acid,House,Game,Sound Clip,Gospel,Noise,AlternRock,Bass,Soul,Punk,Space,Meditative,Instrumental Pop,Instrumental Rock,Ethnic,Gothic,Darkwave,Techno-Industrial,Electronic,Pop-Folk,Eurodance,Dream,Southern Rock,Comedy,Cult,Gangsta,Top 40,Christian Rap,Pop/Funk,Jungle,Native American,Cabaret,New Wave,Psychadelic,Rave,Showtunes,Trailer,Lo-Fi,Tribal,Acid Punk,Acid Jazz,Polka,Retro,Musical,Rock & Roll,Hard Rock".split(
		",",
	);

function genreOf(values: string[]): string | null {
	const out: string[] = [];
	for (const value of values) {
		let rest = value;
		for (;;) {
			const ref = /^\((\d{1,3})\)/.exec(rest);
			if (!ref) break;
			const name = GENRES[Number(ref[1])];
			rest = rest.slice(ref[0].length);
			if (rest === "" && name) out.push(name);
		}
		if (/^\d{1,3}$/.test(rest)) {
			const name = GENRES[Number(rest)];
			if (name) out.push(name);
			continue;
		}
		if (rest !== "" && rest !== "(RX)" && rest !== "(CR)") out.push(rest);
	}
	return out.length > 0 ? out.join("; ") : null;
}

function starsFromPopm(value: number): number {
	if (value <= 0) return 0;
	if (value < 32) return 1;
	if (value < 96) return 2;
	if (value < 160) return 3;
	if (value < 224) return 4;
	return 5;
}

const POPM_BY_STARS = [0, 1, 64, 128, 196, 255] as const;

function number(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Number.parseFloat(value.replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
}

function yearOf(frames: Id3Frame[]): number | null {
	for (const id of ["TDRC", "TYER"]) {
		const value = textValues(first(frames, id)?.body ?? EMPTY)[0];
		const year = value ? Number.parseInt(value.slice(0, 4), 10) : Number.NaN;
		if (year > 0) return year;
	}
	return null;
}

const EMPTY = Buffer.alloc(0);

function first(frames: Id3Frame[], id: string): Id3Frame | undefined {
	return frames.find((f) => f.id === id && !f.opaque);
}

function textOf(
	frames: Id3Frame[],
	id: string,
	separator = "; ",
): string | null {
	const frame = first(frames, id);
	if (!frame) return null;
	const values = textValues(frame.body);
	return values.length > 0 ? values.join(separator) : null;
}

// The comment: the first COMM with no description (the plain comment), else the
// first one that is not an iTunes or tagger-internal one.
function pickComment(
	frames: Id3Frame[],
): { frame: Id3Frame; text: string; language: string } | null {
	let fallback: { frame: Id3Frame; text: string; language: string } | null =
		null;
	for (const frame of frames) {
		if (frame.id !== "COMM" || frame.opaque) continue;
		const comment = commentOf(frame.body);
		if (!comment) continue;
		const found = {
			frame,
			text: comment.text.trim(),
			language: comment.language,
		};
		if (comment.description === "") return found;
		if (!fallback && !/^(itun|id3v1)/i.test(comment.description))
			fallback = found;
	}
	return fallback;
}

function popularimeters(
	frames: Id3Frame[],
): Array<{ frame: Id3Frame; rating: number }> {
	const out: Array<{ frame: Id3Frame; rating: number }> = [];
	for (const frame of frames) {
		if (frame.id !== "POPM" || frame.opaque) continue;
		const popm = popularimeterOf(frame.body);
		if (popm) out.push({ frame, rating: popm.rating });
	}
	return out;
}

function findUserText(
	frames: Id3Frame[],
	names: readonly string[],
): { frame: Id3Frame; value: string } | null {
	for (const frame of frames) {
		if (frame.id !== "TXXX" || frame.opaque) continue;
		const user = userTextOf(frame.body);
		if (user && names.includes(user.description.toLowerCase()))
			return { frame, value: user.value.trim() };
	}
	return null;
}

function readFrames(tag: Id3Tag | null): TrackTags & { hasArt: boolean } {
	const frames = tag?.frames ?? [];
	const energy = number(findUserText(frames, ENERGY_NAMES)?.value);
	const rated = popularimeters(frames);
	const stars = rated.find((r) => r.rating > 0) ?? rated[0];
	const genre = first(frames, "TCON");
	return {
		title: textOf(frames, "TIT2"),
		artist: textOf(frames, "TPE1"),
		albumArtist: textOf(frames, "TPE2"),
		album: textOf(frames, "TALB"),
		genre: genre ? genreOf(textValues(genre.body)) : null,
		year: yearOf(frames),
		label: textOf(frames, "TPUB"),
		isrc: textOf(frames, "TSRC"),
		bpm: number(textOf(frames, "TBPM")),
		key: textOf(frames, "TKEY"),
		comment: pickComment(frames)?.text || null,
		rating: stars ? starsFromPopm(stars.rating) : 0,
		energy:
			energy !== null && energy >= 1 && energy <= 10
				? Math.round(energy)
				: null,
		remixer: textOf(frames, "TPE4"),
		hasArt: frames.some((f) => f.id === "APIC" && f.size > 16),
	};
}

function audioOf(layout: Mp3Layout): AudioInfo {
	const header = layout.header;
	if (!header)
		return {
			format: "mp3",
			bitrateKbps: 0,
			sampleRate: 0,
			channels: 0,
			durationMs: 0,
		};
	const payload = Math.max(0, layout.payloadEnd - layout.payloadStart);
	if (layout.vbr?.frames) {
		const seconds =
			(layout.vbr.frames * header.samplesPerFrame) / header.sampleRate;
		return {
			format: "mp3",
			bitrateKbps:
				seconds > 0
					? Math.round((payload * 8) / seconds / 1000)
					: header.bitrateKbps,
			sampleRate: header.sampleRate,
			channels: header.channels,
			durationMs: Math.round(seconds * 1000),
		};
	}
	return {
		format: "mp3",
		bitrateKbps: header.bitrateKbps,
		sampleRate: header.sampleRate,
		channels: header.channels,
		durationMs: Math.round((payload * 8) / header.bitrateKbps),
	};
}

async function read(path: string): Promise<TagReadResult> {
	const fh = await open(path, "r");
	try {
		const { size } = await fh.stat();
		const [tag, layout] = await Promise.all([
			readId3(fh, size, wantedOnRead),
			readMp3Layout(fh, size),
		]);
		const { hasArt, ...tags } = readFrames(tag);
		return { tags, audio: audioOf(layout), hasArt };
	} finally {
		await fh.close();
	}
}

// --- writing -------------------------------------------------------------

function remove(frames: Id3Frame[], ...ids: string[]): void {
	for (let i = frames.length - 1; i >= 0; i--) {
		const frame = frames[i] as Id3Frame;
		if (ids.includes(frame.id) && !frame.opaque) frames.splice(i, 1);
	}
}

function setText(
	frames: Id3Frame[],
	version: number,
	id: string,
	value: string | null | undefined,
): void {
	if (value === undefined) return;
	remove(frames, id);
	if (value !== null && value !== "")
		frames.push(textFrame(version, id, value));
}

function apply(frames: Id3Frame[], version: 3 | 4, patch: TagPatch): void {
	setText(frames, version, "TIT2", patch.title);
	setText(frames, version, "TPE1", patch.artist);
	setText(frames, version, "TPE2", patch.albumArtist);
	setText(frames, version, "TALB", patch.album);
	setText(frames, version, "TCON", patch.genre);
	setText(frames, version, "TPUB", patch.label);
	setText(frames, version, "TSRC", patch.isrc);
	setText(frames, version, "TKEY", patch.key);
	setText(frames, version, "TPE4", patch.remixer);
	if (patch.bpm !== undefined) {
		setText(
			frames,
			version,
			"TBPM",
			patch.bpm === null
				? null
				: String(
						Number.isInteger(patch.bpm)
							? patch.bpm
							: Math.round(patch.bpm * 100) / 100,
					),
		);
	}
	if (patch.year !== undefined) {
		const current = yearOf(frames);
		if (current !== patch.year) {
			remove(frames, "TYER", "TDRC", "TDAT", "TIME");
			if (patch.year !== null)
				frames.push(
					textFrame(
						version,
						version === 4 ? "TDRC" : "TYER",
						String(patch.year),
					),
				);
		}
	}
	if (patch.comment !== undefined) {
		const existing = pickComment(frames);
		if (existing) frames.splice(frames.indexOf(existing.frame), 1);
		if (patch.comment !== null && patch.comment !== "") {
			frames.push(
				commentFrame(
					version,
					"COMM",
					existing?.language ?? "eng",
					"",
					patch.comment,
				),
			);
		}
	}
	if (patch.rating !== undefined) {
		const value = POPM_BY_STARS[
			Math.max(0, Math.min(5, Math.round(patch.rating)))
		] as number;
		const rated = popularimeters(frames);
		const target = rated.find((r) => r.rating > 0) ?? rated[0];
		if (target) {
			const popm = popularimeterOf(target.frame.body);
			frames.splice(
				frames.indexOf(target.frame),
				1,
				popularimeterFrame(popm?.owner ?? WMP, value, popm?.counter ?? 0),
			);
		} else if (value > 0) {
			frames.push(popularimeterFrame(WMP, value, 0));
		}
	}
	if (patch.energy !== undefined) {
		const existing = findUserText(frames, ENERGY_NAMES);
		const description = existing
			? (userTextOf(existing.frame.body)?.description ?? "EnergyLevel")
			: "EnergyLevel";
		if (existing) frames.splice(frames.indexOf(existing.frame), 1);
		if (patch.energy !== null)
			frames.push(userTextFrame(version, description, String(patch.energy)));
	}
}

// Frames whose id differs between the versions are converted, or dropped when
// they have no equivalent (the date parts of v2.3, the v2.4 sort frames).
function convert(frames: Id3Frame[], from: number, to: 3 | 4): Id3Frame[] {
	if (from === to) return frames;
	if (to === 4)
		return frames.filter(
			(f) => !["TDAT", "TIME", "TRDA", "TSIZ", "IPLS"].includes(f.id),
		);
	return frames.filter(
		(f) =>
			![
				"TDRL",
				"TDOR",
				"TDEN",
				"TDTG",
				"TSOA",
				"TSOP",
				"TSOT",
				"TSST",
				"TMOO",
				"TPRO",
				"TIPL",
				"TMCL",
				"ASPI",
				"EQU2",
				"RVA2",
				"SEEK",
				"SIGN",
			].includes(f.id),
	);
}

async function write(path: string, patch: TagPatch): Promise<void> {
	const fh = await open(path, "r+");
	let temporary: string | null = null;
	try {
		const { size } = await fh.stat();
		const layout = await readMp3Layout(fh, size);
		const tag = await readId3(fh, size, wantedOnWrite);
		const version: 3 | 4 = tag?.version === 4 ? 4 : 3;
		const frames = convert(tag?.frames ?? [], tag?.version ?? 3, version);
		apply(frames, version, patch);

		// Fits when this one tag is all of the leading tag space.
		const exact = serializeId3(
			version,
			frames,
			layout.id3End > 0 ? layout.id3End : null,
			PADDING,
		);
		if (layout.id3End > 0 && exact.length === layout.id3End) {
			await fh.write(exact, 0, exact.length, 0);
			return;
		}
		const fresh = serializeId3(version, frames, null, PADDING);
		temporary = join(dirname(path), `.${basename(path)}.tvtmp`);
		const out = await open(temporary, "w");
		try {
			await out.write(fresh, 0, fresh.length, 0);
			const buffer = Buffer.allocUnsafe(COPY_CHUNK);
			let from = layout.id3End;
			let to = fresh.length;
			while (from < size) {
				const { bytesRead } = await fh.read(
					buffer,
					0,
					Math.min(COPY_CHUNK, size - from),
					from,
				);
				if (bytesRead === 0) break;
				await out.write(buffer, 0, bytesRead, to);
				from += bytesRead;
				to += bytesRead;
			}
			await out.sync();
		} finally {
			await out.close();
		}
		await rename(temporary, path);
		temporary = null;
	} finally {
		await fh.close();
		if (temporary) await rm(temporary, { force: true });
	}
}

export const mp3Tags: TagFormat = {
	name: "mp3",
	extensions: [".mp3"],
	read,
	write,
};
