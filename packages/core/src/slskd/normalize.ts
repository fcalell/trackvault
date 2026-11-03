import type { SlskdFile, SlskdResponse, SoulseekFile } from "./types.ts";

function extensionOf(file: SlskdFile): string {
	const raw = file.extension?.trim();
	if (raw) return raw.replace(/^\./, "").toLowerCase();
	const m = /\.([A-Za-z0-9]{1,5})$/.exec(file.filename);
	return m ? (m[1] as string).toLowerCase() : "";
}

const num = (v: number | null | undefined) =>
	typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

export function normalizeResponse(response: SlskdResponse): SoulseekFile[] {
	const make = (f: SlskdFile, locked: boolean): SoulseekFile => ({
		user: response.username,
		path: f.filename,
		size: f.size,
		bitrate: num(f.bitRate),
		bitDepth: num(f.bitDepth),
		sampleRate: num(f.sampleRate),
		length: num(f.length),
		vbr: f.isVariableBitRate ?? null,
		extension: extensionOf(f),
		isLocked: locked || f.isLocked === true,
		queueLength: response.queueLength,
		freeUploadSlots: response.hasFreeUploadSlot,
		uploadSpeed: response.uploadSpeed,
	});
	return [
		...response.files.map((f) => make(f, false)),
		...(response.lockedFiles ?? []).map((f) => make(f, true)),
	];
}

export function normalizeResponses(
	responses: readonly SlskdResponse[],
): SoulseekFile[] {
	return responses.flatMap(normalizeResponse);
}

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
	"mp3",
	"flac",
	"wav",
	"aif",
	"aiff",
	"m4a",
	"alac",
	"ogg",
	"opus",
	"wma",
	"ape",
	"wv",
]);

export const isAudio = (f: Pick<SoulseekFile, "extension">) =>
	AUDIO_EXTENSIONS.has(f.extension);
