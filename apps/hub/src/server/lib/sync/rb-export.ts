import { sql } from "@fcalell/plugin-db/orm";
import {
	type ExportAck,
	type ExportChange,
	type ExportPage,
	type ExportRequest,
	TRACK_FIELDS,
	type TrackField,
} from "@trackvault/core/sync";
import { tracks as tracksTable } from "../../../schema/index.ts";
import type { StoredSmart } from "../../../shared/playlists.ts";
import { db } from "../db.ts";
import { getPlaylist, isSmart, smartWhere } from "../playlists.ts";
import { statement } from "../raw.ts";
import { readSettings } from "../settings.ts";
import { noteActivity } from "./devices.ts";
import { SyncError } from "./http.ts";
import {
	analysisOf,
	asWire,
	cuesOf,
	hubValue,
	tagNamesOf,
	tracksById,
} from "./rb-fields.ts";
import { playlistContent } from "./rb-import.ts";

// The hub's side of the Rekordbox export (plan section 6, step 4): what the device has
// not got yet, as changes it applies in order and acknowledges.
//
// The stream's position is a cursor of components, one per kind of source:
//   n|<change seq>|<library version>|<last track id at that version>|<last conflict id>
// and, for a device that asks for everything (cursor null), two phases first:
//   t|<change seq>|<library version>|<version>|<id>   the tracks it has no link for
//   p|<change seq>|<library version>|<playlist id>    every playlist
// Both end in the `n` position that was taken at the start, so nothing in between is lost.

const DEFAULT_LIMIT = 500;
const TAIL = "~"; // after every id at a version

type Cursor =
	| { phase: "t"; seq: number; version: number; at: number; id: string }
	| { phase: "p"; seq: number; version: number; id: string }
	| { phase: "n"; seq: number; version: number; id: string; conflict: number };

const format = (c: Cursor): string =>
	c.phase === "t"
		? `t|${c.seq}|${c.version}|${c.at}|${c.id}`
		: c.phase === "p"
			? `p|${c.seq}|${c.version}|${c.id}`
			: `n|${c.seq}|${c.version}|${c.id}|${c.conflict}`;

function parse(text: string): Cursor {
	const parts = text.split("|");
	const [phase, seq, version] = parts;
	const bad = () =>
		new SyncError(
			"cursor-expired",
			"That export cursor is not one of this hub's",
		);
	if (
		!seq ||
		!version ||
		!Number.isFinite(Number(seq)) ||
		!Number.isFinite(Number(version))
	)
		throw bad();
	if (phase === "n" && parts.length >= 5)
		return {
			phase,
			seq: Number(seq),
			version: Number(version),
			id: parts[3] ?? TAIL,
			conflict: Number(parts[4]) || 0,
		};
	if (phase === "t" && parts.length >= 5)
		return {
			phase,
			seq: Number(seq),
			version: Number(version),
			at: Number(parts[3]),
			id: parts[4] ?? "",
		};
	if (phase === "p")
		return {
			phase,
			seq: Number(seq),
			version: Number(version),
			id: parts.slice(3).join("|"),
		};
	throw bad();
}

const maxSeq = (): number =>
	(
		statement("SELECT coalesce(max(seq), 0) AS m FROM changes").get() as {
			m: number;
		}
	).m;

const GONE = `((t.issues & 2048) != 0 OR NOT EXISTS (SELECT 1 FROM files f WHERE f.track_id = t.id AND f.state = 'ok' AND f.file_hash IS NOT NULL))`;

// -- building changes ------------------------------------------------------------

function addsFor(
	deviceId: string,
	ids: readonly string[],
	seq: number,
): ExportChange[] {
	if (ids.length === 0) return [];
	const rows = tracksById(ids);
	const names = tagNamesOf(ids);
	const cues = cuesOf(ids);
	const anlz = analysisOf(ids, deviceId);
	const files = new Map<string, { path: string; hash: string }>();
	for (const f of statement(
		`SELECT track_id AS id, path, file_hash AS hash FROM files
		 WHERE track_id IN (SELECT value FROM json_each(@ids)) AND state = 'ok' AND file_hash IS NOT NULL ORDER BY id`,
	).all({ ids: JSON.stringify(ids) }) as Array<{
		id: string;
		path: string;
		hash: string;
	}>)
		if (!files.has(f.id)) files.set(f.id, f);
	const out: ExportChange[] = [];
	for (const id of ids) {
		const row = rows.get(id);
		const file = files.get(id);
		if (!row || !file) continue;
		const fields: Record<string, string | number | string[] | null> = {};
		for (const field of TRACK_FIELDS)
			fields[field] = asWire(field, hubValue(row, field, names.get(id) ?? []));
		out.push({
			seq,
			kind: "track.add",
			trackId: id,
			relPath: file.path,
			audioHash: row.audioHash,
			fileHash: file.hash,
			fields,
			cues: cues.get(id) ?? [],
			anlz: anlz.get(id) ?? [],
		});
	}
	return out;
}

