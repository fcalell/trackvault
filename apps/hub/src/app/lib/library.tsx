import { useMutation, useWindow } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { player, windowQueue } from "@fcalell/plugin-react-ui/lib/player";
import type { Picked, TableColumn } from "@fcalell/ui-core/descriptors";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { LibraryQuery } from "../../server/lib/library-query.ts";
import {
	type ISSUE_FILTERS,
	ISSUE_LABELS,
	type ListRow,
} from "../../shared/library.ts";
import { clock, quality, toTrack } from "../ui/track.ts";
import { orpc } from "./api.ts";
import { type EditInput, EditPreview, useEditFields } from "./bulk-edit.tsx";
import { useDebounced } from "./debounced.ts";
import { pathsOf } from "./playlists.tsx";
import { setQueueSource } from "./queue.ts";

// The keys are the hub's sort columns (shared/library.ts) where the column sorts.
export const LIBRARY_COLUMNS: TableColumn<ListRow>[] = [
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

const count = new Intl.NumberFormat("en");

// The library's list: a search box and filters over a table of every track, read a
// window at a time (the hub searches, filters and sorts). `base` is the route a
// row's record opens under.
export function LibraryPane({
	title,
	base,
	recent = false,
	initial = {},
}: {
	title: string;
	base: string;
	recent?: boolean;
	// Filters the page was opened with (a link from the Issues screen).
	initial?: {
		issue?: (typeof ISSUE_FILTERS)[number] | undefined;
		tag?: number | undefined;
		genre?: string | undefined;
		neverPlayed?: boolean | undefined;
	};
}) {
	const [text, setText] = useState("");
	const q = useDebounced(text.trim(), 120);
	const [genre, setGenre] = useState<string | undefined>(initial.genre);
	const [key, setKey] = useState<string>();
	const [issue, setIssue] = useState<
		(typeof ISSUE_FILTERS)[number] | undefined
	>(initial.issue);
	const [tag, setTag] = useState<number | undefined>(initial.tag);
	const [bpm, setBpm] = useState<string>();
	const [energy, setEnergy] = useState<number>();
	const [never, setNever] = useState<boolean | undefined>(initial.neverPlayed);
	const range = BPM_RANGES.find((each) => each.value === bpm);

	const query = useMemo<LibraryQuery>(
		() => ({
			q: q || undefined,
			genre,
			key,
			issue,
			tag,
			bpmMin: range?.min,
			bpmMax: range?.max,
			energy,
			neverPlayed: never,
			recent: recent || undefined,
		}),
		[q, genre, key, issue, tag, range, recent, energy, never],
	);
	const tracks = orpc.tracks.list.window(query);
	const facets = orpc.tracks.facets.read();
	const playlists = orpc.playlists.tree.read();
	const open = useParams({ strict: false }).trackId;

	// The rows a bulk act takes: the ticked ids, or the whole query less the unticked.
	const [picked, setPicked] = useState<Picked<LibraryQuery>>({ ids: [] });
	const [edit, setEdit] = useState<EditInput>();
	const fields = useEditFields();
	const rules = useMutation(orpc.bulk.rules.mutationOptions());
	const organise = useMutation(orpc.bulk.organise.mutationOptions());
	const dedupe = useMutation(orpc.bulk.dedupe.mutationOptions());
	const quarantine = useMutation(orpc.bulk.quarantine.mutationOptions());
	const autotag = useMutation(orpc.bulk.autotag.mutationOptions());
	const fetchArt = useMutation(orpc.bulk.art.mutationOptions());
	const analyse = useMutation(orpc.bulk.analyse.mutationOptions());
	const nothing =
		"ids" in picked && picked.ids.length === 0
			? "Choose tracks first."
			: undefined;

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
						label: "Energy",
						placeholder: "Any energy",
						options: facets.at((each) =>
							each.energies.map((row) => ({
								value: String(row.value),
								label: String(row.value),
								description: count.format(row.count),
							})),
						),
						value: energy === undefined ? undefined : String(energy),
						onChange: (value) => setEnergy(value ? Number(value) : undefined),
					},
					{
						label: "Played",
						placeholder: "Any",
						options: [{ value: "never", label: "Never played" }],
						value: never ? "never" : undefined,
						onChange: (value) => setNever(value ? true : undefined),
					},
					{
						label: "Tag",
						placeholder: "Any tag",
						options: facets.at((each) =>
							each.tags.map((row) => ({
								value: String(row.id),
								label: row.name,
								description: count.format(row.count),
							})),
						),
						value: tag === undefined ? undefined : String(tag),
						onChange: (value) => setTag(value ? Number(value) : undefined),
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
				columns={LIBRARY_COLUMNS}
				row={{
					id: (row) => row.id,
					href: (row) => `${base}/${row.id}`,
					// Shift+Enter on the active row plays it; Next and Previous follow the list.
					act: (row) => ({
						icon: "Play",
						label: `Play ${row.title ?? "Untitled"}`,
						onAct: () => {
							const at =
								rows?.findIndex(
									(each) => (each as ListRow | undefined)?.id === row.id,
								) ?? -1;
							player.play(
								toTrack(row),
								at >= 0
									? windowQueue(tracks, { track: toTrack, at })
									: undefined,
							);
						},
					}),
				}}
				selected={open}
				drag={{ kind: "track" }}
				choose={{ picked, onPick: setPicked, noun: "tracks" }}
				select={{
					acts: [
						{
							label: "Add to playlist",
							blocked: nothing,
							sheet: sheetOf({
								title: "Add to playlist",
								description:
									"The chosen tracks go to the end of the playlist. Drag rows onto a playlist in the sidebar to do the same.",
								form: {
									act: orpc.playlists.add,
									given: { tracks: picked },
									fields: {
										playlistId: {
											label: "Playlist",
											options: playlists.at((rows) =>
												pathsOf(rows)
													.filter((each) => each.node.kind === "manual")
													.map((each) => ({
														value: each.node.id,
														label: each.path,
													})),
											),
										},
									},
									submit: { label: "Add", done: "Added to the playlist" },
								},
							}),
						},
						{
							label: "Auto-tag",
							blocked: nothing,
							onAct: () => autotag.mutateAsync({ tracks: picked }),
							done: "Looking the tracks up; the results wait in Review",
							to: "/jobs",
						},
						{
							label: "Fetch art",
							blocked: nothing,
							onAct: () => fetchArt.mutateAsync({ tracks: picked }),
							done: "Looking for covers",
							to: "/jobs",
						},
						{
							label: "Analyse",
							blocked: nothing,
							onAct: () => analyse.mutateAsync({ tracks: picked }),
							done: "Analysing in the background",
							to: "/jobs",
						},
						{
							label: "Quarantine",
							destructive: true,
							blocked: nothing,
							confirm: {
								title: "Quarantine the chosen tracks?",
								sentence:
									"Their files move to the quarantine and the tracks leave the library. Restore them from Quarantine, or undo the batch in History.",
							},
							onAct: () => quarantine.mutateAsync({ tracks: picked }),
							done: "Moving files to the quarantine",
							to: "/jobs",
						},
						{
							label: "Find duplicates",
							blocked: nothing,
							onAct: () => dedupe.mutateAsync({ tracks: picked }),
							done: "Looking for duplicates",
							to: "/jobs",
						},
						{
							label: "Organise",
							blocked: nothing,
							confirm: {
								title: "Organise the chosen tracks?",
								sentence:
									"Their files move to the folders the Organiser's template names. Undo the batch in History.",
							},
							onAct: () => organise.mutateAsync({ tracks: picked }),
							done: "Organising",
							to: "/jobs",
						},
						{
							label: "Apply rules",
							blocked: nothing,
							confirm: {
								title: "Apply the cleanup rules?",
								sentence:
									"Every enabled rule runs over the chosen tracks and their tags are rewritten. Undo the batch in History.",
							},
							onAct: () => rules.mutateAsync({ tracks: picked }),
							done: "Applying rules",
							to: "/jobs",
						},
						{
							label: "Edit tags",
							blocked: nothing,
							sheet: sheetOf({
								title: "Edit tags",
								description:
									"Fill the tags to set on the chosen tracks. Empty keeps a tag, a dash clears it.",
								form: {
									act: orpc.bulk.edit,
									given: { tracks: picked },
									fields,
									onChange: setEdit,
									submit: {
										label: "Apply",
										done: "Editing tags",
										to: "/jobs",
									},
								},
								children: <EditPreview picked={picked} edit={edit} />,
							}),
						},
					],
				}}
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
