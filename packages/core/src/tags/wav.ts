// WAV: the fmt chunk for the audio properties, the data chunk as the audio payload,
// an `id3 ` chunk for the tags. A file tagged the old way (LIST/INFO) reads from
// there until it gets an ID3 chunk, which a write seeds from it.

import type { FileHandle } from "node:fs/promises";
import { defineIff, type Form } from "./iff.ts";
import { readAt, yearOfText } from "./io.ts";
import type { AudioInfo, AudioPayload, TrackTags } from "./types.ts";

const CODECS: Record<number, string> = {
	1: "pcm",
	2: "adpcm",
	3: "pcm_float",
	6: "alaw",
	7: "ulaw",
	80: "mp2",
	85: "mp3",
	65534: "pcm",
};

async function audio(
	fh: FileHandle,
	form: Form,
	size: number,
): Promise<AudioInfo> {
	const info: AudioInfo = {
		format: "wav",
		codec: "",
		bitrateKbps: 0,
		sampleRate: 0,
		channels: 0,
		bitDepth: 0,
		durationMs: 0,
	};
	const fmt = form.chunks.find((c) => c.id === "fmt ");
	if (!fmt || fmt.size < 16) return info;
	const b = await readAt(fh, fmt.dataStart, Math.min(fmt.size, 40));
	let tag = b.readUInt16LE(0);
	info.channels = b.readUInt16LE(2);
	info.sampleRate = b.readUInt32LE(4);
	const byteRate = b.readUInt32LE(8);
	const bits = b.readUInt16LE(14);
	if (tag === 0xfffe && b.length >= 26) {
		// WAVE_FORMAT_EXTENSIBLE: the real format tag opens the sub-format GUID.
		tag = b.readUInt16LE(24);
	}
	info.codec = CODECS[tag] ?? `0x${tag.toString(16)}`;
	if (tag === 1 || tag === 3) info.bitDepth = bits;
	info.bitrateKbps = Math.round((byteRate * 8) / 1000);
	const data = form.chunks.find((c) => c.id === "data");
	if (data && byteRate > 0) {
		const bytes = Math.min(data.size, size - data.dataStart);
		info.durationMs = Math.round((bytes / byteRate) * 1000);
	}
	return info;
}

function payload(form: Form): AudioPayload | null {
	const data = form.chunks.find((c) => c.id === "data");
	if (!data) return null;
	return {
		start: data.dataStart,
		end: data.dataStart + data.size,
		found: data.size > 0,
	};
}

const INFO_FIELDS: Array<[string, keyof TrackTags]> = [
	["INAM", "title"],
	["IART", "artist"],
	["IPRD", "album"],
	["IGNR", "genre"],
	["ICMT", "comment"],
];

// LIST/INFO text entries: id, size, NUL-terminated text.
async function legacy(fh: FileHandle, form: Form): Promise<Partial<TrackTags>> {
	const out: Partial<TrackTags> = {};
	for (const list of form.chunks.filter((c) => c.id === "LIST")) {
		if (list.size < 12 || list.size > 1 << 20) continue;
		const b = await readAt(fh, list.dataStart, list.size);
		if (b.toString("latin1", 0, 4) !== "INFO") continue;
		let at = 4;
		while (at + 8 <= b.length) {
			const id = b.toString("latin1", at, at + 4);
			const length = b.readUInt32LE(at + 4);
			const text = b
				.toString("utf8", at + 8, Math.min(at + 8 + length, b.length))
				.replace(/\0.*$/s, "")
				.trim();
			at += 8 + length + (length & 1);
			if (text === "") continue;
			const field = INFO_FIELDS.find(([name]) => name === id);
			if (field) (out as Record<string, unknown>)[field[1]] = text;
			else if (id === "ICRD") {
				const year = yearOfText(text);
				if (year) out.year = year;
			}
		}
	}
	return out;
}

export const wavTags = defineIff({
	name: "wav",
	extensions: [".wav", ".wave"],
	be: false,
	sniff: (head) =>
		head.toString("latin1", 0, 4) === "RIFF" &&
		head.toString("latin1", 8, 12) === "WAVE",
	id3Ids: ["id3 "],
	newId: "id3 ",
	audio,
	payload,
	legacy,
});
