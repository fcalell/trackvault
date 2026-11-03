import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { useLocalSearchParams } from "expo-router";
import { orpc } from "../../lib/api";
import { duration, trackMeta } from "../../lib/format";

export default function PlaylistRecord() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const playlist = orpc.playlists.get.read({ id });
	const tracks = orpc.playlists.tracks.window({ playlistId: id, limit: 50 });
	return (
		<Pane
			read={playlist}
			noun="playlist"
			title={playlist.at((p) => p.name)}
			back="/playlists"
			record={{
				within: "Playlists",
				overline: [
					playlist.at((p) =>
						p.kind === "smart" ? "Smart playlist" : "Playlist",
					),
				],
				facts: [],
			}}
		>
			<Section
				title="Tracks"
				items={tracks.at((rows) =>
					rows.map((t) => ({
						key: t.id,
						title: t.title ?? "Untitled",
						meta: trackMeta(t),
						trailing: { value: duration(t.durationMs) },
						href: `/track/${t.id}` as const,
					})),
				)}
				empty={{ sentence: "Nothing in this playlist." }}
			/>
		</Pane>
	);
}
