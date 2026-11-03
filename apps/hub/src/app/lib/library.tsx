import { useWindow } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { player } from "@fcalell/plugin-react-ui/lib/player";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ISSUE_FILTERS, ListRow } from "../../shared/library.ts";
import { clock, quality, toTrack } from "../ui/track.ts";
import { orpc } from "./api.ts";
import { useDebounced } from "./debounced.ts";
import { queueFrom, setQueueSource } from "./queue.ts";

// The keys are the hub's sort columns (shared/library.ts) where the column sorts.
const COLUMNS: TableColumn<ListRow>[] = [
	{
		key: "title",
		label: "Title",
		sortable: true,
		cell: (row) => row.title ?? "Untitled",
	},
	{
		key: "artist",
		label: "Artist",
		sortable: true,
		cell: (row) => row.artist,
	},
	{ key: "mixName", label: "Mix", hidden: true, cell: (row) => row.mixName },
	{
		key: "bpm",
		label: "BPM",
		kind: "number",
		sortable: true,
		cell: (row) => (row.bpm === null ? null : Math.round(row.bpm * 10) / 10),
	},
	{ key: "key", label: "Key", sortable: true, cell: (row) => row.key },
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
		cell: (row) => clock(row.durationMs),
	},
	{
		key: "bitrate",
		label: "Quality",
		sortable: true,
		hidden: true,
		cell: (row) => quality(row.format, row.bitrate),
	},
	{
		key: "addedAt",
		label: "Added",
		kind: "age",
		sortable: true,
		cell: (row) => row.addedAt.toISOString(),
	},
];

const BPM_RANGES = [
	{ value: "0-99", label: "Under 100", min: 0, max: 99.99 },
	{ value: "100-119", label: "100 to 119", min: 100, max: 119.99 },
	{ value: "120-124", label: "120 to 124", min: 120, max: 124.99 },
	{ value: "125-129", label: "125 to 129", min: 125, max: 129.99 },
	{ value: "130-139", label: "130 to 139", min: 130, max: 139.99 },
	{ value: "140-159", label: "140 to 159", min: 140, max: 159.99 },
	{ value: "160-999", label: "160 and over", min: 160, max: 999 },
] as const;

const ISSUE_LABELS: Record<(typeof ISSUE_FILTERS)[number], string> = {
	lowBitrate: "Low bitrate",
	noTitle: "No title",
	noArtist: "No artist",
	noGenre: "No genre",
	noBpm: "No BPM",
	noKey: "No key",
	noArt: "No artwork",
	undecodable: "Unreadable audio",
	missingFile: "File missing",
};

const count = new Intl.NumberFormat("en");

// The library's list: a search box and filters over a table of every track, read a
// window at a time (the hub searches, filters and sorts). `base` is the route a
// row's record opens under.
export function LibraryPane({
	title,
	base,
	recent = false,
}: {
	title: string;
	base: string;
	recent?: boolean;
}) {
	const [text, setText] = useState("");
	const q = useDebounced(text.trim(), 120);
	const [genre, setGenre] = useState<string>();
	const [key, setKey] = useState<string>();
	const [issue, setIssue] = useState<(typeof ISSUE_FILTERS)[number]>();
	const [bpm, setBpm] = useState<string>();
	const range = BPM_RANGES.find((each) => each.value === bpm);

	const query = useMemo(
		() => ({
			q: q || undefined,
			genre,
			key,
			issue,
			bpmMin: range?.min,
			bpmMax: range?.max,
			recent: recent || undefined,
		}),
		[q, genre, key, issue, range, recent],
	);
	const tracks = orpc.tracks.list.window(query);
	const facets = orpc.tracks.facets.read();
	const open = useParams({ strict: false }).trackId;

	// The player's queue is the rows loaded, in the list's order.
	const view = useWindow(tracks);
	const rows = view?.rows;
	useEffect(() => {
		setQueueSource(rows ? (rows.filter(Boolean) as ListRow[]) : []);
	}, [rows]);

	return (
		<Pane
			title={title}
			back={false}
			actions={[
				{
					icon: "RefreshCw",
					label: "Scan now",
					onAct: () => orpc.scan.start.call(),
					done: "Scan started",
					to: "/jobs",
				},
			]}
		>
			<Toolbar
				search={{
					value: text,
					onChange: setText,
					placeholder: "Search title, artist, label",
				}}
				filters={[
					{
						label: "Genre",
						placeholder: "Any genre",
						options: facets.at((each) =>
							each.genres.map((genre) => ({
								value: genre.value,
								label: genre.value,
								description: count.format(genre.count),
							})),
						),
						value: genre,
						onChange: (value) => setGenre(value ?? undefined),
					},
					{
						label: "Key",
						placeholder: "Any key",
						options: facets.at((each) =>
							each.keys
								.toSorted((a, b) => camelot(a.value) - camelot(b.value))
								.map((key) => ({
									value: key.value,
									label: key.value,
									description: count.format(key.count),
								})),
						),
						value: key,
						onChange: (value) => setKey(value ?? undefined),
					},
					{
						label: "BPM",
						placeholder: "Any tempo",
						options: BPM_RANGES.map(({ value, label }) => ({ value, label })),
						value: bpm,
						onChange: (value) => setBpm(value ?? undefined),
					},
					{
						label: "Issue",
						placeholder: "No filter",
						options: facets.at((each) =>
							each.issues.map((issue) => ({
								value: issue.value,
								label: ISSUE_LABELS[issue.value],
								description: count.format(issue.count),
							})),
						),
						value: issue,
						onChange: (value) =>
							setIssue((value as (typeof ISSUE_FILTERS)[number]) ?? undefined),
					},
				]}
			/>
			<Table
				label="Tracks"
				items={tracks}
				columns={COLUMNS}
				row={{
					id: (row) => row.id,
					href: (row) => `${base}/${row.id}`,
					// Shift+Enter on the active row plays it, with the loaded rows after it as the queue.
					act: (row) => ({
						icon: "Play",
						label: `Play ${row.title ?? "Untitled"}`,
						onAct: () =>
							player.play(
								toTrack(row),
								queueFrom(row.id).map((each) => toTrack(each)),
							),
					}),
				}}
				selected={open}
			/>
		</Pane>
	);
}

// 1A, 1B, 2A ... for the order of the Camelot wheel; anything else last.
function camelot(key: string): number {
	const match = /^(\d{1,2})([AB])$/.exec(key);
	return match
		? Number(match[1]) * 2 + (match[2] === "B" ? 1 : 0)
		: Number.MAX_SAFE_INTEGER;
}
