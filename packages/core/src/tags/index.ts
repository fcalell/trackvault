import { type FileHandle, open } from "node:fs/promises";
import { extname } from "node:path";
import { hashRange } from "../hash/stream.ts";
import { isId3v2Header, syncsafe } from "../mp3/frame.ts";
import { aiffTags } from "./aiff.ts";
import { flacTags } from "./flac.ts";
import { readAt } from "./io.ts";
import { mp3Tags } from "./mp3.ts";
import { m4aTags } from "./mp4.ts";
import type {
	AudioInfo,
	EmbeddedPicture,
	TagFormat,
	TagPatch,
	TagReadResult,
} from "./types.ts";
import { wavTags } from "./wav.ts";

export type {
	AudioInfo,
	AudioPayload,
	CoverPicture,
	EmbeddedPicture,
	TagFormat,
	TagPatch,
	TagReader,
	TagReadResult,
	TagWriter,
	TrackTags,
} from "./types.ts";
export { TAG_FIELDS } from "./types.ts";

// One entry per container format.
const FORMATS: readonly TagFormat[] = [
	mp3Tags,
	flacTags,
	m4aTags,
	aiffTags,
	wavTags,
];
const BY_EXTENSION = new Map(
	FORMATS.flatMap((f) => f.extensions.map((e) => [e, f] as const)),
);

// Lower-case, with the dot: ".mp3", ".flac", ".m4a", ".aiff", ".aif", ".aifc", ".wav", ".wave".
export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set(
	BY_EXTENSION.keys(),
);

// Whether the path has an extension of a format the library reads and writes.
export function isAudioFile(path: string): boolean {
	return BY_EXTENSION.has(extname(path).toLowerCase());
}

// The format an extension names (a hint: `detectFormat` looks at the bytes too).
export function formatOf(path: string): TagFormat | null {
	return BY_EXTENSION.get(extname(path).toLowerCase()) ?? null;
}

// The first bytes of the audio, past any leading ID3v2 tag (a FLAC or MP3 may open
// with one).
async function magicOf(
	fh: FileHandle,
	size: number,
): Promise<{ head: Buffer; id3: boolean }> {
	let at = 0;
	let id3 = false;
	for (let i = 0; i < 4; i++) {
		const tag = await readAt(fh, at, 10);
		if (tag.length < 10 || !isId3v2Header(tag, 0)) break;
		id3 = true;
		at += 10 + syncsafe(tag, 6) + (((tag[5] as number) & 0x10) !== 0 ? 10 : 0);
	}
	return { head: await readAt(fh, Math.min(at, size), 16), id3 };
}

// The format of an open file: its magic bytes decide, the extension breaks a tie
// (a file nothing recognises is taken for what its extension says, an ID3-tagged one
// with an unknown extension for MP3). Null when it is none of ours.
export async function detectFormat(
	fh: FileHandle,
	size: number,
	path: string,
): Promise<TagFormat | null> {
	const byExtension = formatOf(path);
	const { head, id3 } = await magicOf(fh, size);
	if (byExtension?.sniff(head)) return byExtension;
	return (
		FORMATS.find((f) => f.sniff(head)) ?? byExtension ?? (id3 ? mp3Tags : null)
	);
}

function unsupported(path: string): Error {
	return new Error(`unsupported audio format: ${extname(path) || path}`);
}

async function withFormat<T>(
	path: string,
	use: (format: TagFormat, fh: FileHandle, size: number) => Promise<T>,
): Promise<T> {
	const fh = await open(path, "r");
	try {
		const { size } = await fh.stat();
		const format = await detectFormat(fh, size, path);
		if (!format) throw unsupported(path);
		return await use(format, fh, size);
	} finally {
		await fh.close();
	}
}

// Tags and audio properties of one file. Covers are never loaded: `hasArt` only says
// whether a picture is there. Only headers are read, whatever the size of the file.
export function readTags(path: string): Promise<TagReadResult> {
	return withFormat(path, (f, fh, size) => f.readFrom(fh, size));
}

// The audio properties alone: format, codec, bitrate, sample rate, bit depth, channels
// and duration.
export function probe(path: string): Promise<AudioInfo> {
	return withFormat(path, (f, fh, size) => f.probeFrom(fh, size));
}

// sha256 (hex) of the audio payload alone: a tag edit never changes it.
export function audioHash(path: string): Promise<string> {
	return withFormat(path, async (f, fh, size) => {
		const payload = await f.payloadOf(fh, size);
		return (await hashRange(fh, payload.start, payload.end)).toString("hex");
	});
}

// The embedded front cover (else the first picture) of a file, or null.
export function readPicture(path: string): Promise<EmbeddedPicture | null> {
	return withFormat(path, (f, fh, size) => f.pictureOf(fh, size));
}

// Rewrites the tags of one file, in place when the new tag fits the old one's
// space and through a temporary copy renamed over the file when it does not.
export async function writeTags(path: string, patch: TagPatch): Promise<void> {
	const format = await withFormat(path, async (f) => f);
	await format.write(path, patch);
}