function playlistSet(
	deviceId: string,
	id: string,
): {
	change: Omit<Extract<ExportChange, { kind: "playlist.set" }>, "seq">;
	hash: string;
} | null {
	const row = getPlaylist(id);
	if (!row) return null;
	let tracks: string[] = [];
	if (row.kind === "manual") {
		tracks = (
			statement(
				"SELECT track_id AS t FROM playlist_tracks WHERE playlist_id = @id ORDER BY position, track_id",
			).all({ id }) as {
				t: string;
			}[]
		).map((r) => r.t);
	} else if (row.kind === "smart" && isSmart(row.rule)) {
		tracks = db()
			.select({ id: tracksTable.id })
			.from(tracksTable)
			.where(smartWhere(row.rule as StoredSmart))
			.orderBy(sql`${tracksTable.title} collate nocase`, tracksTable.id)
			.all()
			.map((r) => r.id);
	}
	const rank = (
		statement(
			"SELECT count(*) AS n FROM playlists WHERE parent_id IS @p AND (position < @pos OR (position = @pos AND id < @id))",
		).get({ p: row.parentId, pos: row.position, id }) as { n: number }
	).n;
	const link = statement(
		"SELECT rb_id AS rb FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND ref_id = @id AND via NOT LIKE 'parent:%'",
	).get({ d: deviceId, id }) as { rb: string } | undefined;
	const hash = playlistContent(id, tracks) ?? "";
	return {
		hash,
		change: {
			kind: "playlist.set",
			playlistId: id,
			deviceRef: link?.rb ?? null,
			type: row.kind === "folder" ? "folder" : "playlist",
			name: row.name,
			parentId: row.parentId,
			position: rank + 1,
			tracks,
		},
	};
}

function stampOf(deviceId: string, id: string): string | null {
	const row = statement(
		"SELECT stamp FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND ref_id = @id",
	).get({ d: deviceId, id }) as { stamp: string | null } | undefined;
	return row ? row.stamp : null;
}

function emitPlaylist(
	deviceId: string,
	id: string,
	seq: number,
	force: boolean,
): ExportChange | null {
	const built = playlistSet(deviceId, id);
	if (!built) return null;
	if (!force && built.change.deviceRef && stampOf(deviceId, id) === built.hash)
		return null;
	// What is sent is what the device will hold: the stamp follows at once.
	if (built.change.deviceRef)
		statement(
			"UPDATE rekordbox_links SET stamp = @s WHERE device_id = @d AND kind = 'playlist' AND ref_id = @id",
		).run({ s: built.hash, d: deviceId, id });
	return { seq, ...built.change };
}

// A deleted playlist: the device removes its own copy.
function removalFor(
	deviceId: string,
	id: string,
	seq: number,
): ExportChange | null {
	const link = statement(
		"SELECT rb_id AS rb FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND ref_id = @id",
	).get({ d: deviceId, id }) as { rb: string } | undefined;
	if (!link) return null;
	statement(
		"DELETE FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND ref_id = @id",
	).run({
		d: deviceId,
		id,
	});
	return { seq, kind: "playlist.remove", playlistId: id, deviceRef: link.rb };
}

const CHANGE_FIELD: Record<string, TrackField> = {
	title: "title",
	artist: "artist",
	remixer: "remixer",
	album: "album",
	genre: "genre",
	label: "label",
	year: "year",
	comment: "comment",
	rating: "rating",
	colour: "color",
	tags: "myTags",
};

function linkedSet(deviceId: string, ids: readonly string[]): Set<string> {
	if (ids.length === 0) return new Set();
	return new Set(
		(
			statement(
				`SELECT ref_id AS id FROM rekordbox_links WHERE device_id = @d AND kind = 'track' AND state = 'linked'
				 AND ref_id IN (SELECT value FROM json_each(@ids))`,
			).all({ d: deviceId, ids: JSON.stringify(ids) }) as { id: string }[]
		).map((r) => r.id),
	);
}

