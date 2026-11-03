import {
	preload,
	useMutation,
	useRead,
} from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { Picked, TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useState } from "react";
import type { PlaylistRow } from "../../../shared/library.ts";
import { orpc } from "../../lib/api.ts";
import { useChosen } from "../../lib/chosen.ts";
import { AddTracks, SmartPreview } from "../../lib/playlists.tsx";
import { ListSource, useListPlay } from "../../lib/queue.ts";
import { count, span } from "../../ui/figures.ts";
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

// A manual playlist numbers its rows after the title, which stays the row's name.
const MANUAL_COLUMNS: TableColumn<PlaylistRow>[] = [
	...TRACK_COLUMNS.slice(0, 1),
	{ key: "position", label: "#", kind: "number", cell: (row) => row.position },
	...TRACK_COLUMNS.slice(1),
];

// One playlist as a library table over it, a track opening beside it. A manual playlist
// numbers its tracks, takes more from a search, reorders (drag a row, or Alt with the
// arrow keys) and takes tracks out; a smart one fills itself from its rule and has no
// selection acts.
function Playlist() {
	const { playlistId } = Route.useParams();
	const open = useParams({ strict: false }).trackId;
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
	const { act } = useListPlay(tracks);
	const manual = kind === "manual";
	const shared = {
		label: "Tracks",
		items: tracks,
		row: {
			id: (row: PlaylistRow) => row.id,
			href: (row: PlaylistRow) => `/playlists/${playlistId}/${row.id}`,
			act,
		},
		selected: open,
		drag: { kind: "track" },
	};

	return (
		<ListSource value={tracks}>
			<Pane
				title={playlist.at((each) => each.name)}
				noun="playlist"
				read={playlist}
				back="/playlists"
				cover
				wide
				record={{
					within: "Playlists",
					overline: [
						playlist.at((each) =>
							each.kind === "smart" ? "Smart playlist" : "Playlist",
						),
					],
					facts: [
						playlist.at((each) =>
							each.tracks === 1 ? "1 track" : `${count(each.tracks)} tracks`,
						),
						playlist.at((each) => span(each.durationMs)),
					],
				}}
				acts={[
					...(manual
						? [
								{
									icon: "Plus" as const,
									label: "Add tracks",
									sheet: sheetOf({
										title: "Add tracks",
										description:
											"Search the library and add tracks to the end of the playlist.",
										submit: { label: "Done" },
										children: <AddTracks playlistId={playlistId} />,
									}),
								},
							]
						: []),
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
					manual ? (
						<ActionBar
							chosen={chosen}
							acts={[
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
							]}
						/>
					) : undefined
				}
			>
				{manual ? (
					<Table
						{...shared}
						columns={MANUAL_COLUMNS}
						reorder={{
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
						}}
						choose={{ picked, onPick: setPicked }}
					/>
				) : (
					<Table {...shared} columns={TRACK_COLUMNS} />
				)}
			</Pane>
			<Outlet />
		</ListSource>
	);
}
