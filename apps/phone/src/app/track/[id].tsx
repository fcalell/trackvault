import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { Sheet } from "@fcalell/plugin-native-ui/components/sheet";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { orpc } from "../../lib/api";
import { duration } from "../../lib/format";
import { refresh } from "../../lib/refresh";
import type { TrackFull } from "../../lib/types";

export default function TrackRecord() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const track = orpc.tracks.get.read({ id });
	const inPlaylists = orpc.playlists.forTrack.read({ trackId: id });
	const playlists = orpc.playlists.tree.read();
	const add = useMutation({
		...orpc.playlists.add.mutationOptions(),
		onSuccess: refresh,
	});
	const wantBetter = useMutation({
		...orpc.wishlist.addFromTrack.mutationOptions(),
		onSuccess: refresh,
	});
	const [choosing, setChoosing] = useState(false);
	const fact = (label: string, value: (t: TrackFull) => string) => ({
		label,
		title: track.at((t) => value(t)),
	});
	return (
		<Pane
			read={track}
			noun="track"
			title={track.at((t) => t.title ?? "Untitled")}
			back="/"
			record={{
				within: "Library",
				overline: [track.at((t) => t.artist ?? "Unknown artist")],
				facts: [
					track.at((t) => (t.bpm ? `${Math.round(t.bpm)} BPM` : "")),
					track.at((t) => t.key ?? ""),
					track.at((t) => duration(t.durationMs)),
				],
			}}
			actions={[
				{
					icon: "ListPlus",
					label: "Add to a playlist",
					onAct: () => setChoosing(true),
				},
				{
					icon: "Shuffle",
					label: "What plays next",
					href: `/next?from=${id}` as const,
				},
			]}
			more={[
				{
					label: "Find a better version",
					icon: "Search",
					onAct: () => wantBetter.mutateAsync({ trackId: id }),
					done: "Added to the wishlist.",
				},
			]}
		>
			<Section
				title="Tags"
				items={[
					fact("Title", (t) => t.title ?? ""),
					fact("Artist", (t) => t.artist ?? ""),
					fact("Mix", (t) => t.mixName ?? ""),
					fact("Album", (t) => t.album ?? ""),
					fact("Label", (t) => t.label ?? ""),
					fact("Genre", (t) => t.genre ?? ""),
					fact("Year", (t) => (t.year ? String(t.year) : "")),
					fact("BPM", (t) => (t.bpm ? t.bpm.toFixed(1) : "")),
					fact("Key", (t) => t.key ?? ""),
					fact("Energy", (t) => (t.energy ? String(t.energy) : "")),
					fact("Rating", (t) => (t.rating ? "★".repeat(t.rating) : "")),
					fact("Comment", (t) => t.comment ?? ""),
				]}
			/>
			<Section
				title="File"
				items={[
					fact("Format", (t) => t.format.toUpperCase()),
					fact("Bitrate", (t) => (t.bitrate ? `${t.bitrate} kbps` : "")),
					fact("Length", (t) => duration(t.durationMs)),
					fact("Plays", (t) => String(t.playCount)),
				]}
			/>
			<Section
				title="In playlists"
				items={inPlaylists.at((rows) =>
					rows.map((p) => ({
						key: p.id,
						title: p.name,
						href: `/playlist/${p.id}` as const,
					})),
				)}
				empty={{ sentence: "Not in a playlist." }}
			/>
			<Sheet
				open={choosing}
				onClose={() => setChoosing(false)}
				title="Add to a playlist"
			>
				<Section
					items={playlists.at((rows) =>
						rows
							.filter((p) => p.kind === "manual")
							.map((p) => ({
								key: p.id,
								title: p.name,
								meta: [`${p.tracks} tracks`],
								act: {
									icon: "Plus" as const,
									label: `Add to ${p.name}`,
									done: `Added to ${p.name}.`,
									onAct: async () => {
										await add.mutateAsync({
											playlistId: p.id,
											tracks: { ids: [id] },
										});
										setChoosing(false);
									},
								},
							})),
					)}
					empty={{ sentence: "No manual playlist yet." }}
				/>
			</Sheet>
		</Pane>
	);
}
