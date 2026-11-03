import { preload, useRead } from "@fcalell/plugin-api/tanstack-query";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { TrackRecord } from "../../lib/track-record.tsx";

export const Route = createFileRoute("/_app/playlists/$playlistId/$trackId")({
	loader: ({ context, params }) =>
		preload(context.queryClient, orpc.tracks.get.read({ id: params.trackId })),
	component: PlaylistTrack,
});

// A track of the playlist, opened beside it.
function PlaylistTrack() {
	const { playlistId, trackId } = Route.useParams();
	const name = useRead(
		orpc.playlists.get.read({ id: playlistId }).at((each) => each.name),
	);
	return <TrackRecord id={trackId} within={name ?? "Playlist"} />;
}
