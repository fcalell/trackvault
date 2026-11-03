export type WantSource =
	| "manual"
	| "text"
	| "m3u"
	| "rekordbox"
	| "spotify"
	| "beatport"
	| "1001tracklists"
	| "youtube";

export type WantStatus =
	| "wanted"
	| "searching"
	| "found"
	| "downloading"
	| "downloaded"
	| "in-library"
	| "gave-up"
	| "ignored";

export interface Want {
	artist: string;
	title: string;
	// The mix as written ("Extended Mix"); absent means the original.
	mix?: string | null;
	source: WantSource;
	// Where it came from: playlist URL or id, file name, "manual".
	sourceRef: string;
	status: WantStatus;
	// Only when the source knows it; ranking uses them to reject wrong files.
	durationSec?: number | null;
	isrc?: string | null;
	label?: string | null;
}

export type NewWant = Omit<Want, "status"> & { status?: WantStatus };

export const ACTIVE_STATUSES: readonly WantStatus[] = [
	"wanted",
	"searching",
	"found",
	"downloading",
];
