import type { Selector } from "@fcalell/plugin-api/schema";
import { and, eq, inArray, sql } from "@fcalell/plugin-db/orm";
import { ISSUE } from "@trackvault/core/issues";
import { files, tracks } from "../../schema/index.ts";
import { db } from "./db.ts";
import { type LibraryQuery, selectedTrackIds } from "./library-query.ts";
import { readSettings } from "./settings.ts";
import type { TrackRow } from "./track-fields.ts";

export type Selection = Selector<LibraryQuery>;

// The ids a bulk act names, resolved with the library's own `where` (a query less
// the unticked ids is one statement, however many rows it matches).
export function selectedIds(selection: Selection): string[] {
	return selectedTrackIds(db(), selection, readSettings().libraryVersion);
}

// Every track in the library (quarantined ones are not in it).
export function allTrackIds(): string[] {
	return db()
		.select({ id: tracks.id })
		.from(tracks)
		.where(sql`(${tracks.issues} & ${ISSUE.quarantined}) = 0`)
		.orderBy(tracks.seq)
		.all()
		.map((row) => row.id);
}

export const SCAN_CHUNK = 500;

// The rows of `ids` 500 at a time, in the order of the ids.
export function* eachTrack(
	ids: readonly string[],
	size = SCAN_CHUNK,
): Generator<TrackRow> {
	for (let i = 0; i < ids.length; i += size) {
		const group = ids.slice(i, i + size);
		const byId = new Map<string, TrackRow>();
		for (const row of db()
			.select()
			.from(tracks)
			.where(inArray(tracks.id, group))
			.all())
			byId.set(row.id, row);
		for (const id of group) {
			const row = byId.get(id);
			if (row) yield row;
		}
	}
}

export const labelOf = (row: {
	artist: string | null;
	title: string | null;
}): string => [row.artist, row.title ?? "Untitled"].filter(Boolean).join(" - ");

export interface PrimaryFile {
	id: number;
	path: string;
}

// The first file on disk of each track (the one that decides its tags and the one
// the organiser moves), for `ids`.
export function primaryFiles(ids: readonly string[]): Map<string, PrimaryFile> {
	const out = new Map<string, PrimaryFile>();
	for (let i = 0; i < ids.length; i += SCAN_CHUNK) {
		const group = ids.slice(i, i + SCAN_CHUNK);
		const rows = db()
			.select({ trackId: files.trackId, id: files.id, path: files.path })
			.from(files)
			.where(and(inArray(files.trackId, group), eq(files.state, "ok")))
			.orderBy(files.id)
			.all();
		for (const row of rows)
			if (row.trackId !== null && !out.has(row.trackId))
				out.set(row.trackId, { id: row.id, path: row.path });
	}
	return out;
}
