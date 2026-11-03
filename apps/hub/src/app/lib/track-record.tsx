import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import { Card } from "@fcalell/plugin-react-ui/components/card";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Picker } from "@fcalell/plugin-react-ui/components/picker";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { Text } from "@fcalell/plugin-react-ui/components/text";
import { Waveform } from "@fcalell/plugin-react-ui/components/waveform";
import {
	player,
	usePlayer,
	usePlayerTime,
} from "@fcalell/plugin-react-ui/lib/player";
import { useQuery } from "@tanstack/react-query";
import { ISSUE } from "@trackvault/core/issues";
import { use } from "react";
import {
	ISSUE_FILTERS,
	ISSUE_LABELS,
	type IssueFilter,
} from "../../shared/library.ts";
import { batchToast, namedBatch, queuedBatch } from "../ui/batch.ts";
import { age, bitrate, bpm, duration } from "../ui/figures.ts";
import { fetchPeaks, trackRow } from "../ui/track.ts";
import { orpc } from "./api.ts";
import { ListSource, useListPlay } from "./queue.ts";

// The issue bits (core/issues) in the order the record lists them.
const ISSUES: Array<[IssueFilter, number]> = ISSUE_FILTERS.map((name) => [
	name,
	ISSUE[name],
]);

type Track =
	ReturnType<typeof orpc.tracks.get.read> extends infer R
		? R extends { at: (map: (value: infer V) => unknown) => unknown }
			? V
			: never
		: never;

