import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { SMART_HELP, SMART_SORTS } from "../../../shared/playlists.ts";
import { orpc } from "../../lib/api.ts";
import {
	type PlaylistNode,
	SmartPreview,
	type SmartRule,
} from "../../lib/playlists.tsx";

export const Route = createFileRoute("/_app/playlists")({
	component: Playlists,
});

const count = new Intl.NumberFormat("en");

const SORT_LABELS: Record<(typeof SMART_SORTS)[number], string> = {
	title: "Title",
	artist: "Artist",
	bpm: "BPM",
	rating: "Rating",
	addedAt: "Date added",
	lastPlayedAt: "Last played",
};

// The fields of a smart playlist's rule, as the editor words them.
export const SMART_FIELDS = {
	name: { label: "Name" },
	match: {
		label: "Match",
		options: [
			{ value: "all", label: "Every condition" },
			{ value: "any", label: "Any condition" },
		],
	},
	conditions: {
		label: "Conditions",
		control: "lines",
		description: SMART_HELP,
	},
	sortBy: {
		label: "Order by",
		options: SMART_SORTS.map((value) => ({ value, label: SORT_LABELS[value] })),
	},
	descending: { label: "Highest first" },
	limit: {
		label: "Keep the first",
		description: "Tracks at most. Empty keeps all.",
	},
} as const;

// The playlists: folders, manual playlists and smart ones as a tree. A row opens its
// playlist beside the tree; tracks dragged onto a playlist join it, a playlist dragged
// onto a folder moves into it.
function Playlists() {
	const open = useParams({ strict: false }).playlistId;
	const [rule, setRule] = useState<SmartRule>();
	const tree = orpc.playlists.tree.read();
	const remove = useMutation(orpc.playlists.remove.mutationOptions());
	const move = useMutation(orpc.playlists.move.mutationOptions());
	const add = useMutation(orpc.playlists.add.mutationOptions());

	const toRow = (node: PlaylistNode, all: readonly PlaylistNode[]): Row => ({
		key: node.id,
		leading: {
			icon:
				node.kind === "folder"
					? "Folder"
					: node.kind === "smart"
						? "WandSparkles"
						: "ListMusic",
		},
		title: node.name,
		facts:
			node.kind === "folder"
				? []
				: [
						node.kind === "smart" ? "Smart" : "Playlist",
						node.tracks === 1
							? "1 track"
							: `${count.format(node.tracks)} tracks`,
					],
		...(node.kind === "folder" ? {} : { href: `/playlists/${node.id}` }),
		selected: node.id === open,
		children: all
			.filter((each) => each.parentId === node.id)
			.map((each) => toRow(each, all)),
		drag: { kind: "playlist", picked: { ids: [node.id] } },
		...(node.kind === "folder"
			? {
					drop: {
						accepts: "playlist",
						label: `Move into ${node.name}`,
						onDrop: (drag) =>
							"ids" in drag.picked
								? Promise.all(
										drag.picked.ids
											.filter((id) => id !== node.id)
											.map((id) => move.mutateAsync({ id, parentId: node.id })),
									)
								: undefined,
						done: `Moved into ${node.name}`,
					},
				}
			: node.kind === "manual"
				? {
						drop: {
							accepts: "track",
							label: `Add to ${node.name}`,
							onDrop: (drag) =>
								add.mutateAsync({
									playlistId: node.id,
									tracks: drag.picked as never,
								}),
							done: `Added to ${node.name}`,
						},
					}
				: {}),
		more: [
			{
				label: "Rename",
				sheet: sheetOf({
					title: `Rename ${node.name}`,
					form: {
						act: orpc.playlists.rename,
						given: { id: node.id },
						values: { name: node.name },
						fields: { name: { label: "Name" } },
						submit: { label: "Rename", done: "Renamed" },
					},
				}),
			},
			...(node.parentId === null
				? []
				: [
						{
							label: "Move to the top level",
							onAct: () => move.mutateAsync({ id: node.id, parentId: null }),
							done: "Moved to the top level",
						},
					]),
			{
				label: "Delete",
				onAct: () => remove.mutateAsync({ id: node.id }),
				confirm: {
					title: `Delete ${node.name}?`,
					sentence:
						node.kind === "folder"
							? "The folder and everything in it are deleted; tracks stay in the library. Undo the batch in History."
							: "The playlist is deleted; its tracks stay in the library. Undo the batch in History.",
				},
				done: "Deleted",
			},
		],
	});

	return (
		<>
			<Pane
				title="Playlists"
				back={false}
				acts={[
					{
						icon: "Plus",
						label: "New playlist",
						sheet: sheetOf({
							title: "New playlist",
							form: {
								act: orpc.playlists.create,
								given: { kind: "manual" as const },
								fields: { name: { label: "Name" } },
								submit: { label: "Add", done: "Playlist added" },
							},
						}),
					},
					{
						icon: "FolderPlus",
						label: "New folder",
						sheet: sheetOf({
							title: "New folder",
							form: {
								act: orpc.playlists.create,
								given: { kind: "folder" as const },
								fields: { name: { label: "Name" } },
								submit: { label: "Add", done: "Folder added" },
							},
						}),
					},
					{
						icon: "WandSparkles",
						label: "New smart playlist",
						sheet: sheetOf({
							title: "New smart playlist",
							form: {
								act: orpc.playlists.createSmart,
								fields: SMART_FIELDS,
								onChange: setRule,
								submit: { label: "Add", done: "Smart playlist added" },
							},
							after: <SmartPreview rule={rule} />,
						}),
					},
				]}
			>
				<Section
					read={tree}
					items={tree.at((nodes) =>
						nodes
							.filter((node) => node.parentId === null)
							.map((node) => toRow(node, nodes)),
					)}
					empty={{
						sentence:
							"No playlists yet. Make one, then drag tracks onto it or use Add to playlist in the library.",
					}}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
