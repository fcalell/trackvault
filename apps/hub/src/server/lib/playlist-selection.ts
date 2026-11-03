import type { Selector } from "@fcalell/plugin-api/schema";
import { z } from "@fcalell/plugin-api/schema";
import { and, notInArray, sql } from "@fcalell/plugin-db/orm";
import { playlistTracks, tracks } from "../../schema/index.ts";
import type { StoredSmart } from "../../shared/playlists.ts";
import { db } from "./db.ts";
import { type LibraryQuery, libraryQuery } from "./library-query.ts";
import { getPlaylist, isSmart, smartWhere } from "./playlists.ts";
import { selectedIds } from "./selection.ts";

// What a playlist is given: the tracks of the library by a query, or the tracks of
// another playlist (the rows of its table dragged or picked, `playlistId` in the query).
export const playlistSource = libraryQuery.extend({
	playlistId: z.string().optional(),
});
export type PlaylistSource = z.infer<typeof playlistSource>;
export type PlaylistSelection = Selector<PlaylistSource>;

// The ids a selection names, in the order a person sees them (a playlist's own order).
export function selectionIds(selection: PlaylistSelection): string[] {
	if ("ids" in selection) return selection.ids;
	const { playlistId, ...rest } = selection.query;
	if (playlistId === undefined)
		return selectedIds({ ...selection, query: rest as LibraryQuery });
	const playlist = getPlaylist(playlistId);
	if (!playlist || playlist.kind === "folder") return [];
	const except =
		selection.except.length > 0
			? notInArray(tracks.id, selection.except)
			: undefined;
	const database = db();
	if (playlist.kind === "smart") {
		const def = isSmart(playlist.rule) ? (playlist.rule as StoredSmart) : null;
		if (!def) return [];
		return database
			.select({ id: tracks.id })
			.from(tracks)
			.where(and(smartWhere(def), except))
			.orderBy(sql`${tracks.title} collate nocase`, tracks.id)
			.all()
			.map((row) => row.id);
	}
	return database
		.select({ id: playlistTracks.trackId })
		.from(playlistTracks)
		.innerJoin(tracks, sql`${tracks.id} = ${playlistTracks.trackId}`)
		.where(
			and(
				sql`${playlistTracks.playlistId} = ${playlistId}`,
				sql.raw('("tracks"."issues" & 2048) = 0'),
				except,
			),
		)
		.orderBy(playlistTracks.position)
		.all()
		.map((row) => row.id);
}