// The waveform of the track once the hub has drawn it, the playhead following
// the player while this track is the one playing; a press seeks, and starts the
// track if it is not playing.
function TrackWaveform({ id, track }: { id: string; track: Track }) {
	const { play } = useListPlay(use(ListSource));
	const peaks = useQuery({
		queryKey: ["peaks", id],
		queryFn: () => fetchPeaks(id),
		enabled: track.peaks,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const playing = usePlayer().track?.key === id;
	const { time } = usePlayerTime();
	if (!peaks.data || !track.durationMs) {
		return (
			<Text kind="meta">
				{track.peaks
					? "Drawing the waveform."
					: "The waveform is drawn after a scan, with ffmpeg on the hub."}
			</Text>
		);
	}
	return (
		<Waveform
			label="Seek the track"
			peaks={{ values: peaks.data }}
			duration={track.durationMs / 1000}
			at={playing ? time : 0}
			onSeek={(seconds) => {
				if (!playing) play(track, peaks.data);
				player.seek(seconds);
			}}
		/>
	);
}

// Draws the waveform of the track the record read holds.
function RecordWaveform({ id }: { id: string }) {
	const track = useRead(orpc.tracks.get.read({ id }));
	return track ? <TrackWaveform id={id} track={track} /> : null;
}

// "albumArtist" as "Album artist".
const named = (field: string): string => {
	const words = field.replace(/([A-Z])/g, " $1").toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
};

// A track's record: its name and facts, the waveform, the tags to edit (a tag saves
// as the field is left; the hub writes it to the file in the background), what the
// analysis measured beside them, and where the track is: its playlists, duplicates and
// history.
export function TrackRecord({ id, within }: { id: string; within: string }) {
	const track = orpc.tracks.get.read({ id });
	const assigned = orpc.tags.forTrack.read({ trackId: id });
	const everyTag = orpc.tags.list.read();
	const playlists = orpc.playlists.forTrack.read({ trackId: id });
	const duplicates = orpc.tracks.duplicates.read({ id });
	const history = orpc.tracks.history.read({ id });
	const assign = useMutation(orpc.tags.assign.mutationOptions());
	const update = useMutation(orpc.tracks.update.mutationOptions());
	const better = useMutation(orpc.wishlist.addFromTrack.mutationOptions());
	const autotag = useMutation(orpc.bulk.autotag.mutationOptions());
	const fetchArt = useMutation(orpc.bulk.art.mutationOptions());
	const analyse = useMutation(orpc.bulk.analyse.mutationOptions());
	const addToSet = useMutation(orpc.sets.append.mutationOptions());
	const { play } = useListPlay(use(ListSource));
	return (
		<Pane
			title={track.at((each) => each.title ?? "Untitled")}
			noun="track"
			read={track}
			record={{
				within,
				overline: [track.at((each) => each.artist ?? "Unknown artist")],
				image: {
					src: track.at((each) =>
						each.hasArt ? `/media/${encodeURIComponent(id)}/art?size=320` : "",
					),
					alt: "Cover art",
				},
				facts: [
					track.at((each) => bitrate(each.format, each.bitrate)),
					track.at((each) => duration(each.durationMs) ?? "No length"),
					track.at((each) => (each.bpm ? `${bpm(each.bpm)} BPM` : "No BPM")),
					track.at((each) => each.key ?? "No key"),
					track.at((each) => each.genre ?? "No genre"),
				],
			}}
			acts={[
				{
					icon: "Play",
					label: "Play",
					onAct: async () => play(await orpc.tracks.get.call({ id })),
				},
				{
					icon: "ListPlus",
					label: "Add to the set",
					onAct: () => addToSet.mutateAsync({ trackIds: [id] }),
					done: "Added to the set",
					to: "/sets",
				},
				{
					icon: "Sparkles",
					label: "Auto-tag",
					onAct: () => autotag.mutateAsync({ tracks: { ids: [id] } }),
					done: "Looking the track up; the results wait in Review",
					to: "/review",
				},
				{
					icon: "Image",
					label: "Fetch art",
					onAct: () =>
						fetchArt.mutateAsync({ tracks: { ids: [id] }, force: true }),
					done: "Looking for a cover",
					to: "/jobs",
				},
				{
					icon: "AudioWaveform",
					label: "Analyse",
					onAct: () =>
						queuedBatch(
							analyse.mutateAsync({ tracks: { ids: [id] }, force: true }),
							"Analysing",
						),
				},
				{
					icon: "Search",
					label: "Find a better version",
					onAct: () => better.mutateAsync({ trackId: id }),
					done: "Added to the wishlist",
					to: "/wishlist",
				},
			]}
		>
			<Section title="Waveform" read={track}>
				<Card>
					<RecordWaveform id={id} />
				</Card>
			</Section>
			<Section title="Tags">
				<Form
					act={orpc.tracks.update}
					commit="field"
					given={{ id }}
					values={track.at((each) => ({
						title: each.title ?? "",
						artist: each.artist ?? "",
						remixer: each.remixer ?? "",
						album: each.album ?? "",
						albumArtist: each.albumArtist ?? "",
						label: each.label ?? "",
						genre: each.genre ?? "",
						key: each.key ?? "",
						bpm: each.bpm ?? null,
						year: each.year ?? null,
						energy: each.energy ?? null,
						rating: each.rating,
						isrc: each.isrc ?? "",
						comment: each.comment ?? "",
					}))}
					onDone={(answer) => {
						if (answer.batch) batchToast({ id: answer.batch }, "Saved");
					}}
					fields={{
						title: { label: "Title" },
						artist: { label: "Artist" },
						remixer: { label: "Remixer" },
						album: { label: "Album" },
						albumArtist: { label: "Album artist" },
						label: { label: "Label" },
						genre: { label: "Genre" },
						key: { label: "Key" },
						bpm: { label: "BPM" },
						year: { label: "Year" },
						energy: { label: "Energy" },
						rating: { label: "Rating" },
						isrc: { label: "ISRC" },
						comment: { label: "Comment", control: "prose" },
					}}
				/>
			</Section>
			<Section
				title="Analysis"
				items={track.at((each): Row[] => {
					const found = each.analysis;
					if (!found) return [];
					const sure = (value: number | null): string[] =>
						value === null ? [] : [`${value}% sure`];
					const bpmDiffers =
						found.bpm !== null &&
						(each.bpm === null ||
							Math.round(each.bpm) !== Math.round(found.bpm));
					const keyDiffers =
						found.key !== null &&
						(each.key === null ||
							each.key.toLowerCase() !== found.key.toLowerCase());
					return [
						{
							key: "bpm",
							label: "Tempo",
							title: found.bpm ? `${bpm(found.bpm)} BPM` : "Not measured",
							facts: [
								...(bpmDiffers
									? [each.bpm === null ? "No tag" : `Tag ${bpm(each.bpm)}`]
									: []),
								...sure(found.bpmConfidence),
							],
							...(bpmDiffers && found.bpm !== null
								? {
										act: {
											icon: "Check" as const,
											label: "Use analysis",
											onAct: async () =>
												namedBatch(
													await update.mutateAsync({ id, bpm: bpm(found.bpm) }),
													"Tempo set",
													"The tempo was already that",
												),
										},
									}
								: {}),
						},
						{
							key: "key",
							label: "Key",
							title: found.key ?? "Not measured",
							facts: [
								...(keyDiffers
									? [each.key ? `Tag ${each.key}` : "No tag"]
									: []),
								...sure(found.keyConfidence),
							],
							...(keyDiffers && found.key !== null
								? {
										act: {
											icon: "Check" as const,
											label: "Use analysis",
											onAct: async () =>
												namedBatch(
													await update.mutateAsync({ id, key: found.key }),
													"Key set",
													"The key was already that",
												),
										},
									}
								: {}),
						},
						{
							key: "energy",
							label: "Energy",
							title: found.energy ? String(found.energy) : "Not measured",
							facts: sure(found.energyConfidence),
						},
						{
							key: "lufs",
							label: "Loudness",
							title:
								found.lufs === null
									? "Not measured"
									: `${Math.round(found.lufs * 10) / 10} LUFS`,
							facts:
								found.loudnessRange === null
									? []
									: [`range ${Math.round(found.loudnessRange * 10) / 10} LU`],
						},
					];
				})}
				empty={{
					sentence:
						"Not analysed yet. Analyse measures tempo, key, energy and loudness.",
				}}
			/>
			<Section
				title="Issues"
				items={track.at((each) =>
					ISSUES.filter(([, bit]) => (each.issues & bit) !== 0).map(
						([name]) => ({
							key: name,
							title: ISSUE_LABELS[name],
						}),
					),
				)}
				empty={{ sentence: "Nothing to fix." }}
			/>
			<Section title="Custom tags" read={assigned}>
				<Card>
					<Picker
						fit="list"
						label="Tags"
						items={everyTag}
						option={{ value: (row) => row.name, label: (row) => row.name }}
						value={assigned.at((rows) => rows.map((row) => row.name))}
						onChange={(names: string[]) =>
							assign.mutateAsync({ trackId: id, names })
						}
					/>
				</Card>
			</Section>
			<Section
				title="Playlists"
				items={playlists.at((rows) =>
					rows.map(
						(row): Row => ({
							key: row.id,
							leading: { icon: "ListMusic" },
							title: row.name,
							href: `/playlists/${row.id}`,
						}),
					),
				)}
				empty={{ sentence: "In no playlist." }}
			/>
			<Section
				title="Duplicates"
				items={duplicates.at((rows) =>
					rows.map(
						(row): Row =>
							trackRow(row, {
								key: row.id,
								leading: { icon: "Copy" },
								facts: [
									bitrate(row.format, row.bitrate),
									`${row.reason}, ${row.confidence}% sure`,
								],
								href: `/library/${row.id}`,
							}),
					),
				)}
				empty={{ sentence: "No duplicates found." }}
			/>
			<Section
				title="History"
				items={history.at((rows) =>
					rows.map(
						(row): Row => ({
							key: String(row.seq),
							title: named(row.field),
							line: `${row.before ?? "Empty"} to ${row.after ?? "Empty"}`,
							facts: [row.label, ...(row.undone ? ["Undone"] : [])],
							trailing: { age: age(row.at) },
							href: `/history/${row.batchId}`,
						}),
					),
				)}
				empty={{ sentence: "Nothing changed on this track yet." }}
			/>
		</Pane>
	);
}
