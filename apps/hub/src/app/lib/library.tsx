import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Picker } from "@fcalell/plugin-react-ui/components/picker";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { Picked } from "@fcalell/ui-core/descriptors";
import { useParams } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import type { LibraryQuery } from "../../server/lib/library-query.ts";
import { type ISSUE_FILTERS, ISSUE_LABELS } from "../../shared/library.ts";
import { count } from "../ui/figures.ts";
import { TRACK_COLUMNS } from "../ui/track.ts";
import { orpc } from "./api.ts";
import { EditPreview, useEditFields } from "./bulk-edit.tsx";
import { useChosen } from "./chosen.ts";
import { useDebounced } from "./debounced.ts";
import { pathsOf } from "./playlists.tsx";
import { ListSource, useListPlay } from "./queue.ts";

const BPM_RANGES = [
	{ value: "0-99", label: "Under 100", min: 0, max: 99.99 },
	{ value: "100-119", label: "100 to 119", min: 100, max: 119.99 },
	{ value: "120-124", label: "120 to 124", min: 120, max: 124.99 },
	{ value: "125-129", label: "125 to 129", min: 125, max: 129.99 },
	{ value: "130-139", label: "130 to 139", min: 130, max: 139.99 },
	{ value: "140-159", label: "140 to 159", min: 140, max: 159.99 },
	{ value: "160-999", label: "160 and over", min: 160, max: 999 },
] as const;

const BPM_OPTIONS: Array<{ value: string | null; label: string }> = [
	{ value: null, label: "Any tempo" },
	...BPM_RANGES.map(({ value, label }) => ({ value, label })),
];

// The library's list: a search box and filters over a table of every track, read a
// window at a time (the hub searches, filters and sorts). `children` is the record
// a row opens, beside the list.
export function LibraryPane({
	title,
	initial = {},
	children,
}: {
	title: string;
	children: ReactNode;
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
		}),
		[q, genre, key, issue, tag, range, energy, never],
	);
	const tracks = orpc.tracks.list.window(query);
	const facets = orpc.tracks.facets.read();
	const playlists = orpc.playlists.tree.read();
	const open = useParams({ strict: false }).trackId;

	// The rows a bulk act takes: the ticked ids, or the whole query less the unticked.
	const [picked, setPicked] = useState<Picked<LibraryQuery>>({ ids: [] });
	const fields = useEditFields();
	const rules = useMutation(orpc.bulk.rules.mutationOptions());
	const organise = useMutation(orpc.bulk.organise.mutationOptions());
	const dedupe = useMutation(orpc.bulk.dedupe.mutationOptions());
	const quarantine = useMutation(orpc.bulk.quarantine.mutationOptions());
	const autotag = useMutation(orpc.bulk.autotag.mutationOptions());
	const fetchArt = useMutation(orpc.bulk.art.mutationOptions());
	const analyse = useMutation(orpc.bulk.analyse.mutationOptions());
	const { chosen, blocked: nothing } = useChosen(
		tracks,
		picked,
		setPicked,
		query,
		"tracks",
	);

	const { act } = useListPlay(tracks);

	return (
		<ListSource value={tracks}>
			<Pane
				title={title}
				back={false}
				wide
				acts={[
					{
						icon: "RefreshCw",
						label: "Scan now",
						onAct: () => orpc.scan.start.call(),
						done: "Scan started",
						to: "/jobs",
					},
				]}
				foot={
					<ActionBar
						chosen={chosen}
						acts={[
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
										after: (input) => (
											<EditPreview picked={picked} edit={input} />
										),
										submit: {
											label: "Apply",
											done: "Editing tags",
											to: "/jobs",
										},
									},
								}),
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
						]}
					/>
				}
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
									line: count(genre.count),
								})),
							),
							value: genre,
							onChange: (value) => setGenre(value ?? undefined),
						},
						{
							label: "Energy",
							placeholder: "Any energy",
							options: facets.at((each) =>
								each.energies.map((row) => ({
									value: String(row.value),
									label: String(row.value),
									line: count(row.count),
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
									line: count(row.count),
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
									line: count(issue.count),
								})),
							),
							value: issue,
							onChange: (value) =>
								setIssue(
									(value as (typeof ISSUE_FILTERS)[number]) ?? undefined,
								),
						},
					]}
				>
					<Picker
						fit="bar"
						label="BPM"
						placeholder="Any tempo"
						options={BPM_OPTIONS}
						value={bpm ?? null}
						onChange={(value) => setBpm(value ?? undefined)}
					/>
					<Picker
						fit="bar"
						label="Key"
						placeholder="Any key"
						options={facets.at((each) => [
							{ value: null, label: "Any key" },
							...each.keys
								.toSorted((a, b) => camelot(a.value) - camelot(b.value))
								.map((key) => ({
									value: key.value,
									label: key.value,
									line: count(key.count),
								})),
						])}
						value={key ?? null}
						onChange={(value) => setKey(value ?? undefined)}
					/>
				</Toolbar>
				<Table
					label="Tracks"
					items={tracks}
					columns={TRACK_COLUMNS}
					row={{
						id: (row) => row.id,
						href: (row) => `/library/${row.id}`,
						// Shift+Enter on the active row plays it; Next and Previous follow the list.
						act,
					}}
					selected={open}
					drag={{ kind: "track" }}
					choose={{ picked, onPick: setPicked }}
				/>
			</Pane>
			{children}
		</ListSource>
	);
}

// 1A, 1B, 2A ... for the order of the Camelot wheel; anything else last.
function camelot(key: string): number {
	const match = /^(\d{1,2})([AB])$/.exec(key);
	return match
		? Number(match[1]) * 2 + (match[2] === "B" ? 1 : 0)
		: Number.MAX_SAFE_INTEGER;
}
