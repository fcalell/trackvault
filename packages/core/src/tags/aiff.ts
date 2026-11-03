// AIFF / AIFC: the COMM chunk for the audio properties, the SSND chunk's sound data
// as the audio payload, an ID3 chunk for the tags.

import type { FileHandle } from "node:fs/promises";
import { defineIff, type Form } from "./iff.ts";
import { readAt } from "./io.ts";
import type { AudioInfo } from "./types.ts";

// 80-bit IEEE extended, big-endian.
function extended(b: Buffer, at: number): number {
	const exponent = b.readUInt16BE(at) & 0x7fff;
	const hi = b.readUInt32BE(at + 2);
	const lo = b.readUInt32BE(at + 6);
	if (exponent === 0 && hi === 0 && lo === 0) return 0;
	return (hi * 2 ** 32 + lo) * 2 ** (exponent - 16383 - 63);
}

const CODECS: Record<string, string> = {
	NONE: "pcm",
	twos: "pcm",
	sowt: "pcm",
	in24: "pcm",
	in32: "pcm",
	fl32: "pcm_float",
	FL32: "pcm_float",
	fl64: "pcm_float",
	FL64: "pcm_float",
	ulaw: "ulaw",
	alaw: "alaw",
};

async function audio(fh: FileHandle, form: Form): Promise<AudioInfo> {
	const info: AudioInfo = {
		format: "aiff",
		codec: "",
		bitrateKbps: 0,
		sampleRate: 0,
		channels: 0,
		bitDepth: 0,
		durationMs: 0,
	};
	const comm = form.chunks.find((c) => c.id === "COMM");
	if (!comm || comm.size < 18) return info;
	const b = await readAt(fh, comm.dataStart, Math.min(comm.size, 30));
	info.channels = b.readUInt16BE(0);
	const frames = b.readUInt32BE(2);
	info.bitDepth = b.readUInt16BE(6);
	info.sampleRate = Math.round(extended(b, 8));
	let compression = "NONE";
	if (form.type === "AIFC" && b.length >= 22)
		compression = b.toString("latin1", 18, 22);
	info.codec = CODECS[compression] ?? compression.trim();
	if (info.codec !== "pcm" && info.codec !== "pcm_float") info.bitDepth = 0;
	if (info.sampleRate > 0) {
		info.durationMs = Math.round((frames / info.sampleRate) * 1000);
		if (info.bitDepth > 0)
			info.bitrateKbps = Math.round(
				(info.sampleRate * info.channels * info.bitDepth) / 1000,
			);
	}
	return info;
}

export const aiffTags = defineIff({
	name: "aiff",
	extensions: [".aiff", ".aif", ".aifc"],
	be: true,
	sniff: (head) =>
		head.toString("latin1", 0, 4) === "FORM" &&
		(head.toString("latin1", 8, 12) === "AIFF" ||
			head.toString("latin1", 8, 12) === "AIFC"),
	id3Ids: ["id3 "],
	newId: "ID3 ",
	audio,
	payload: (form) => {
		const ssnd = form.chunks.find((c) => c.id === "SSND");
		if (!ssnd) return null;
		return {
			start: ssnd.dataStart + 8,
			end: ssnd.dataStart + ssnd.size,
			found: ssnd.size > 8,
		};
	},
});
