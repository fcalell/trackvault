import { ftsQuery } from "@fcalell/plugin-db/orm";
import { ISSUE } from "@trackvault/core/issues";
import type { LibraryEntry, LibraryIndex } from "@trackvault/core/ranking";
import { statement } from "./raw.ts";

interface Row {
	id: string;
	artist: string | null;
	title: string | null;
	duration_ms: number | null;
}

const BY_BLOCK = `SELECT id, artist, title, duration_ms FROM tracks
	WHERE block_key = @key AND (issues & ${ISSUE.quarantined}) = 0 LIMIT 50`;

// The words of the title, matched through the full-text index (the same one that
// drives library search); the matcher verifies every entry it is given.
const BY_TITLE = `SELECT t.id, t.artist, t.title, t.duration_ms FROM track_search s
	JOIN tracks t ON t.seq = s.rowid
	WHERE track_search MATCH @match AND (t.issues & ${ISSUE.quarantined}) = 0 LIMIT 60`;

const entry = (row: Row): LibraryEntry => ({
	id: row.id,
	artist: row.artist,
	title: row.title,
	durationMs: row.duration_ms,
});

// core/ranking's "already in the library" over the hub: the artist+title block key
// (an index lookup) and the title words (FTS5), a few ms each at 50k tracks.
export const hubLibraryIndex: LibraryIndex = {
	lookup(keys) {
		const out = new Map<string, LibraryEntry>();
		if (keys.blockKey !== "|")
			for (const row of statement(BY_BLOCK).all({
				key: keys.blockKey,
			}) as Row[])
				out.set(row.id, entry(row));
		const match = ftsQuery(keys.titleKey, { prefix: false });
		if (match)
			for (const row of statement(BY_TITLE).all({ match }) as Row[])
				out.set(row.id, entry(row));
		return [...out.values()];
	},
};
