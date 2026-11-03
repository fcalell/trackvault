import { preload } from "@fcalell/plugin-api/tanstack-query";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { TrackRecord } from "../../lib/track-record.tsx";

export const Route = createFileRoute("/_app/recent/$trackId")({
	loader: ({ context, params }) =>
		preload(context.queryClient, orpc.tracks.get.read({ id: params.trackId })),
	component: () => (
		<TrackRecord id={Route.useParams().trackId} within="Recently added" />
	),
});
