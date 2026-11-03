import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { BarChart } from "@fcalell/plugin-react-ui/components/bar-chart";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../../lib/api.ts";
import { useDebounced } from "../../lib/debounced.ts";
import { pathsOf } from "../../lib/playlists.tsx";
import { bpm, signed } from "../../ui/figures.ts";
import { trackRow } from "../../ui/track.ts";

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

interface Change {
	bpm: number | null;
	energy: number | null;
	keyFrom: string | null;
}

// A track after another: how its tempo, key and energy move from the one before.
const steps = (t: Facts, from: Change): string[] => [
	from.bpm === null ? "No BPM" : `${signed(from.bpm)} BPM`,
	t.key ? (from.keyFrom ? `${from.keyFrom} to ${t.key}` : t.key) : "No key",
	from.energy === null ? "No energy" : `Energy ${signed(from.energy)}`,
];

const facts = (t: Facts): string[] => [
	t.bpm ? `${bpm(t.bpm)} BPM` : "No BPM",
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
			wide
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
				title="Next"
				items={next.at((rows) =>
					rows.map(
						(each): Row =>
							trackRow(each, {
								key: each.id,
								leading: { icon: "Music" },
								facts: steps(each, each.change),
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
			<Section
				title="Find"
				items={found.at((rows) =>
					rows.map(
						(each): Row =>
							trackRow(each, {
								key: each.id,
								leading: { icon: "Music" },
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
			<Section title="Energy">
				<BarChart
					label="Energy at each step of the set"
					items={draft.at((each) =>
						each.curve.map((point, at) => ({ ...point, step: at + 1 })),
					)}
					bar={{
						key: (point) => point.id,
						value: (point) => point.energy ?? 0,
						label: (point) => String(point.step),
					}}
					unit="energy"
					level
				/>
			</Section>
			<Section
				title="Set"
				description={draft.at((each) =>
					each.tracks.length > 1
						? `Mix score ${each.average}%. ${each.weak} weak ${each.weak === 1 ? "step" : "steps"}.`
						: "",
				)}
				items={draft.at((each) =>
					each.tracks.map(
						(track, at): Row =>
							trackRow(track, {
								key: track.id,
								label: String(at + 1),
								leading: { icon: "Music" },
								facts: [
									...(track.weak
										? [{ tone: "attention" as const, label: "Weak step" }]
										: []),
									...(track.change ? steps(track, track.change) : facts(track)),
									...(track.score !== null
										? [`${track.score}% from the last`]
										: []),
								],
								note: track.weak ? (track.why ?? undefined) : undefined,
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
		</Pane>
	);
}
