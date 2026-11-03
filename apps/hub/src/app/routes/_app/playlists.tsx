import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import type { PlaylistSource } from "../../../server/lib/playlist-selection.ts";
import { SMART_HELP, SMART_SORTS } from "../../../shared/playlists.ts";
import { orpc } from "../../lib/api.ts";
import {
	type PlaylistNode,
	pathsOf,
	SmartPreview,
} from "../../lib/playlists.tsx";

export const Route = createFileRoute("/_app/playlists")({
	component: Playlists,
});

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

interface Entry {
	node: PlaylistNode;
	path: string;
}

const COLUMNS: TableColumn<Entry>[] = [
	{ key: "name", label: "Name", cell: (row) => row.node.name },
	{
		key: "kind",
		label: "Kind",
		width: "measure-short",
		cell: (row) =>
			row.node.kind === "folder"
				? "Folder"
				: row.node.kind === "smart"
					? "Smart"
					: "Manual",
	},
	{
		key: "tracks",
		label: "Tracks",
		kind: "number",
		cell: (row) => (row.node.kind === "folder" ? null : row.node.tracks),
	},
	{
		key: "in",
		label: "In",
		width: "measure-short",
		cell: (row) => row.path || null,
	},
	{ key: "rule", label: "Rule", wrap: true, cell: (row) => row.node.rule },
];

// The playlists as records to manage: every folder, manual and smart playlist in the
// tree's order with its kind, count, folder and a smart one's rule. A row opens its
// playlist beside the list; tracks dragged onto a playlist join it, a playlist dragged
// onto a folder moves into it.
function Playlists() {
	const open = useParams({ strict: false }).playlistId;
	const tree = orpc.playlists.tree.read();
	const remove = useMutation(orpc.playlists.remove.mutationOptions());
	const move = useMutation(orpc.playlists.move.mutationOptions());
	const add = useMutation(orpc.playlists.add.mutationOptions());

	return (
		<>
			<Pane
				title="Playlists"
				back={false}
				wide
				read={tree}
				empty={{
					sentence:
						"No playlists yet. Make one, then drag tracks onto it or use Add to playlist in the library.",
				}}
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
								after: (input) => <SmartPreview rule={input} />,
								submit: { label: "Add", done: "Smart playlist added" },
							},
						}),
					},
				]}
			>
				<Table<Entry, PlaylistSource>
					label="Playlists"
					items={tree.at((nodes) =>
						pathsOf(nodes).map(({ node, path }) => ({
							node,
							path: path.slice(0, path.length - node.name.length - 3),
						})),
					)}
					columns={COLUMNS}
					selected={open}
					drag={{ kind: "playlist" }}
					row={{
						id: (row) => row.node.id,
						href: (row) =>
							row.node.kind === "folder"
								? undefined
								: `/playlists/${row.node.id}`,
						drop: ({ node }) =>
							node.kind === "folder"
								? {
										accepts: "playlist",
										label: `Move into ${node.name}`,
										onDrop: (drag) =>
											"ids" in drag.picked
												? Promise.all(
														drag.picked.ids
															.filter((id) => id !== node.id)
															.map((id) =>
																move.mutateAsync({ id, parentId: node.id }),
															),
													)
												: undefined,
										done: `Moved into ${node.name}`,
									}
								: node.kind === "manual"
									? {
											accepts: "track",
											label: `Add to ${node.name}`,
											onDrop: (drag) =>
												add.mutateAsync({
													playlistId: node.id,
													tracks: drag.picked,
												}),
											done: `Added to ${node.name}`,
										}
									: undefined,
						more: ({ node }) => [
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
											onAct: () =>
												move.mutateAsync({ id: node.id, parentId: null }),
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
					}}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
