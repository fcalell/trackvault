import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { IMPORT_STATUS, WANT_SOURCES } from "../../ui/acquire.ts";

export const Route = createFileRoute("/_app/import/$importId")({
	loader: ({ context, params }) =>
		preload(
			context.queryClient,
			orpc.imports.get.read({ id: params.importId }),
		),
	component: ImportResult,
});

type Item = AppRouter["imports"]["items"]["__output"]["data"][number];
type Status = Item["status"];

const FILTER_LABELS: Record<Status, string> = {
	matched: "In the library",
	missing: "Missing",
	uncertain: "Not sure",
	"other-version": "Other mix in the library",
};

const COLUMNS: TableColumn<Item>[] = [
	{
		key: "track",
		label: "Track",
		cell: (item) =>
			`${item.artist} - ${item.title}${item.mix ? ` (${item.mix})` : ""}`,
	},
	{
		key: "status",
		label: "Result",
		kind: "chip",
		family: "neutral",
		cell: (item) => IMPORT_STATUS[item.status] ?? "",
	},
	{
		key: "match",
		label: "Library track",
		cell: (item) =>
			item.match
				? `${item.match} · ${Math.round(item.confidence * 100)}%`
				: null,
	},
];

// The result of an import: what the library has (a TrackVault playlist from those), what
// it lacks (to the wishlist), and the matches the hub is not sure of (yours to confirm).
function ImportResult() {
	const { importId } = Route.useParams();
	const imported = orpc.imports.get.read({ id: importId });
	const [status, setStatus] = useState<Status>();
	const createPlaylist = useMutation(
		orpc.imports.createPlaylist.mutationOptions(),
	);
	const toWishlist = useMutation(orpc.imports.addToWishlist.mutationOptions());
	const confirm = useMutation(orpc.imports.confirm.mutationOptions());
	const remove = useMutation(orpc.imports.remove.mutationOptions());
	return (
		<Pane
			title={imported.at((each) => each.name)}
			noun="import"
			read={imported}
			back="/wishlist"
			record={{
				within: "Wishlist",
				overline: [
					imported.at((each) => WANT_SOURCES[each.source] ?? each.source),
				],
				facts: [
					imported.at((each) => `${each.tracks} tracks`),
					imported.at((each) => `${each.matched} in the library`),
					imported.at((each) => `${each.missing + each.otherVersion} missing`),
					imported.at((each) => `${each.uncertain} not sure`),
				],
			}}
			acts={[
				{
					icon: "ListMusic",
					label: "Make a playlist from what the library has",
					blocked: imported.at((each) =>
						each.playlistId
							? "Already made"
							: each.matched === 0
								? "No track of this list is in the library"
								: undefined,
					),
					onAct: () => createPlaylist.mutateAsync({ id: importId }),
					done: "Playlist made",
					to: "/playlists",
				},
				{
					icon: "ListPlus",
					label: "Add the missing tracks to the wishlist",
					blocked: imported.at((each) =>
						each.missing + each.otherVersion === 0
							? "Nothing is missing"
							: undefined,
					),
					onAct: () => toWishlist.mutateAsync({ id: importId }),
					done: "Added to the wishlist",
					to: "/wishlist",
				},
				{
					icon: "Trash2",
					label: "Delete this import",
					destructive: true,
					confirm: {
						title: "Delete this import?",
						sentence:
							"The result is dropped. A playlist or wants made from it stay.",
					},
					onAct: () => remove.mutateAsync({ id: importId }),
					to: "/wishlist",
				},
			]}
		>
			<Section
				items={imported.at((each) => [
					...(each.state === "parsing"
						? [
								{
									key: "reading",
									title: "Reading the list and matching it with the library",
									facts: [{ tone: "running" as const }],
								},
							]
						: []),
					...(each.state === "failed"
						? [
								{
									key: "failed",
									title: each.error ?? "The import failed",
									facts: [{ tone: "failed" as const }],
									wrap: true,
								},
							]
						: []),
					...each.warnings.map((warning, index) => ({
						key: `warning-${index}`,
						title: warning,
						wrap: true,
						facts: [{ warning: "Heads up" }],
					})),
				])}
			/>
			<Banner
				tone="active"
				sentence={imported.at((each) =>
					each.state === "ready" && each.playlistId
						? "A playlist was made from this list."
						: undefined,
				)}
				act={imported.at((each) =>
					each.state === "ready" && each.playlistId
						? { label: "Open playlists", href: "/playlists" }
						: undefined,
				)}
			/>
			<Toolbar
				filters={[
					{
						label: "Show",
						placeholder: "Every track",
						options: (Object.keys(FILTER_LABELS) as Status[]).map((value) => ({
							value,
							label: FILTER_LABELS[value],
						})),
						value: status,
						onChange: (value) => setStatus((value as Status) ?? undefined),
					},
				]}
			/>
			<Table
				label="Tracks"
				items={orpc.imports.items.window({ importId, status })}
				columns={COLUMNS}
				row={{
					id: (item) => String(item.id),
					act: (item) =>
						item.status === "uncertain"
							? {
									icon: "Check",
									label: "Same track",
									onAct: () =>
										confirm.mutateAsync({ itemId: item.id, same: true }),
									done: "Counted as in the library",
								}
							: undefined,
					more: (item) =>
						item.status === "uncertain"
							? [
									{
										label: "Not the same track",
										onAct: () =>
											confirm.mutateAsync({ itemId: item.id, same: false }),
									},
								]
							: [],
				}}
			/>
		</Pane>
	);
}
