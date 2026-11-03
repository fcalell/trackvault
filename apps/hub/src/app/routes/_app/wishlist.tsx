import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Button } from "@fcalell/plugin-react-ui/components/button";
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
import { WANT_SOURCES, WANT_STATE, wantName } from "../../ui/acquire.ts";
import { age, until } from "../../ui/figures.ts";
import { trackTitle } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/wishlist")({
	component: Wishlist,
});

type Want = AppRouter["wishlist"]["list"]["__output"]["data"][number];

const COLUMNS: TableColumn<Want>[] = [
	{ key: "title", label: "Title", cell: trackTitle },
	{ key: "artist", label: "Artist", cell: (want) => want.artist },
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
		cell: (want) => age(want.createdAt),
	},
];

// The wishlist: what the library lacks and you want. The hub searches Soulseek for each on a
// schedule (a few tries quickly, then slower), ranks what it finds and either
// downloads the best one or marks the item found for you to look at.
function Wishlist() {
	const open = useParams({ strict: false }).wantId;
	const navigate = useNavigate();
	const [view, setView] = useState<WishlistView>();
	const counts = orpc.wishlist.counts.read();
	const searchNow = useMutation(orpc.wishlist.searchNow.mutationOptions());
	const ignore = useMutation(orpc.wishlist.ignore.mutationOptions());
	const remove = useMutation(orpc.wishlist.remove.mutationOptions());
	const imports = orpc.imports.list.read();
	const importSheet = sheetOf({
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
					accept: [".txt", ".csv", ".m3u", ".m3u8", ".xml", ".html", ".htm"],
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
	});
	const addTrack = {
		label: "Add a track",
		sheet: sheetOf({
			title: "Add a track",
			description: "A track the library lacks.",
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
	};
	return (
		<>
			<Pane
				title="Wishlist"
				back={false}
				wide
				acts={[
					{ icon: "Plus", ...addTrack },
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
					items={imports.at((rows) =>
						rows.map((each) => ({
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
							trailing: { age: age(each.createdAt) },
						})),
					)}
					empty={{
						sentence: "Imported playlists show here.",
						act: {
							label: "Import a playlist",
							sheet: importSheet,
						},
					}}
				/>
				<Toolbar
					filters={[
						{
							label: "Show",
							placeholder: "Every wishlist item",
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
				>
					<Button
						act="secondary"
						icon="ListPlus"
						label="Import a playlist"
						sheet={importSheet}
					/>
				</Toolbar>
				<Table
					label="Wishlist"
					items={orpc.wishlist.list.window({ view })}
					columns={COLUMNS}
					row={{
						id: (want) => String(want.id),
						href: (want) => `/wishlist/${want.id}`,
						act: (want) =>
							want.status === "found"
								? {
										icon: "ListOrdered",
										label: `See candidates for ${wantName(want)}`,
										href: `/wishlist/${want.id}`,
									}
								: want.trackId
									? {
											icon: "Music",
											label: `Open ${wantName(want)} in the library`,
											href: `/library/${want.trackId}`,
										}
									: want.status === "wanted" || want.status === "gave-up"
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
							...(want.status === "found"
								? [
										{
											label: "Search again",
											onAct: () =>
												searchNow.mutateAsync({
													wants: { ids: [String(want.id)] },
												}),
											done: "Searching Soulseek",
										},
									]
								: []),
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
					empty={
						view
							? {
									sentence: `No wishlist item is listed under ${WISHLIST_VIEW_LABELS[view]}.`,
									act: {
										label: "Show every wishlist item",
										onAct: () => setView(undefined),
									},
								}
							: {
									sentence:
										"The wishlist is empty. Add a track the library lacks and the hub searches Soulseek for it.",
									act: addTrack,
								}
					}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
