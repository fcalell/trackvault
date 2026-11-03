import {
	preload,
	useMutation,
	useRead,
} from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { Picked } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../../lib/api.ts";
import { useChosen } from "../../lib/chosen.ts";
import { SmartPreview } from "../../lib/playlists.tsx";
import { TRACK_COLUMNS } from "../../ui/track.ts";
import { SMART_FIELDS } from "./playlists.tsx";

export const Route = createFileRoute("/_app/playlists/$playlistId")({
	loader: ({ context, params }) =>
		preload(
			context.queryClient,
			orpc.playlists.get.read({ id: params.playlistId }),
		),
	component: Playlist,
});

// One playlist as a library table over it. A manual playlist reorders (drag a row, or
// Alt with the arrow keys) and takes tracks out; a smart one fills itself from its rule.
function Playlist() {
	const { playlistId } = Route.useParams();
	const playlist = orpc.playlists.get.read({ id: playlistId });
	const tracks = orpc.playlists.tracks.window({ playlistId });
	const kind = useRead(playlist.at((each) => each.kind));
	const reorder = useMutation(orpc.playlists.reorder.mutationOptions());
	const removeTracks = useMutation(
		orpc.playlists.removeTracks.mutationOptions(),
	);
	const remove = useMutation(orpc.playlists.remove.mutationOptions());
	const [picked, setPicked] = useState<Picked<{ playlistId: string }>>({
		ids: [],
	});
	const { chosen, blocked: nothing } = useChosen(
		tracks,
		picked,
		setPicked,
		{ playlistId },
		"tracks",
	);
	const manual = kind === "manual";

	return (
		<Pane
			title={playlist.at((each) => each.name)}
			noun="playlist"
			read={playlist}
			back="/playlists"
			wide
			acts={[
				{
					icon: "Pencil",
					label: "Rename",
					sheet: sheetOf({
						title: "Rename playlist",
						form: {
							act: orpc.playlists.rename,
							given: { id: playlistId },
							values: playlist.at((each) => ({ name: each.name })),
							fields: { name: { label: "Name" } },
							submit: { label: "Rename", done: "Renamed" },
						},
					}),
				},
				...(kind === "smart"
					? [
							{
								icon: "WandSparkles" as const,
								label: "Edit rule",
								sheet: sheetOf({
									title: "Edit rule",
									form: {
										act: orpc.playlists.updateSmart,
										given: { id: playlistId },
										values: playlist.at((each) => ({
											match: each.rule?.match ?? ("all" as const),
											conditions: each.rule?.conditions ?? [],
											sortBy: each.rule?.sortBy,
											descending: each.rule?.descending,
											limit: each.rule?.limit,
										})),
										fields: {
											match: SMART_FIELDS.match,
											conditions: SMART_FIELDS.conditions,
											sortBy: SMART_FIELDS.sortBy,
											descending: SMART_FIELDS.descending,
											limit: SMART_FIELDS.limit,
										},
										after: (input) => <SmartPreview rule={input} />,
										submit: { label: "Save", done: "Rule saved" },
									},
								}),
							},
						]
					: []),
				{
					icon: "Trash2",
					label: "Delete playlist",
					confirm: {
						title: "Delete this playlist?",
						sentence:
							"The playlist is deleted; its tracks stay in the library. Undo the batch in History.",
					},
					onAct: () => remove.mutateAsync({ id: playlistId }),
					done: "Playlist deleted",
					to: "/playlists",
				},
			]}
			foot={
				<ActionBar
					chosen={chosen}
					acts={
						manual
							? [
									{
										label: "Remove from playlist",
										destructive: true,
										blocked: nothing,
										confirm: {
											title: "Remove the chosen tracks?",
											sentence:
												"They leave this playlist and stay in the library. Undo the batch in History.",
										},
										onAct: () =>
											removeTracks.mutateAsync({ playlistId, tracks: picked }),
										done: "Removed from the playlist",
									},
								]
							: []
					}
				/>
			}
		>
			<Table
				label="Tracks"
				items={tracks}
				columns={TRACK_COLUMNS}
				row={{ id: (row) => row.id, href: (row) => `/library/${row.id}` }}
				drag={{ kind: "track" }}
				{...(manual
					? {
							reorder: {
								onMove: (
									id: string,
									to: { after: string | null; before: string | null },
								) =>
									reorder.mutateAsync({
										playlistId,
										trackId: id,
										after: to.after,
										before: to.before,
									}),
								done: "Playlist reordered",
							},
						}
					: {})}
				choose={{ picked, onPick: setPicked }}
			/>
		</Pane>
	);
}
