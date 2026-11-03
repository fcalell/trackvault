import type { TableColumn } from "@fcalell/ui-core/descriptors";

// The tags a person names in words, for a table of changes.
export const FIELD_LABELS: Record<string, string> = {
	title: "Title",
	artist: "Artist",
	albumArtist: "Album artist",
	album: "Album",
	remixer: "Remixer",
	label: "Label",
	genre: "Genre",
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
export const CHANGE_COLUMNS: TableColumn<ChangeRow>[] = [
	{ key: "label", label: "Track", cell: (row) => row.label },
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

export const CHANGE_ROW = { id: (row: ChangeRow) => row.id };
