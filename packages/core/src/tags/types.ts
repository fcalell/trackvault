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
	format: string;
	bitrateKbps: number;
	sampleRate: number;
	channels: number;
	durationMs: number;
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
}
