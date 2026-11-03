// What the playlist places are made of: shared by the hub and the screens.

export const SMART_SORTS = [
	"title",
	"artist",
	"bpm",
	"rating",
	"addedAt",
	"lastPlayedAt",
] as const;
export type SmartSort = (typeof SMART_SORTS)[number];

// A smart playlist as stored (core's `SmartPlaylist` with the editor's sort words).
export interface StoredSmart {
	rule: import("@trackvault/core/smart").Rule;
	sort?: { field: SmartSort; dir: "asc" | "desc" } | undefined;
	limit?: number | undefined;
}

export const SMART_HELP =
	"One condition a line, e.g. bpm >= 120, genre is House, key compatible 8A, tag any peak, added within 30.";
