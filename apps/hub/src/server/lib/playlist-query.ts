import { paginateWindow } from "@fcalell/plugin-api/lib/window";
import { count, eq, inArray, sql } from "@fcalell/plugin-db/orm";
import { playlistTracks, tracks } from "../../schema/index.ts";
import type { PlaylistRow, SortColumn } from "../../shared/library.ts";
import type { StoredSmart } from "../../shared/playlists.ts";
import type { db as database } from "./db.ts";
import { ORDER, OTHER_COLUMNS } from "./library-query.ts";
import { getPlaylist, isSmart, smartWhere } from "./playlists.ts";
import { statement } from "./raw.ts";

type Db = ReturnType<typeof database>;

export interface PlaylistWindowInput {
	playlistId: string;
	sort?: { column: SortColumn; direction: "asc" | "desc" } | undefined;
	offset?: number | undefined;
	limit: number;
}

// One window of a playlist as library rows, each with its place in the playlist's order
// (a smart playlist has none). A manual playlist reads its slice of
// `playlist_tracks` in position order (a range scan of one index; a column sort replaces
// the order); a smart one is the library under its rule.
export async function playlistPage(
	database: Db,
	input: PlaylistWindowInput,
): Promise<{ data: PlaylistRow[]; total: number; offset: number } | null> {
	const playlist = getPlaylist(input.playlistId);
	if (!playlist || playlist.kind === "folder") return null;
	if (playlist.kind === "smart") {
		const def = isSmart(playlist.rule) ? (playlist.rule as StoredSmart) : null;
		const page = await paginateWindow(database.query.tracks, {
			where: def ? smartWhere(def) : sql`0`,
			orderBy: { column: ORDER.title, direction: "asc" as const },
			sorts: ORDER,
			sort: input.sort,
			idColumn: tracks.id,
			columns: OTHER_COLUMNS,
			offset: input.offset,
			limit: input.limit,
			db: database,
		});
		return {
			...page,
			data: page.data.map((row) => ({ ...row, position: null })),
		} as { data: PlaylistRow[]; total: number; offset: number };
	}
	// In its own order the page needs nothing of `tracks` to find its ids: one index range
	// of `playlist_tracks` (a deep offset of 50k rows reads in about a millisecond), then
	// the rows by id. (A quarantined track keeps its place; it is only out of the library.)
	if (!input.sort) {
		const offset = input.offset ?? 0;
		const ids = (
			statement(
				"SELECT track_id AS id FROM playlist_tracks WHERE playlist_id = @p ORDER BY position, track_id LIMIT @n OFFSET @o",
			).all({ p: input.playlistId, n: input.limit, o: offset }) as {
				id: string;
			}[]
		).map((row) => row.id);
		const total = (
			statement(
				"SELECT count(*) AS n FROM playlist_tracks WHERE playlist_id = @p",
			).get({ p: input.playlistId }) as { n: number }
		).n;
		const rows = ids.length
			? await database.query.tracks.findMany({
					where: inArray(tracks.id, ids),
					columns: OTHER_COLUMNS,
				})
			: [];
		const byId = new Map(rows.map((row) => [row.id, row]));
		const data = ids.flatMap((id, at) => {
			const row = byId.get(id);
			return row ? [{ ...row, position: offset + at + 1 }] : [];
		});
		return { data: data as unknown as PlaylistRow[], total, offset };
	}
	const page = await paginateWindow(database.query.tracks, {
		where: eq(playlistTracks.playlistId, input.playlistId),
		orderBy: { column: playlistTracks.position, direction: "asc" as const },
		sorts: ORDER,
		sort: input.sort,
		join: (query) =>
			query.innerJoin(playlistTracks, eq(playlistTracks.trackId, tracks.id)),
		idColumn: tracks.id,
		columns: OTHER_COLUMNS,
		offset: input.offset,
		limit: input.limit,
		db: database,
	});
	// A column sort keeps each track's place in the playlist's own order.
	const places = new Map(
		(
			statement(
				"SELECT id, n FROM (SELECT track_id AS id, row_number() OVER (ORDER BY position, track_id) AS n FROM playlist_tracks WHERE playlist_id = @p) WHERE id IN (SELECT value FROM json_each(@ids))",
			).all({
				p: input.playlistId,
				ids: JSON.stringify(page.data.map((row) => row.id)),
			}) as { id: string; n: number }[]
		).map((row) => [row.id, row.n]),
	);
	return {
		...page,
		data: page.data.map((row) => ({
			...row,
			position: places.get(row.id) ?? null,
		})),
	} as { data: PlaylistRow[]; total: number; offset: number };
}

// How many tracks a smart rule matches (the preview and the tree's count).
export function smartCount(database: Db, def: StoredSmart): number {
	return (
		database.select({ n: count() }).from(tracks).where(smartWhere(def)).get()
			?.n ?? 0
	);
}