function updatesFor(
	deviceId: string,
	wanted: Map<string, Set<TrackField>>,
	seq: number,
): ExportChange[] {
	const ids = [...wanted.keys()];
	const linked = linkedSet(deviceId, ids);
	const live = ids.filter((id) => linked.has(id));
	if (live.length === 0) return [];
	const rows = tracksById(live);
	const names = tagNamesOf(live);
	const out: ExportChange[] = [];
	for (const id of live) {
		const row = rows.get(id);
		if (!row) continue;
		const fields: Record<string, string | number | string[] | null> = {};
		for (const field of wanted.get(id) ?? [])
			fields[field] = asWire(field, hubValue(row, field, names.get(id) ?? []));
		if (Object.keys(fields).length > 0)
			out.push({ seq, kind: "track.update", trackId: id, fields });
	}
	return out;
}

function cueSetsFor(
	deviceId: string,
	trackIds: readonly string[],
	seq: number,
): ExportChange[] {
	const linked = linkedSet(deviceId, trackIds);
	const live = trackIds.filter((id) => linked.has(id));
	if (live.length === 0) return [];
	const cues = cuesOf(live);
	const anlz = analysisOf(live, deviceId);
	return live.map((id) => ({
		seq,
		kind: "cues.set" as const,
		trackId: id,
		cues: cues.get(id) ?? [],
		anlz: anlz.get(id) ?? [],
	}));
}

// -- the page ----------------------------------------------------------------------

export function pendingCount(deviceId: string, cursor: Cursor | null): number {
	const origin = `rekordbox:${deviceId}`;
	const seq = cursor?.seq ?? 0;
	const version = cursor?.version ?? -1;
	const changes = (
		statement(
			"SELECT count(*) AS n FROM changes WHERE seq > @s AND entity IN ('track', 'playlist') AND origin != @o",
		).get({
			s: cursor?.phase === "n" || cursor === null ? seq : 0,
			o: origin,
		}) as { n: number }
	).n;
	const adds = (
		statement(
			`SELECT count(*) AS n FROM tracks t LEFT JOIN rekordbox_links l ON l.device_id = @d AND l.kind = 'track' AND l.ref_id = t.id
			 WHERE t.version > @v AND ((l.rb_id IS NULL AND NOT ${GONE}) OR (l.state = 'linked' AND ${GONE}))`,
		).get({
			d: deviceId,
			v: cursor?.phase === "n" || cursor === null ? version : -1,
		}) as { n: number }
	).n;
	const conflicts = (
		statement(
			"SELECT count(*) AS n FROM conflicts WHERE device_id = @d AND pushed = 0",
		).get({ d: deviceId }) as { n: number }
	).n;
	return changes + adds + conflicts;
}

// Where the change log stood when the device's last import was merged, if it has one.
function importedAt(deviceId: string): number | null {
	const row = statement("SELECT activity FROM devices WHERE id = @id").get({
		id: deviceId,
	}) as { activity: string | null } | undefined;
	if (!row?.activity) return null;
	const seq = (JSON.parse(row.activity) as { import?: { seq?: number } }).import
		?.seq;
	return typeof seq === "number" ? seq : null;
}

