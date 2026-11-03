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

// The columns every table of changes draws: the field, and the `change` cell.
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

// A change as a batch of the history, a preview job and an edit's preview list it: the
// track (or the playlist) it was on, which the row links to, then the field and
// change cells. A playlist's name is its `title`.
export interface StoredChange {
	id: string;
	entity: string;
	entityId: string;
	title: string | null;
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
