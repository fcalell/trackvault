import { preload } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { count } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/devices/$deviceId/unmatched")({
	loader: ({ context, params }) =>
		preload(
			context.queryClient,
			orpc.devices.unmatched.read({ id: params.deviceId }),
		),
	component: Unmatched,
});

// The tracks in a device's Rekordbox that the library has no file for, as its last
// read saw them (the agent sends the first 200).
function Unmatched() {
	const { deviceId } = Route.useParams();
	const tracks = orpc.devices.unmatched.read({ id: deviceId });
	const device = orpc.devices.get.read({ id: deviceId });
	return (
		<Pane
			title="Not matched"
			noun="device"
			read={tracks}
			back={`/devices/${deviceId}`}
		>
			<Section
				description={device.at((each) =>
					each.unmatched !== null && each.unmatched > 200
						? `${count(each.unmatched)} tracks have no match; the first 200 are listed.`
						: "Rekordbox lists these, and the hub holds no file with the same path or audio. Add the files to the library and the next read links them.",
				)}
				items={tracks.at((rows) =>
					rows.map((track) => ({
						key: track.contentId,
						leading: { icon: "Music" as const },
						title: track.title ?? "Untitled",
						line: track.artist ?? "Unknown artist",
						facts: [{ code: track.path }],
					})),
				)}
				empty={{ sentence: "Every track in this Rekordbox is matched." }}
			/>
		</Pane>
	);
}
