import type { FileHandle } from "node:fs/promises";

// The tags the library edits, in one shape for every container format. A value
// is the file's own text/number; `null` reads as "absent".
export interface TrackTags {
	title: string | null;
	artist: string | null;
	albumArtist: string | null;
	album: string | null;
	genre: string | null;
	year: number | null;
	label: string | null;
	isrc: string | null;
	bpm: number | null;
	// As written in the file (Camelot "8A" from most DJ taggers).
	key: string | null;
	comment: string | null;
	// Stars, 0 to 5 (0 is unrated).
	rating: number;
	// 1 to 10 (Mixed In Key's energy level), or null.
	energy: number | null;
	remixer: string | null;
}

// What an edit may carry: a key left out is left alone, `null` clears it.
export type TagPatch = { [K in keyof TrackTags]?: TrackTags[K] } & {
	// Replaces the front cover (APIC); `null` removes every picture.
	picture?: CoverPicture | null;
};

export interface CoverPicture {
	mime: "image/jpeg" | "image/png";
	data: Uint8Array;
}

export const TAG_FIELDS = [
	"title",
	"artist",
	"albumArtist",
	"album",
	"genre",
	"year",
	"label",
	"isrc",
	"bpm",
	"key",
	"comment",
	"rating",
	"energy",
	"remixer",
] as const satisfies ReadonlyArray<keyof TrackTags>;

export interface AudioInfo {
	// The container family: "mp3", "flac", "m4a", "aiff" or "wav".
	format: string;
	// What is coded inside: "mp3", "flac", "aac", "alac", "pcm", ... ("" when unknown).
	codec: string;
	bitrateKbps: number;
	sampleRate: number;
	channels: number;
	// Bits per sample of a lossless/PCM stream; 0 for a lossy codec or when unknown.
	bitDepth: number;
	durationMs: number;
}

// The audio bytes of a file, [start, end): what the audio hash covers. Tags,
// pictures, padding and every other chunk or atom sit outside of it, so a tag edit
// never moves the identity. `found` is false when the file holds no audio stream
// (the span is then everything after the leading metadata).
export interface AudioPayload {
	start: number;
	end: number;
	found: boolean;
}

// An embedded picture as the file carries it (any MIME type).
export interface EmbeddedPicture {
	mime: string;
	data: Uint8Array;
}

export interface TagReadResult {
	tags: TrackTags;
	audio: AudioInfo;
	hasArt: boolean;
}

export interface TagReader {
	read(path: string): Promise<TagReadResult>;
}

export interface TagWriter {
	// Rewrites the file's tags. A key the patch leaves out is left alone.
	write(path: string, patch: TagPatch): Promise<void>;
}

export interface TagFormat extends TagReader, TagWriter {
	readonly name: string;
	readonly extensions: readonly string[];
	// True when the first bytes of a file (past any leading ID3v2 tag) are this
	// container: the extension is a hint, the magic wins.
	sniff(head: Buffer): boolean;
	// The same reads on an open handle, for callers that already hold one.
	readFrom(fh: FileHandle, size: number): Promise<TagReadResult>;
	probeFrom(fh: FileHandle, size: number): Promise<AudioInfo>;
	payloadOf(fh: FileHandle, size: number): Promise<AudioPayload>;
	// The front cover (else the first picture), or null.
	pictureOf(fh: FileHandle, size: number): Promise<EmbeddedPicture | null>;
}
