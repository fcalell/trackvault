import { ISSUE } from "@trackvault/core/issues";
import type { ManifestEntry, ManifestPage } from "@trackvault/core/sync";
import { statement } from "../raw.ts";
import { readSettings } from "../settings.ts";
import { MANIFEST_PAGE } from "./devices.ts";
import { SyncError } from "./http.ts";

// The manifest is the tracks changed since a library version, in (version, id) order: a
// range scan of `tracks_version_idx`. The cursor is the last row handed out, `v<version>:<id>`;
// a removed track is a tombstone row with the version of its removal.

const START = { version: -1, id: "" };

export function parseCursor(cursor: string | null): {
	version: number;
	id: string;
} {
	if (cursor === null) return START;
	const match = /^v(\d+):(.*)$/s.exec(cursor);
	if (!match)
		throw new SyncError(
			"cursor-expired",
			"That cursor is not one of this hub's",
		);
	return { version: Number(match[1]), id: match[2] ?? "" };
}

export const cursorOf = (version: number, id: string): string =>
	`v${version}:${id}`;

interface Row {
	id: string;
	version: number;
	dead: number;
}

export function manifestPage(
	cursor: string | null,
	wanted?: number,
): ManifestPage {
	const at = parseCursor(cursor);
	const limit = Math.max(1, Math.min(wanted ?? MANIFEST_PAGE, 5000));
	const rows = statement(
		`SELECT id, version, dead FROM (
			SELECT id, version, 0 AS dead FROM tracks WHERE (version, id) > (@v, @i)
			UNION ALL
			SELECT track_id AS id, version, 1 AS dead FROM track_tombstones WHERE (version, track_id) > (@v, @i)
		) ORDER BY version, id LIMIT @n`,
	).all({ v: at.version, i: at.id, n: limit + 1 }) as Row[];
	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const live = page.filter((row) => !row.dead).map((row) => row.id);

	// The first file on disk of each track (the one the library plays and tags).
	const files = new Map<
		string,
		{
			path: string;
			size: number;
			hash: string | null;
			audio: string;
			issues: number;
		}
	>();
	if (live.length > 0) {
		const found = statement(
			`SELECT f.track_id AS id, f.path AS path, f.size AS size, f.file_hash AS hash,
				t.audio_hash AS audio, t.issues AS issues
			 FROM files f JOIN tracks t ON t.id = f.track_id
			 WHERE f.track_id IN (SELECT value FROM json_each(@ids)) AND f.state = 'ok'
			 ORDER BY f.id`,
		).all({ ids: JSON.stringify(live) }) as Array<{
			id: string;
			path: string;
			size: number;
			hash: string | null;
			audio: string;
			issues: number;
		}>;
		for (const file of found) if (!files.has(file.id)) files.set(file.id, file);
	}

	const upserts: ManifestEntry[] = [];
	const deletes: string[] = [];
	for (const row of page) {
		if (row.dead) {
			deletes.push(row.id);
			continue;
		}
		const file = files.get(row.id);
		if (!file || (file.issues & ISSUE.quarantined) !== 0) {
			deletes.push(row.id);
			continue;
		}
		// A file not hashed yet (a scan in flight) is neither wanted nor removed.
		if (!file.hash) continue;
		upserts.push({
			trackId: row.id,
			audioHash: file.audio,
			fileHash: file.hash,
			size: file.size,
			relPath: file.path,
		});
	}
	const last = page[page.length - 1];
	return {
		cursor: last
			? cursorOf(last.version, last.id)
			: (cursor ?? cursorOf(0, "")),
		hasMore,
		upserts,
		deletes,
		libraryVersion: readSettings().libraryVersion,
	};
}
