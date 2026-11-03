import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { usePlayer } from "@fcalell/plugin-native-ui/lib/player";
import { useLocalSearchParams } from "expo-router";
import { orpc } from "../../lib/api";
import { trackItems } from "../../lib/rows";

export default function PlaylistRecord() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const playlist = orpc.playlists.get.read({ id });
	const tracks = orpc.playlists.tracks.window({ playlistId: id, limit: 50 });
	const playing = usePlayer().track?.key;
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
				items={tracks.at((rows) => trackItems(tracks, rows, playing))}
				empty={{ sentence: "Nothing in this playlist." }}
			/>
		</Pane>
	);
}
