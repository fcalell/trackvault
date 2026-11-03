import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import { Card } from "@fcalell/plugin-react-ui/components/card";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Image } from "@fcalell/plugin-react-ui/components/image";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Picker } from "@fcalell/plugin-react-ui/components/picker";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Text } from "@fcalell/plugin-react-ui/components/text";
import { Waveform } from "@fcalell/plugin-react-ui/components/waveform";
import {
	player,
	usePlayer,
	usePlayerTime,
} from "@fcalell/plugin-react-ui/lib/player";
import { useQuery } from "@tanstack/react-query";
import { ISSUE } from "@trackvault/core/issues";
import {
	ISSUE_FILTERS,
	ISSUE_LABELS,
	type IssueFilter,
} from "../../shared/library.ts";
import { bitrate, bpm, duration } from "../ui/figures.ts";
import { fetchPeaks, toTrack } from "../ui/track.ts";
import { orpc } from "./api.ts";
import { queueFrom } from "./queue.ts";

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

// Plays the track from the start, with the list it was opened from as the queue.
function playTrack(row: Track, peaks?: Float32Array): void {
	const queue = queueFrom(row.id);
	player.play(
		toTrack(row, peaks),
		queue.length > 0
			? queue.map((each) =>
					each.id === row.id ? toTrack(row, peaks) : toTrack(each),
				)
			: undefined,
	);
}

// The waveform of the track once the hub has drawn it, the playhead following
// the player while this track is the one playing; a press seeks, and starts the
// track if it is not playing.
function TrackWaveform({ id, track }: { id: string; track: Track }) {
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
				if (!playing) playTrack(track, peaks.data);
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

// A track's record: its name and facts, the waveform, its issues and its tags to
// edit. A tag saves as the field is left; the hub writes it to the file in the
// background.
export function TrackRecord({ id, within }: { id: string; within: string }) {
	const track = orpc.tracks.get.read({ id });
	const assigned = orpc.tags.forTrack.read({ trackId: id });
	const everyTag = orpc.tags.list.read();
	const assign = useMutation(orpc.tags.assign.mutationOptions());
	const better = useMutation(orpc.wishlist.addFromTrack.mutationOptions());
	const autotag = useMutation(orpc.bulk.autotag.mutationOptions());
	const fetchArt = useMutation(orpc.bulk.art.mutationOptions());
	const analyse = useMutation(orpc.bulk.analyse.mutationOptions());
	const addToSet = useMutation(orpc.sets.append.mutationOptions());
	const hasArt = useRead(track)?.hasArt;
	return (
		<Pane
			title={track.at((each) => each.title ?? "Untitled")}
			noun="track"
			read={track}
			record={{
				within,
				overline: [track.at((each) => each.artist ?? "Unknown artist")],
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
					onAct: async () => {
						const row = await orpc.tracks.get.call({ id });
						const peaks = row.peaks ? await fetchPeaks(id) : undefined;
						playTrack(row, peaks);
					},
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
						analyse.mutateAsync({ tracks: { ids: [id] }, force: true }),
					done: "Analysing",
					to: "/jobs",
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
			<Section title="Cover" read={track}>
				<Card>
					{hasArt ? (
						<Image
							src={`/media/${encodeURIComponent(id)}/art?size=640`}
							alt="Cover art"
							aspect={1}
						/>
					) : (
						<Text kind="meta">
							No cover is embedded. Fetch art looks one up.
						</Text>
					)}
				</Card>
			</Section>
			<Section
				title="Analysis"
				items={track.at((each) =>
					each.analysis
						? [
								{
									key: "bpm",
									label: "Tempo",
									title: each.analysis.bpm
										? `${each.analysis.bpm} BPM`
										: "Not measured",
									facts:
										each.analysis.bpmConfidence === null
											? []
											: [`${each.analysis.bpmConfidence}% sure`],
								},
								{
									key: "key",
									label: "Key",
									title: each.analysis.key ?? "Not measured",
									facts:
										each.analysis.keyConfidence === null
											? []
											: [`${each.analysis.keyConfidence}% sure`],
								},
								{
									key: "energy",
									label: "Energy",
									title: each.analysis.energy
										? String(each.analysis.energy)
										: "Not measured",
									facts:
										each.analysis.energyConfidence === null
											? []
											: [`${each.analysis.energyConfidence}% sure`],
								},
								{
									key: "lufs",
									label: "Loudness",
									title:
										each.analysis.lufs === null
											? "Not measured"
											: `${Math.round(each.analysis.lufs * 10) / 10} LUFS`,
									facts:
										each.analysis.loudnessRange === null
											? []
											: [
													`range ${Math.round(each.analysis.loudnessRange * 10) / 10} LU`,
												],
								},
							]
						: [],
				)}
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
					submit={{ done: "Saved" }}
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
		</Pane>
	);
}
