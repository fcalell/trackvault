import { preload } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/settings/import")({
	loader: ({ context }) =>
		Promise.all([preload(context.queryClient, orpc.imports.spotify.read())]),
	component: ImportSettings,
});

function ImportSettings() {
	const spotify = orpc.imports.spotify.read();
	return (
		<Pane
			title="Playlist import"
			back="/settings"
			cover
			record={{
				within: "Settings",
				description:
					"Spotify playlists need your own app's client id and secret (developer.spotify.com/dashboard).",
			}}
		>
			<Form
				act={orpc.imports.updateSpotify}
				commit="field"
				values={spotify.at((each) => ({
					spotifyClientId: each.spotifyClientId ?? "",
					spotifyClientSecret: each.spotifyClientSecret ?? undefined,
				}))}
				submit={{ done: "Saved" }}
				fields={{
					spotifyClientId: { label: "Spotify client id" },
					spotifyClientSecret: {
						label: "Spotify client secret",
						control: "secret",
						description: "From your Spotify app.",
					},
				}}
			/>
		</Pane>
	);
}
