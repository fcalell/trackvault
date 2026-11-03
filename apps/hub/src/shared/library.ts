// What the library's list and its filters are made of: shared by the hub's query
// and the screen that draws it.

// The issues a person can filter by, one bit each in `tracks.issues` (core/issues).
export const ISSUE_FILTERS = [
	"lowBitrate",
	"noTitle",
	"noArtist",
	"noGenre",
	"noBpm",
	"noKey",
	"noArt",
	"undecodable",
	"missingFile",
	"corrupt",
	"fakeBitrate",
] as const;
export type IssueFilter = (typeof ISSUE_FILTERS)[number];

// The columns a caller may sort the list by: the table's column keys.
export const SORT_COLUMNS = [
	"title",
	"artist",
	"genre",
	"bpm",
	"key",
	"rating",
	"durationMs",
	"bitrate",
	"addedAt",
] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

// A row of the list: only what the table draws; the full record loads on open.
export type ListRow = {
	id: string;
	title: string | null;
	artist: string | null;
	mixName: string | null;
	bpm: number | null;
	key: string | null;
	genre: string | null;
	rating: number;
	durationMs: number | null;
	format: string;
	bitrate: number | null;
	addedAt: Date;
	issues: number;
};

// What each issue is called on screen.
export const ISSUE_LABELS: Record<IssueFilter, string> = {
	lowBitrate: "Low bitrate",
	noTitle: "No title",
	noArtist: "No artist",
	noGenre: "No genre",
	noBpm: "No BPM",
	noKey: "No key",
	noArt: "No artwork",
	undecodable: "Unreadable audio",
	missingFile: "File missing",
	corrupt: "Corrupt audio",
	fakeBitrate: "Fake bitrate",
};
