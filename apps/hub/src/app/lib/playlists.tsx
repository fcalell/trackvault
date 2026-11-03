import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import type { PlaceSpec } from "@fcalell/ui-core/descriptors";
import type { AppRouter } from "../../../.stack/worker";
import { orpc } from "./api.ts";

export type PlaylistNode = AppRouter["playlists"]["tree"]["__output"][number];

// The tree's rows in order, each with the names of the folders above it ("House / Peak").
export function pathsOf(
	nodes: readonly PlaylistNode[],
): Array<{ node: PlaylistNode; path: string; depth: number }> {
	const byParent = new Map<string | null, PlaylistNode[]>();
	for (const node of nodes) {
		const list = byParent.get(node.parentId) ?? [];
		list.push(node);
		byParent.set(node.parentId, list);
	}
	const out: Array<{ node: PlaylistNode; path: string; depth: number }> = [];
	const walk = (parent: string | null, prefix: string, depth: number): void => {
		for (const node of byParent.get(parent) ?? []) {
			const path = prefix ? `${prefix} / ${node.name}` : node.name;
			out.push({ node, path, depth });
			walk(node.id, path, depth + 1);
		}
	};
	walk(null, "", 0);
	return out;
}

// The sidebar's Playlists group: the place that manages the tree, then every playlist
// (a folder's path in its name: the sidebar's places are flat). A manual playlist takes
// tracks dragged onto it.
export function usePlaylistPlaces(): PlaceSpec[] {
	const tree = useRead(orpc.playlists.tree.read().or([])) ?? [];
	const add = useMutation(orpc.playlists.add.mutationOptions());
	const places: PlaceSpec[] = [
		{
			label: "All playlists",
			icon: "ListMusic",
			route: "/playlists",
			group: "Playlists",
		},
	];
	for (const { node, path } of pathsOf(tree)) {
		if (node.kind === "folder") continue;
		places.push({
			label: path,
			icon: node.kind === "smart" ? "WandSparkles" : "ListMusic",
			route: `/playlists/${node.id}`,
			group: "Playlists",
			...(node.kind === "manual"
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
		});
	}
	return places;
}
