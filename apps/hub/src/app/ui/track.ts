import type { RowItem, TableColumn, Track } from "@fcalell/ui-core/descriptors";
import type { ListRow } from "../../shared/library.ts";
import { age, bitrate, bpm, duration } from "./figures.ts";

// What the library draws of a track: the columns of a list row, which a record
// has as well.
export interface TrackFacts {
	id: string;
	title: string | null;
	artist: string | null;
	durationMs: number | null;
	hasArt?: boolean;
}

// "Title (Mix)": the name a track goes by on every screen.
export const trackTitle = (track: {
	title: string | null;
	mixName: string | null;
}): string =>
	`${track.title ?? "Untitled"}${track.mixName ? ` (${track.mixName})` : ""}`;

// The one track row: its title with the mix, the artist under it (and a sentence
// about it after the artist), and the leading mark, facts, trailing and acts the
// screen gives.
export function trackRow(
	track: {
		title: string | null;
		mixName: string | null;
		artist: string | null;
	},
	row: Omit<RowItem, "title" | "line"> & { note?: string },
): RowItem {
	const { note, ...rest } = row;
	const artist = track.artist ?? "Unknown artist";
	return {
		...rest,
		title: trackTitle(track),
		line: note ? `${artist}: ${note}` : artist,
	};
}

// The keys are the hub's sort columns (shared/library.ts) where the column sorts.
export const TRACK_COLUMNS: TableColumn<ListRow>[] = [
	{
		key: "title",
		label: "Title",
		sortable: true,
		cell: trackTitle,
	},
	{
		key: "artist",
		label: "Artist",
		sortable: true,
		cell: (row) => row.artist,
	},
	{
		key: "bpm",
		label: "BPM",
		kind: "number",
		sortable: true,
		cell: (row) => bpm(row.bpm),
	},
	{
		key: "key",
		label: "Key",
		width: "measure-short",
		sortable: true,
		cell: (row) => row.key,
	},
	{ key: "genre", label: "Genre", sortable: true, cell: (row) => row.genre },
	{
		key: "rating",
		label: "Rating",
		kind: "number",
		sortable: true,
		hidden: true,
		cell: (row) => (row.rating > 0 ? row.rating : null),
	},
	{
		key: "durationMs",
		label: "Time",
		kind: "number",
		sortable: true,
		cell: (row) => duration(row.durationMs),
	},
	{
		key: "bitrate",
		label: "Quality",
		width: "measure-short",
		sortable: true,
		hidden: true,
		cell: (row) => bitrate(row.format, row.bitrate),
	},
	{
		key: "energy",
		label: "Energy",
		kind: "number",
		sortable: true,
		cell: (row) => row.energy,
	},
	{
		key: "loudness",
		label: "LUFS",
		kind: "number",
		sortable: true,
		hidden: true,
		cell: (row) =>
			row.loudness === null ? null : Math.round(row.loudness * 10) / 10,
	},
	{
		key: "addedAt",
		label: "Added",
		kind: "age",
		sortable: true,
		cell: (row) => age(row.addedAt),
	},
];

// The player's track for a row: the file the hub serves, with what is known of it.
export function toTrack(row: TrackFacts, peaks?: ArrayLike<number>): Track {
	return {
		src: `/media/${encodeURIComponent(row.id)}`,
		key: row.id,
		title: row.title ?? "Untitled",
		line: row.artist ?? undefined,
		image: row.hasArt
			? `/media/${encodeURIComponent(row.id)}/art?size=320`
			: undefined,
		duration: row.durationMs ? row.durationMs / 1000 : undefined,
		peaks: peaks ? { values: peaks } : undefined,
	};
}

// The hub's `/media/<id>/peaks`: one byte per value, 255 the loudest stretch.
// Undefined while the waveform is not drawn yet.
export async function fetchPeaks(
	id: string,
): Promise<Float32Array | undefined> {
	const response = await fetch(`/media/${encodeURIComponent(id)}/peaks`);
	if (response.status === 404) return undefined;
	if (!response.ok) throw new Error("The waveform could not be read.");
	return Float32Array.from(
		new Uint8Array(await response.arrayBuffer()),
		(v) => v / 255,
	);
}
