import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { Card } from "@fcalell/plugin-react-ui/components/card";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Text } from "@fcalell/plugin-react-ui/components/text";
import { Waveform } from "@fcalell/plugin-react-ui/components/waveform";
import {
	player,
	usePlayer,
	usePlayerTime,
} from "@fcalell/plugin-react-ui/lib/player";
import { useQuery } from "@tanstack/react-query";
import type { IssueFilter } from "../../shared/library.ts";
import { clock, fetchPeaks, quality, toTrack } from "../ui/track.ts";
import { orpc } from "./api.ts";
import { queueFrom } from "./queue.ts";

// The issue bits (core/issues) and what the record says of each.
const ISSUES: Array<[IssueFilter, number, string]> = [
	["lowBitrate", 1, "Low bitrate"],
	["noTitle", 2, "No title"],
	["noArtist", 4, "No artist"],
	["noGenre", 8, "No genre"],
	["noBpm", 16, "No BPM"],
	["noKey", 32, "No key"],
	["noArt", 64, "No artwork"],
	["undecodable", 128, "Unreadable audio"],
	["missingFile", 256, "File missing"],
];

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
			// biome-ignore lint/a11y/useValidAriaRole: `Text`'s role is its type role, not an ARIA one
			<Text role="meta">
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
	return (
		<Pane
			title={track.at((each) => each.title ?? "Untitled")}
			noun="track"
			read={track}
			record={{
				within,
				overline: [track.at((each) => each.artist ?? "Unknown artist")],
				facts: [
					track.at((each) => quality(each.format, each.bitrate)),
					track.at((each) => clock(each.durationMs) ?? "No length"),
					track.at((each) =>
						each.bpm ? `${Math.round(each.bpm * 10) / 10} BPM` : "No BPM",
					),
					track.at((each) => each.key ?? "No key"),
					track.at((each) => each.genre ?? "No genre"),
				],
			}}
			actions={[
				{
					icon: "Play",
					label: "Play",
					onAct: async () => {
						const row = await orpc.tracks.get.call({ id });
						const peaks = row.peaks ? await fetchPeaks(id) : undefined;
						playTrack(row, peaks);
					},
				},
			]}
		>
			<Section title="Waveform" read={track}>
				<Card>
					<RecordWaveform id={id} />
				</Card>
			</Section>
			<Section
				title="Issues"
				items={track.at((each) =>
					ISSUES.filter(([, bit]) => (each.issues & bit) !== 0).map(
						([name, , words]) => ({
							key: name,
							leading: { status: "attention" as const },
							title: words,
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
		</Pane>
	);
}