export function exportPage(
	deviceId: string,
	request: ExportRequest,
): ExportPage {
	const limit = request.limit ?? DEFAULT_LIMIT;
	const origin = `rekordbox:${deviceId}`;
	const head = { seq: maxSeq(), version: readSettings().libraryVersion };
	let cursor: Cursor = request.cursor
		? parse(request.cursor)
		: {
				phase: "t",
				seq: importedAt(deviceId) ?? head.seq,
				version: head.version,
				at: -1,
				id: "",
			};

	if (limit === 0)
		return {
			cursor: format(cursor),
			hasMore: false,
			changes: [],
			pending: pendingCount(deviceId, request.cursor ? cursor : null),
		};

	const out: ExportChange[] = [];
	const room = () => limit - out.length;

	// Phase t: the tracks the device has no link for.
	if (cursor.phase === "t") {
		const rows = statement(
			`SELECT t.id AS id, t.version AS version FROM tracks t
			 WHERE (t.version, t.id) > (@v, @i) AND NOT ${GONE}
			   AND NOT EXISTS (SELECT 1 FROM rekordbox_links l WHERE l.device_id = @d AND l.kind = 'track' AND l.ref_id = t.id)
			 ORDER BY t.version, t.id LIMIT @n`,
		).all({ d: deviceId, v: cursor.at, i: cursor.id, n: room() }) as {
			id: string;
			version: number;
		}[];
		out.push(
			...addsFor(
				deviceId,
				rows.map((r) => r.id),
				cursor.seq,
			),
		);
		const last = rows[rows.length - 1];
		if (rows.length >= limit && last)
			return {
				cursor: format({ ...cursor, at: last.version, id: last.id }),
				hasMore: true,
				changes: out,
				pending: 0,
			};
		cursor = { phase: "p", seq: cursor.seq, version: cursor.version, id: "" };
	}

	// Phase p: every playlist, the ones the device already has exactly left out.
	if (cursor.phase === "p") {
		const n = Math.max(room(), 1);
		const rows = statement(
			"SELECT id FROM playlists WHERE id > @id ORDER BY id LIMIT @n",
		).all({
			id: cursor.id,
			n,
		}) as { id: string }[];
		for (const row of rows) {
			const change = emitPlaylist(deviceId, row.id, cursor.seq, false);
			if (change) out.push(change);
		}
		const last = rows[rows.length - 1];
		if (rows.length >= n && last)
			return {
				cursor: format({ ...cursor, id: last.id }),
				hasMore: true,
				changes: out,
				pending: 0,
			};
		cursor = {
			phase: "n",
			seq: cursor.seq,
			version: cursor.version,
			id: TAIL,
			conflict: 0,
		};
	}

	// Phase n: conflicts the hub won, then tracks arrived or gone, then logged changes.
	let { seq, version, id, conflict } = cursor;
	let more = false;
	const behind = seq < head.seq || version < head.version;

	const conflictN = Math.max(room(), 1);
	const conflictRows = statement(
		`SELECT id, entity, ref_id AS ref, field FROM conflicts
		 WHERE device_id = @d AND pushed = 0 AND id > @c ORDER BY id LIMIT @n`,
	).all({ d: deviceId, c: conflict, n: conflictN }) as Array<{
		id: number;
		entity: string;
		ref: string;
		field: string | null;
	}>;
	if (conflictRows.length > 0) {
		const fields = new Map<string, Set<TrackField>>();
		for (const c of conflictRows) {
			conflict = c.id;
			if (c.entity === "track" && c.field) {
				const set = fields.get(c.ref) ?? new Set<TrackField>();
				set.add(c.field as TrackField);
				fields.set(c.ref, set);
			} else if (c.entity === "playlist") {
				const change = emitPlaylist(deviceId, c.ref, seq, true);
				if (change) out.push(change);
			}
		}
		out.push(...updatesFor(deviceId, fields, seq));
		if (conflictRows.length >= conflictN) more = true;
	}

	if (!more && room() > 0) {
		const n = room();
		const rows = statement(
			`SELECT id, version FROM (
				SELECT t.id AS id, t.version AS version FROM tracks t
				LEFT JOIN rekordbox_links l ON l.device_id = @d AND l.kind = 'track' AND l.ref_id = t.id
				WHERE (t.version, t.id) > (@v, @i)
				  AND ((l.rb_id IS NULL AND NOT ${GONE}) OR (l.state = 'linked' AND ${GONE}))
				UNION ALL
				SELECT tt.track_id AS id, tt.version AS version FROM track_tombstones tt
				JOIN rekordbox_links l ON l.device_id = @d AND l.kind = 'track' AND l.ref_id = tt.track_id AND l.state = 'linked'
				WHERE (tt.version, tt.track_id) > (@v, @i)
			) ORDER BY version, id LIMIT @n`,
		).all({ d: deviceId, v: version, i: id, n }) as {
			id: string;
			version: number;
		}[];
		const present = statement(
			`SELECT 1 AS x FROM tracks t WHERE t.id = @id AND NOT ${GONE}`,
		);
		const live: string[] = [];
		for (const r of rows) {
			if (present.get({ id: r.id })) live.push(r.id);
			else out.push({ seq, kind: "track.remove", trackId: r.id });
		}
		out.push(...addsFor(deviceId, live, seq));
		const last = rows[rows.length - 1];
		if (last && rows.length >= n) {
			version = last.version;
			id = last.id;
			more = true;
		} else {
			version = head.version;
			id = TAIL;
		}
	}

	if (!more && room() > 0) {
		const n = room() * 4;
		const rows = statement(
			`SELECT seq, entity, entity_id AS ref, field, origin FROM changes
			 WHERE seq > @s AND entity IN ('track', 'playlist') ORDER BY seq LIMIT @n`,
		).all({ s: seq, n }) as Array<{
			seq: number;
			entity: string;
			ref: string;
			field: string;
			origin: string;
		}>;
		const fields = new Map<string, Set<TrackField>>();
		const cueTracks = new Set<string>();
		const lists = new Map<string, boolean>(); // playlist id -> exists
		for (const row of rows) {
			if (row.entity === "track") {
				if (row.origin === origin) continue;
				if (row.field === "cues") cueTracks.add(row.ref);
				else {
					const mapped = CHANGE_FIELD[row.field];
					if (!mapped) continue;
					const set = fields.get(row.ref) ?? new Set<TrackField>();
					set.add(mapped);
					fields.set(row.ref, set);
				}
			} else lists.set(row.ref, getPlaylist(row.ref) !== undefined);
		}
		const lastSeq = rows[rows.length - 1]?.seq ?? seq;
		out.push(...updatesFor(deviceId, fields, lastSeq));
		out.push(...cueSetsFor(deviceId, [...cueTracks], lastSeq));
		for (const [listId, exists] of lists) {
			const change = exists
				? emitPlaylist(deviceId, listId, lastSeq, false)
				: removalFor(deviceId, listId, lastSeq);
			if (change) out.push(change);
		}
		if (rows.length >= n && rows.length > 0) {
			seq = lastSeq;
			more = true;
		} else seq = head.seq;
	}

	// Smart playlists follow the library: on the last page, the ones that moved.
	if (!more && behind) {
		for (const row of statement(
			"SELECT id FROM playlists WHERE kind = 'smart'",
		).all() as { id: string }[]) {
			const change = emitPlaylist(deviceId, row.id, seq, false);
			if (change) out.push(change);
		}
	}

	return {
		cursor: format({ phase: "n", seq, version, id, conflict }),
		hasMore: more,
		changes: out,
		pending: more
			? pendingCount(deviceId, { phase: "n", seq, version, id, conflict })
			: 0,
	};
}

