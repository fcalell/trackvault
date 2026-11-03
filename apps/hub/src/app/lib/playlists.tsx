import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import type { PlaceSpec } from "@fcalell/ui-core/descriptors";
import { skipToken } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AppRouter } from "../../../.stack/worker";
import type { PlaylistSource } from "../../server/lib/playlist-selection.ts";
import { count } from "../ui/figures.ts";
import { orpc } from "./api.ts";
import { useDebounced } from "./debounced.ts";

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

// The sidebar's Playlists group: the place that manages the tree, then the tree itself
// (a folder is a branch that folds its playlists). A manual playlist takes tracks
// dragged onto it.
export function usePlaylistPlaces(): PlaceSpec<PlaylistSource>[] {
	const tree = useRead(orpc.playlists.tree.read().or([])) ?? [];
	const add = useMutation(orpc.playlists.add.mutationOptions());
	const byParent = new Map<string | null, PlaylistNode[]>();
	for (const node of tree) {
		const list = byParent.get(node.parentId) ?? [];
		list.push(node);
		byParent.set(node.parentId, list);
	}
	const placeOf = (
		node: PlaylistNode,
		group?: string,
	): PlaceSpec<PlaylistSource> => {
		const base = {
			label: node.name,
			...(group ? { group } : {}),
		};
		if (node.kind === "folder")
			return {
				...base,
				icon: "Folder",
				route: `#${node.id}`,
				children: (byParent.get(node.id) ?? []).map((child) => placeOf(child)),
			};
		return {
			...base,
			icon: node.kind === "smart" ? "WandSparkles" : "ListMusic",
			route: `/playlists/${node.id}`,
			...(node.kind === "manual"
				? {
						drop: {
							accepts: "track",
							label: `Add to ${node.name}`,
							onDrop: (drag) =>
								add.mutateAsync({
									playlistId: node.id,
									tracks: drag.picked,
								}),
							done: `Added to ${node.name}`,
						},
					}
				: {}),
		};
	};
	return [
		{
			label: "All playlists",
			icon: "ListMusic",
			route: "/playlists",
			group: "Playlists",
		},
		...(byParent.get(null) ?? []).map((node) => placeOf(node, "Playlists")),
	];
}

// The rule a smart-playlist form has made, as its `after` is given it.
export type SmartRule = Partial<
	Parameters<typeof orpc.playlists.preview.call>[0]
>;

// What the rule would hold now, read from the form's own input once the typing pauses:
// the number of tracks and the first few. Nothing is saved.
export function SmartPreview({ rule }: { rule: SmartRule | undefined }) {
	const settled = useDebounced(JSON.stringify(rule ?? null), 300);
	const input = useMemo(
		() => (JSON.parse(settled) as SmartRule | null) ?? undefined,
		[settled],
	);
	const preview = orpc.playlists.preview.read(
		input && (input.conditions?.length ?? 0) > 0 ? input : skipToken,
	);
	return (
		<Section
			title="Matches now"
			description={preview.at(
				(each) => `${count(each.count)} tracks match this rule.`,
			)}
			items={preview.at((each) =>
				each.sample.map(
					(row): Row => ({
						key: row.id,
						leading: { icon: "Music" },
						title: row.title ?? "Untitled",
						facts: [row.artist ?? "Unknown artist"],
					}),
				),
			)}
		/>
	);
}
