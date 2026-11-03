import { extname } from "node:path";
import { mp3Tags } from "./mp3.ts";
import type { TagFormat, TagPatch, TagReadResult } from "./types.ts";

export type {
	AudioInfo,
	TagFormat,
	TagPatch,
	TagReader,
	TagReadResult,
	TagWriter,
	TrackTags,
} from "./types.ts";
export { TAG_FIELDS } from "./types.ts";

// One entry per container format. AIFF, WAV, FLAC and M4A join here (R3).
const FORMATS: readonly TagFormat[] = [mp3Tags];
const BY_EXTENSION = new Map(
	FORMATS.flatMap((f) => f.extensions.map((e) => [e, f] as const)),
);

export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set(
	BY_EXTENSION.keys(),
);

export function formatOf(path: string): TagFormat | null {
	return BY_EXTENSION.get(extname(path).toLowerCase()) ?? null;
}

function need(path: string): TagFormat {
	const format = formatOf(path);
	if (!format)
		throw new Error(`unsupported audio format: ${extname(path) || path}`);
	return format;
}

// Tags and audio properties of one file. Covers are never loaded: `hasArt`
// only says whether a picture is there.
export function readTags(path: string): Promise<TagReadResult> {
	return need(path).read(path);
}

// Rewrites the tags of one file, in place when the new tag fits the old one's
// space and through a temporary copy renamed over the file when it does not.
export function writeTags(path: string, patch: TagPatch): Promise<void> {
	return need(path).write(path, patch);
}