// The device applied everything up to `cursor` and says what it now holds.
export function ackExport(deviceId: string, ack: ExportAck): void {
	let conflict = 0;
	try {
		const parsed = parse(ack.cursor);
		if (parsed.phase === "n") conflict = parsed.conflict;
	} catch {
		// An unknown cursor is stored as given; the next request says cursor-expired.
	}
	db().transaction(() => {
		statement(
			"UPDATE devices SET export_cursor = @c, base_id = @id, base_version = @v, rekordbox = @rb, last_seen_at = @now WHERE id = @d",
		).run({
			d: deviceId,
			c: ack.cursor,
			id: ack.base.id,
			v: ack.base.version,
			rb: JSON.stringify(ack.rekordbox),
			now: Date.now(),
		});
		const link = statement(
			`INSERT INTO rekordbox_links (device_id, kind, rb_id, ref_id, via, state) VALUES (@d, @kind, @rb, @ref, @via, 'linked')
			 ON CONFLICT(device_id, kind, rb_id) DO UPDATE SET ref_id = @ref, via = @via, state = 'linked'`,
		);
		for (const t of ack.links.tracks)
			link.run({
				d: deviceId,
				kind: "track",
				rb: t.contentId,
				ref: t.trackId,
				via: t.via,
			});
		for (const p of ack.links.playlists)
			statement(
				`INSERT INTO rekordbox_links (device_id, kind, rb_id, ref_id, via, state, stamp) VALUES (@d, 'playlist', @rb, @ref, 'export', 'linked', NULL)
				 ON CONFLICT(device_id, kind, rb_id) DO UPDATE SET ref_id = @ref, via = 'export'`,
			).run({ d: deviceId, rb: p.rbPlaylistId, ref: p.playlistId });
		for (const trackId of ack.links.removedTracks)
			statement(
				"DELETE FROM rekordbox_links WHERE device_id = @d AND kind = 'track' AND ref_id = @id",
			).run({
				d: deviceId,
				id: trackId,
			});
		if (conflict > 0)
			statement(
				"UPDATE conflicts SET pushed = 1 WHERE device_id = @d AND pushed = 0 AND id <= @c",
			).run({
				d: deviceId,
				c: conflict,
			});
	});
	noteActivity(deviceId, "export", {
		applied: ack.applied,
		deferred: ack.deferred,
	});
}
