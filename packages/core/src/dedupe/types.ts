import type { TrackTags } from "../tags/types.ts";

export type TrackId = string | number;

// What dedupe reads of a track. Everything but `id` may be unknown.
export interface DedupeTrack {
	id: TrackId;
	audioHash?: string | null;
	// Chromaprint raw fingerprint (int32 items, ~8 per second).
	fingerprint?: Int32Array | null;
	durationMs?: number | null;
	title?: string | null;
	artist?: string | null;
	album?: string | null;
	year?: number | null;
}

export type DuplicateReason = "exact" | "acoustic" | "fuzzy";

export interface DuplicateGroup {
	// Member ids, input order.
	trackIds: TrackId[];
	// The weakest tier that links the group; `reasons` lists every tier involved.
	reason: DuplicateReason;
	reasons: DuplicateReason[];
	// 0..1, the weakest link. Exact is 1.
	confidence: number;
}

export type MixKind =
	| "original"
	| "extended"
	| "radio"
	| "club"
	| "remix"
	| "dub"
	| "vip"
	| "bootleg"
	| "instrumental"
	| "acapella"
	| "live"
	| "remaster"
	| "other";

export interface VersionGroup {
	// Same artist and title, different mixes: not duplicates.
	trackIds: TrackId[];
	versions: Array<{ key: string; kind: MixKind; trackIds: TrackId[] }>;
}

export interface DedupeResult {
	groups: DuplicateGroup[];
	versions: VersionGroup[];
}

// What picking a keeper and planning a merge need to know about one track.
export interface TrackFacts {
	id: TrackId;
	format: string;
	bitrateKbps: number;
	sampleRate?: number;
	tags: Partial<TrackTags>;
	hasArt?: boolean;
	cueCount: number;
	playlistIds: TrackId[];
	customTagIds?: TrackId[];
	// ms since epoch.
	addedAt: number;
	// Library paths of the files of this track.
	files: string[];
}
