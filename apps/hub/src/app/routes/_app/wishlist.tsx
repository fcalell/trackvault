import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import {
	createFileRoute,
	Outlet,
	useNavigate,
	useParams,
} from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import {
	WISHLIST_VIEW_LABELS,
	WISHLIST_VIEWS,
	type WishlistView,
} from "../../../shared/acquire.ts";
import { orpc } from "../../lib/api.ts";
import { until, WANT_SOURCES, WANT_STATE, wantName } from "../../ui/acquire.ts";

export const Route = createFileRoute("/_app/wishlist")({
	component: Wishlist,
});

type Want = AppRouter["wishlist"]["list"]["__output"]["data"][number];

const COLUMNS: TableColumn<Want>[] = [
	{ key: "want", label: "Track", cell: wantName },
	{
		key: "status",
		label: "State",
		kind: "status",
		cell: (want) => WANT_STATE[want.status] ?? { tone: "idle" as const },
	},
	{
		key: "source",
		label: "From",
		kind: "chip",
		family: "neutral",
		cell: (want) => WANT_SOURCES[want.source] ?? want.source,
	},
	{
		key: "tries",
		label: "Searches",
		kind: "number",
		cell: (want) => want.attempts,
	},
	{
		key: "next",
		label: "Next search",
		cell: (want) =>
			want.status === "wanted" || want.status === "searching"
				? until(want.nextSearchAt)
				: null,
	},
	{
		key: "score",
		label: "Best match",
		kind: "number",
		cell: (want) =>
			want.bestScore === null ? null : Math.round(want.bestScore),
	},
	{
		key: "note",
		label: "Last search",
		hidden: true,
		wrap: true,
		cell: (w) => w.note,
	},
	{
		key: "added",
		label: "Added",
		kind: "age",
		hidden: true,
		cell: (want) => want.createdAt.toISOString(),
	},
];

// What you want and the library lacks. The hub searches Soulseek for each on a
// schedule (a few tries quickly, then slower), ranks what it finds and either
// downloads the best one or marks the want found for you to look at.
function Wishlist() {
	const open = useParams({ strict: false }).wantId;
	const navigate = useNavigate();
	const [view, setView] = useState<WishlistView>();
	const counts = orpc.wishlist.counts.read();
	const searchNow = useMutation(orpc.wishlist.searchNow.mutationOptions());
	const ignore = useMutation(orpc.wishlist.ignore.mutationOptions());
	const remove = useMutation(orpc.wishlist.remove.mutationOptions());
	const imports = orpc.imports.list.read();
	return (
		<>
			<Pane
				title="Wishlist"
				back={false}
				wide
				acts={[
					{
						icon: "Plus",
						label: "Add a track",
						sheet: sheetOf({
							title: "Add a track",
							description: "Something you want that the library lacks.",
							form: {
								act: orpc.wishlist.add,
								fields: {
									artist: { label: "Artist" },
									title: { label: "Title" },
									mix: {
										label: "Mix",
										description:
											"Extended Mix, a remix... leave empty for the original.",
									},
								},
								submit: { label: "Add", done: "Added to the wishlist" },
							},
						}),
					},
					{
						icon: "ListPlus",
						label: "Import a playlist",
						sheet: sheetOf({
							title: "Import a playlist",
							description:
								"A link (Spotify, Beatport, 1001Tracklists, YouTube), pasted text, or a file: a text or CSV list, M3U, Rekordbox XML, a saved page.",
							form: {
								act: orpc.imports.start,
								fields: {
									url: { label: "Link" },
									text: { label: "Or paste it here", control: "prose" },
									file: {
										label: "Or pick a file",
										control: "file",
										accept: [
											".txt",
											".csv",
											".m3u",
											".m3u8",
											".xml",
											".html",
											".htm",
										],
										name: "fileName",
									},
								},
								submit: { label: "Import" },
								onDone: (made) =>
									navigate({
										to: "/import/$importId",
										params: { importId: made.id },
									}),
							},
						}),
					},
					{
						icon: "Search",
						label: "Search what is due",
						onAct: () => orpc.wishlist.searchDue.call(),
						done: "Searching Soulseek",
						to: "/jobs",
					},
				]}
			>
				<Section
					title="Imports"
					read={imports}
					items={imports.at((rows) =>
						rows.slice(0, 5).map((each) => ({
							key: each.id,
							leading: { icon: "ListMusic" as const },
							title: each.name,
							href: `/import/${each.id}`,
							facts:
								each.state === "ready"
									? [
											`${each.matched} of ${each.tracks} in the library`,
											`${each.missing + each.otherVersion} missing`,
										]
									: each.state === "failed"
										? []
										: ["Reading"],
							line:
								each.state === "failed" ? (each.error ?? "Failed") : undefined,
							trailing: { age: each.createdAt.toISOString() },
						})),
					)}
					empty={{ sentence: "Imported playlists show here." }}
				/>
				<Toolbar
					filters={[
						{
							label: "Show",
							placeholder: "Every want",
							options: counts.at((each) =>
								WISHLIST_VIEWS.map((value) => ({
									value,
									label: WISHLIST_VIEW_LABELS[value],
									line: String(each[value]),
								})),
							),
							value: view,
							onChange: (value) =>
								setView((value as WishlistView) ?? undefined),
						},
					]}
				/>
				<Table
					label="Wishlist"
					items={orpc.wishlist.list.window({ view })}
					columns={COLUMNS}
					row={{
						id: (want) => String(want.id),
						href: (want) => `/wishlist/${want.id}`,
						act: (want) =>
							want.status === "wanted" ||
							want.status === "found" ||
							want.status === "gave-up"
								? {
										icon: "Search",
										label: `Search for ${wantName(want)} now`,
										onAct: () =>
											searchNow.mutateAsync({
												wants: { ids: [String(want.id)] },
											}),
										done: "Searching Soulseek",
									}
								: undefined,
						more: (want) => [
							{
								label:
									want.status === "ignored" ? "Take it up again" : "Ignore",
								onAct: () =>
									ignore.mutateAsync({
										wants: { ids: [String(want.id)] },
										ignored: want.status !== "ignored",
									}),
							},
							{
								label: "Remove",
								destructive: true,
								confirm: {
									title: `Remove ${wantName(want)}?`,
									sentence:
										"It leaves the wishlist and its candidates are dropped.",
								},
								onAct: () =>
									remove.mutateAsync({ wants: { ids: [String(want.id)] } }),
							},
						],
					}}
					selected={open}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
