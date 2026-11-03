import type { TableColumn } from "@fcalell/ui-core/descriptors";
import { trackTitle } from "../ui/track.ts";

// The tags a person names in words, for a table of changes.
export const FIELD_LABELS: Record<string, string> = {
	title: "Title",
	artist: "Artist",
	albumArtist: "Album artist",
	album: "Album",
	remixer: "Remixer",
	label: "Label",
	genre: "Genre",
	alias: "Alias",
	isrc: "ISRC",
	key: "Key",
	comment: "Comment",
	year: "Year",
	bpm: "BPM",
	energy: "Energy",
	rating: "Rating",
	tags: "Custom tags",
	colour: "Colour",
	cues: "Cues",
	node: "Playlist",
	member: "Track",
	parentId: "Folder",
	position: "Position",
	rule: "Smart rule",
	file: "File",
	path: "Path",
	"path (renamed)": "Path (name taken)",
	collision: "Collision",
};

export const fieldLabel = (field: string): string =>
	FIELD_LABELS[field] ?? field;

// A row of a change table: a track, one field, what it was and what it becomes.
export interface ChangeRow {
	id: string;
	label: string;
	field: string;
	before: string | null;
	after: string | null;
}

// The columns every table of changes draws (preview of an edit, of rules, of the
// organiser; a batch in the history): the track, the field, and the `change` cell.
const fieldColumns = <
	T extends { field: string; before: string | null; after: string | null },
>(): TableColumn<T>[] => [
	{
		key: "field",
		label: "Field",
		width: "measure-short",
		cell: (row) => fieldLabel(row.field),
	},
	{
		key: "change",
		label: "Change",
		kind: "change",
		cell: (row) => ({ before: row.before, after: row.after }),
	},
];

export const CHANGE_COLUMNS: TableColumn<ChangeRow>[] = [
	{ key: "label", label: "Track", cell: (row) => row.label },
	...fieldColumns<ChangeRow>(),
];

export const CHANGE_ROW = { id: (row: ChangeRow) => row.id };

// A change the hub stored, as a batch of the history and a preview job list it: the
// track (or the playlist) it was on, which the row links to, then the same field and
// change cells. A playlist's name is its `title`.
export interface StoredChange {
	id: string;
	entity: string;
	entityId: string;
	title: string | null;
	mixName: string | null;
	artist: string | null;
	field: string;
	before: string | null;
	after: string | null;
}

export const STORED_CHANGE_COLUMNS: TableColumn<StoredChange>[] = [
	{ key: "title", label: "Track", cell: trackTitle },
	{ key: "artist", label: "Artist", cell: (row) => row.artist },
	...fieldColumns<StoredChange>(),
];

export const STORED_CHANGE_ROW = {
	id: (row: StoredChange) => row.id,
	href: (row: StoredChange) =>
		row.entity === "playlist"
			? `/playlists/${row.entityId}`
			: row.entity === "track"
				? `/library/${row.entityId}`
				: undefined,
};
