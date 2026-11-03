import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { BarChart } from "@fcalell/plugin-react-ui/components/bar-chart";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { Stats } from "@fcalell/plugin-react-ui/components/stats";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../../lib/api.ts";
import { useDebounced } from "../../lib/debounced.ts";
import { pathsOf } from "../../lib/playlists.tsx";

export const Route = createFileRoute("/_app/sets")({
	component: SetBuilder,
});

type Direction = "up" | "flat" | "down";
const DIRECTIONS: Array<{ value: Direction; label: string }> = [
	{ value: "flat", label: "Keep the energy" },
	{ value: "up", label: "Build up" },
	{ value: "down", label: "Bring down" },
];

interface Facts {
	bpm: number | null;
	key: string | null;
	energy: number | null;
	artist: string | null;
}

const facts = (t: Facts): string[] => [
	t.artist ?? "Unknown artist",
	t.bpm ? `${Math.round(t.bpm * 10) / 10} BPM` : "No BPM",
	t.key ?? "No key",
	t.energy ? `Energy ${t.energy}` : "No energy",
];

// Pick a track, see what mixes well after it (key, tempo, energy, genre, how long
// since it was played) and why, add it, and watch the set's flow: every step scored,
// weak ones marked. The set is saved as a manual playlist.
function SetBuilder() {
	const [direction, setDirection] = useState<Direction>("flat");
	const [text, setText] = useState("");
	const q = useDebounced(text.trim(), 150);
	const options = { direction, pitch: 8 };
	const draft = orpc.sets.draft.read(options);
	const next = orpc.sets.suggest.read({ ...options, limit: 15 });
	const found = orpc.sets.find.read({ q });
	const playlists = orpc.playlists.tree.read();
	const append = useMutation(orpc.sets.append.mutationOptions());
	const remove = useMutation(orpc.sets.remove.mutationOptions());
	const move = useMutation(orpc.sets.move.mutationOptions());
	const clear = useMutation(orpc.sets.clear.mutationOptions());
	const add = (id: string) => append.mutateAsync({ trackIds: [id] });
	return (
		<Pane
			title="Set builder"
			back={false}
			acts={[
				{
					icon: "Save",
					label: "Save as a playlist",
					sheet: sheetOf({
						title: "Save as a playlist",
						description:
							"A manual playlist in this order, in the sidebar and in Rekordbox.",
						form: {
							act: orpc.sets.save,
							fields: { name: { label: "Name" } },
							submit: { label: "Save", done: "Playlist saved" },
						},
					}),
				},
				{
					icon: "ListMusic",
					label: "Start from a playlist",
					sheet: sheetOf({
						title: "Start from a playlist",
						description: "The playlist's tracks replace the set, in its order.",
						form: {
							act: orpc.sets.fromPlaylist,
							fields: {
								playlistId: {
									label: "Playlist",
									options: playlists.at((rows) =>
										pathsOf(rows)
											.filter((each) => each.node.kind !== "folder")
											.map((each) => ({
												value: each.node.id,
												label: each.path,
											})),
									),
								},
							},
							submit: { label: "Start", done: "Set loaded" },
						},
					}),
				},
				{
					icon: "Eraser",
					label: "Clear the set",
					confirm: {
						title: "Clear the set?",
						sentence: "Every track leaves the draft.",
					},
					onAct: () => clear.mutateAsync(),
					done: "Set cleared",
				},
			]}
		>
			<Toolbar
				search={{
					value: text,
					onChange: setText,
					placeholder: "Find a track to add",
				}}
				filters={[
					{
						label: "Energy",
						placeholder: "Keep the energy",
						options: DIRECTIONS,
						value: direction,
						onChange: (value) => setDirection((value as Direction) ?? "flat"),
					},
				]}
			/>
			<Section
				title="Find"
				items={found.at((rows) =>
					rows.map(
						(each): Row => ({
							key: each.id,
							leading: { icon: "Music" },
							title: each.title ?? "Untitled",
							facts: facts(each),
							act: {
								icon: "Plus",
								label: `Add ${each.title ?? "Untitled"} to the set`,
								onAct: () => add(each.id),
							},
						}),
					),
				)}
				empty={{ sentence: "Search the library to add a track." }}
			/>
			<Stats
				items={[
					{ label: "Tracks", value: draft.at((each) => each.tracks.length) },
					{
						label: "Mix score",
						value: draft.at((each) => each.average),
						unit: "%",
					},
					{ label: "Weak steps", value: draft.at((each) => each.weak) },
				]}
			/>
			<Section title="Energy">
				<BarChart
					label="Energy along the set"
					items={draft.at((each) => each.curve)}
					bar={{
						key: (point) => point.id,
						value: (point) => point.energy ?? 0,
						at: (point) => point.camelot ?? "",
					}}
					unit="energy"
				/>
			</Section>
			<Section
				title="Set"
				items={draft.at((each) =>
					each.tracks.map(
						(track, at): Row => ({
							key: track.id,
							leading: { icon: "Music" },
							title: `${at + 1}. ${track.title ?? "Untitled"}`,
							facts: [
								...(track.weak
									? [{ tone: "attention" as const, label: "Weak step" }]
									: []),
								...facts(track),
								...(track.score !== null
									? [`${track.score}% from the last`]
									: []),
							],
							...(track.weak && track.why ? { line: track.why } : {}),
							href: `/library/${track.id}`,
							act: {
								icon: "X",
								label: `Take ${track.title ?? "Untitled"} out of the set`,
								onAct: () => remove.mutateAsync({ id: track.id }),
							},
						}),
					),
				)}
				reorder={{
					onMove: (id, to) => move.mutateAsync({ id, index: to.index }),
					done: "Set reordered",
				}}
				empty={{ sentence: "Add a track to start the set." }}
			/>
			<Section
				title="Next"
				items={next.at((rows) =>
					rows.map(
						(each): Row => ({
							key: each.id,
							leading: { icon: "Music" },
							title: each.title ?? "Untitled",
							facts: facts(each),
							line: each.why,
							trailing: { value: `${each.score}%` },
							act: {
								icon: "Plus",
								label: `Add ${each.title ?? "Untitled"} to the set`,
								onAct: () => add(each.id),
							},
						}),
					),
				)}
				empty={{ sentence: "Suggestions follow the last track of the set." }}
			/>
		</Pane>
	);
}
