import { randomUUID } from "node:crypto";
import { type SQL, sql } from "@fcalell/plugin-db/orm";
import { compileRule, type SmartSchema } from "@trackvault/core/smart";
import {
	type ChangeOrigin,
	changes,
	PLAYLIST_KINDS,
	type PlaylistKind,
} from "../../schema/index.ts";
import type { StoredSmart } from "../../shared/playlists.ts";
import { type BatchInfo, ensureBatch } from "./changes.ts";
import type { Tx } from "./db.ts";
import { inserter, statement } from "./raw.ts";

// The playlist tree and the tracks in it. Every mutation takes the caller's transaction,
// writes through prepared statements and records what it did in `changes` (entity
// "playlist"), so an undo can reverse it and the device export can see it.
//
//   node    before/after: NodeValue, or null (created / deleted)
//   name, parentId, position, rule    before/after: the value
//   member  before/after: MemberValue, or null (a track added / removed / moved)

export const STEP = 1024;
// Neighbours closer than this are renumbered (a binary halving runs out of bits).
const MIN_GAP = 1e-6;

export interface NodeValue {
	parentId: string | null;
	kind: PlaylistKind;
	name: string;
	position: number;
	rule: unknown;
}

export interface MemberValue {
	trackId: string;
	position: number;
}

export interface PlaylistRow {
	id: string;
	parentId: string | null;
	kind: PlaylistKind;
	name: string;
	position: number;
	rule: unknown;
}

const insertChange = inserter(changes);

function log(
	info: BatchInfo,
	now: Date,
	id: string,
	field: string,
	before: unknown,
	after: unknown,
): void {
	insertChange({
		entity: "playlist",
		entityId: id,
		field,
		before: before ?? null,
		after: after ?? null,
		origin: info.origin,
		batchId: info.batchId,
		at: now,
	});
}

export function between(a: number | null, b: number | null): number {
	if (a === null && b === null) return STEP;
	if (a === null) return (b as number) - STEP;
	if (b === null) return a + STEP;
	return (a + b) / 2;
}

const rowOf = (raw: unknown): PlaylistRow | undefined => {
	const r = raw as
		| {
				id: string;
				parent_id: string | null;
				kind: PlaylistKind;
				name: string;
				position: number;
				rule: string | null;
		  }
		| undefined;
	return r
		? {
				id: r.id,
				parentId: r.parent_id,
				kind: r.kind,
				name: r.name,
				position: r.position,
				rule: r.rule === null ? null : JSON.parse(r.rule),
			}
		: undefined;
};

export function getPlaylist(id: string): PlaylistRow | undefined {
	return rowOf(
		statement(
			"SELECT id, parent_id, kind, name, position, rule FROM playlists WHERE id = @id",
		).get({ id }),
	);
}

export function nodeValue(row: PlaylistRow): NodeValue {
	return {
		parentId: row.parentId,
		kind: row.kind,
		name: row.name,
		position: row.position,
		rule: row.rule,
	};
}

function siblingMax(parentId: string | null): number | null {
	const r = statement(
		"SELECT max(position) AS p FROM playlists WHERE parent_id IS @parent",
	).get({ parent: parentId }) as { p: number | null };
	return r.p;
}

function positionOf(id: string | null | undefined): number | null {
	if (!id) return null;
	const r = statement("SELECT position FROM playlists WHERE id = @id").get({
		id,
	}) as { position: number } | undefined;
	return r ? r.position : null;
}

// Renumber the children of a folder in their order (rare: after many halvings).
function renumberSiblings(parentId: string | null): void {
	const rows = statement(
		"SELECT id FROM playlists WHERE parent_id IS @parent ORDER BY position, id",
	).all({ parent: parentId }) as { id: string }[];
	const set = statement("UPDATE playlists SET position = @p WHERE id = @id");
	rows.forEach((row, i) => {
		set.run({ id: row.id, p: (i + 1) * STEP });
	});
}

function requireFolder(parentId: string | null): void {
	if (parentId === null) return;
	const parent = getPlaylist(parentId);
	if (!parent) throw new PlaylistError("That folder is gone");
	if (parent.kind !== "folder")
		throw new PlaylistError("Only a folder holds playlists");
}

export class PlaylistError extends Error {}

function isDescendant(id: string, of: string | null): boolean {
	let cursor = of;
	for (let depth = 0; cursor && depth < 64; depth++) {
		if (cursor === id) return true;
		cursor = getPlaylist(cursor)?.parentId ?? null;
	}
	return false;
}

export function createNode(
	tx: Tx,
	info: BatchInfo,
	input: {
		id?: string;
		parentId: string | null;
		kind: PlaylistKind;
		name: string;
		rule?: unknown;
		position?: number;
	},
	now: Date,
): PlaylistRow {
	if (!(PLAYLIST_KINDS as readonly string[]).includes(input.kind))
		throw new PlaylistError("Unknown playlist kind");
	requireFolder(input.parentId);
	const row: PlaylistRow = {
		id: input.id ?? randomUUID(),
		parentId: input.parentId,
		kind: input.kind,
		name: input.name,
		position: input.position ?? (siblingMax(input.parentId) ?? 0) + STEP,
		rule: input.rule ?? null,
	};
	statement(
		`INSERT INTO playlists (id, parent_id, kind, name, position, rule, created_at, updated_at)
		 VALUES (@id, @parent, @kind, @name, @position, @rule, @now, @now)`,
	).run({
		id: row.id,
		parent: row.parentId,
		kind: row.kind,
		name: row.name,
		position: row.position,
		rule: row.rule === null ? null : JSON.stringify(row.rule),
		now: now.getTime(),
	});
	log(info, now, row.id, "node", null, nodeValue(row));
	ensureBatch(tx, info, 1, now);
	return row;
}

export function renameNode(
	tx: Tx,
	info: BatchInfo,
	id: string,
	name: string,
	now: Date,
): boolean {
	const row = getPlaylist(id);
	if (!row) throw new PlaylistError("That playlist is gone");
	if (row.name === name) return false;
	statement(
		"UPDATE playlists SET name = @name, updated_at = @now WHERE id = @id",
	).run({ id, name, now: now.getTime() });
	log(info, now, id, "name", row.name, name);
	ensureBatch(tx, info, 1, now);
	return true;
}

export function setRule(
	tx: Tx,
	info: BatchInfo,
	id: string,
	rule: StoredSmart,
	now: Date,
): void {
	const row = getPlaylist(id);
	if (!row) throw new PlaylistError("That playlist is gone");
	if (row.kind !== "smart")
		throw new PlaylistError("Only a smart playlist has a rule");
	statement(
		"UPDATE playlists SET rule = @rule, updated_at = @now WHERE id = @id",
	).run({ id, rule: JSON.stringify(rule), now: now.getTime() });
	log(info, now, id, "rule", row.rule, rule);
	ensureBatch(tx, info, 1, now);
}

// Moves a node into `parentId` (null: the top) between two siblings; with neither, last.
export function moveNode(
	tx: Tx,
	info: BatchInfo,
	id: string,
	parentId: string | null,
	after: string | null,
	before: string | null,
	now: Date,
): void {
	const row = getPlaylist(id);
	if (!row) throw new PlaylistError("That playlist is gone");
	requireFolder(parentId);
	if (isDescendant(id, parentId))
		throw new PlaylistError("A folder cannot move into itself");
	const siblingIn = (sibling: string | null): string | null => {
		if (!sibling || sibling === id) return null;
		const s = getPlaylist(sibling);
		return s && s.parentId === parentId ? sibling : null;
	};
	const a = siblingIn(after);
	const b = siblingIn(before);
	let a$ = positionOf(a);
	let b$ = positionOf(b);
	if (a === null && b === null) {
		a$ = siblingMax(parentId);
		if (row.parentId === parentId && a$ === row.position) return;
	}
	if (a$ !== null && b$ !== null && b$ - a$ < MIN_GAP * 2) {
		renumberSiblings(parentId);
		a$ = positionOf(a);
		b$ = positionOf(b);
	}
	const position = between(a$, b$);
	if (row.parentId === parentId && position === row.position) return;
	statement(
		"UPDATE playlists SET parent_id = @parent, position = @position, updated_at = @now WHERE id = @id",
	).run({ id, parent: parentId, position, now: now.getTime() });
	let logged = 0;
	if (row.parentId !== parentId) {
		log(info, now, id, "parentId", row.parentId, parentId);
		logged++;
	}
	log(info, now, id, "position", row.position, position);
	logged++;
	ensureBatch(tx, info, logged, now);
}

// The playlist and everything under it, deepest first (the order to delete in).
function subtree(id: string): string[] {
	const rows = statement(
		`WITH RECURSIVE tree(id, depth) AS (
			SELECT id, 0 FROM playlists WHERE id = @id
			UNION ALL
			SELECT p.id, tree.depth + 1 FROM playlists p JOIN tree ON p.parent_id = tree.id
		) SELECT id FROM tree ORDER BY depth DESC`,
	).all({ id }) as { id: string }[];
	return rows.map((r) => r.id);
}

export function removeNode(
	tx: Tx,
	info: BatchInfo,
	id: string,
	now: Date,
): number {
	let logged = 0;
	for (const each of subtree(id)) {
		const row = getPlaylist(each);
		if (!row) continue;
		const members = statement(
			"SELECT track_id, position FROM playlist_tracks WHERE playlist_id = @id ORDER BY position, track_id",
		).all({ id: each }) as { track_id: string; position: number }[];
		for (const m of members) {
			log(
				info,
				now,
				each,
				"member",
				{ trackId: m.track_id, position: m.position },
				null,
			);
			logged++;
		}
		statement("DELETE FROM playlist_tracks WHERE playlist_id = @id").run({
			id: each,
		});
		statement("DELETE FROM playlists WHERE id = @id").run({ id: each });
		log(info, now, each, "node", nodeValue(row), null);
		logged++;
	}
	ensureBatch(tx, info, logged, now);
	return logged;
}

function lastMember(playlistId: string): number | null {
	const r = statement(
		"SELECT max(position) AS p FROM playlist_tracks WHERE playlist_id = @id",
	).get({ id: playlistId }) as { p: number | null };
	return r.p;
}

export function requireManual(playlistId: string): PlaylistRow {
	const row = getPlaylist(playlistId);
	if (!row) throw new PlaylistError("That playlist is gone");
	if (row.kind !== "manual")
		throw new PlaylistError(
			row.kind === "smart"
				? "A smart playlist fills itself from its rule"
				: "A folder holds playlists, not tracks",
		);
	return row;
}

// Appends the tracks the playlist lacks, in the order given. Returns how many were new.
export function addMembers(
	tx: Tx,
	info: BatchInfo,
	playlistId: string,
	trackIds: readonly string[],
	now: Date,
): number {
	requireManual(playlistId);
	let position = lastMember(playlistId) ?? 0;
	const insert = statement(
		`INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
		 SELECT @playlist, id, @position, @now FROM tracks WHERE id = @track`,
	);
	let added = 0;
	for (const trackId of trackIds) {
		const next = position + STEP;
		const r = insert.run({
			playlist: playlistId,
			track: trackId,
			position: next,
			now: now.getTime(),
		});
		if (r.changes === 0) continue;
		position = next;
		added++;
		log(info, now, playlistId, "member", null, { trackId, position: next });
	}
	if (added > 0) {
		statement("UPDATE playlists SET updated_at = @now WHERE id = @id").run({
			id: playlistId,
			now: now.getTime(),
		});
		ensureBatch(tx, info, added, now);
	}
	return added;
}

export function removeMembers(
	tx: Tx,
	info: BatchInfo,
	playlistId: string,
	trackIds: readonly string[],
	now: Date,
): number {
	requireManual(playlistId);
	const find = statement(
		"SELECT position FROM playlist_tracks WHERE playlist_id = @p AND track_id = @t",
	);
	const del = statement(
		"DELETE FROM playlist_tracks WHERE playlist_id = @p AND track_id = @t",
	);
	let removed = 0;
	for (const trackId of trackIds) {
		const was = find.get({ p: playlistId, t: trackId }) as
			| { position: number }
			| undefined;
		if (!was) continue;
		del.run({ p: playlistId, t: trackId });
		log(
			info,
			now,
			playlistId,
			"member",
			{ trackId, position: was.position },
			null,
		);
		removed++;
	}
	if (removed > 0) ensureBatch(tx, info, removed, now);
	return removed;
}

function renumberMembers(playlistId: string): void {
	const rows = statement(
		"SELECT track_id FROM playlist_tracks WHERE playlist_id = @id ORDER BY position, track_id",
	).all({ id: playlistId }) as { track_id: string }[];
	const set = statement(
		"UPDATE playlist_tracks SET position = @p WHERE playlist_id = @id AND track_id = @t",
	);
	rows.forEach((row, i) => {
		set.run({ id: playlistId, t: row.track_id, p: (i + 1) * STEP });
	});
}

const memberPosition = (playlistId: string, trackId: string | null) => {
	if (!trackId) return null;
	const r = statement(
		"SELECT position FROM playlist_tracks WHERE playlist_id = @p AND track_id = @t",
	).get({ p: playlistId, t: trackId }) as { position: number } | undefined;
	return r ? r.position : null;
};

// Reorder: one row's position is set between its new neighbours. O(1).
export function moveMember(
	tx: Tx,
	info: BatchInfo,
	playlistId: string,
	trackId: string,
	after: string | null,
	before: string | null,
	now: Date,
): boolean {
	requireManual(playlistId);
	const was = memberPosition(playlistId, trackId);
	if (was === null)
		throw new PlaylistError("That track is not in the playlist");
	let a = after === trackId ? null : memberPosition(playlistId, after);
	let b = before === trackId ? null : memberPosition(playlistId, before);
	if (a !== null && b !== null && b - a < MIN_GAP * 2) {
		renumberMembers(playlistId);
		a = memberPosition(playlistId, after);
		b = memberPosition(playlistId, before);
	}
	if (a === null && b === null) return false;
	const position = between(a, b);
	if (position === memberPosition(playlistId, trackId)) return false;
	const previous = memberPosition(playlistId, trackId);
	statement(
		"UPDATE playlist_tracks SET position = @position WHERE playlist_id = @p AND track_id = @t",
	).run({ p: playlistId, t: trackId, position });
	log(
		info,
		now,
		playlistId,
		"member",
		{ trackId, position: previous },
		{ trackId, position },
	);
	ensureBatch(tx, info, 1, now);
	return true;
}

// Puts the members in `order` (tracks not named keep their relative order after them).
// Every position that changes is a logged member move; the rest are left alone.
export function reorderMembers(
	tx: Tx,
	info: BatchInfo,
	playlistId: string,
	order: readonly string[],
	now: Date,
): number {
	const rows = statement(
		"SELECT track_id AS t, position AS p FROM playlist_tracks WHERE playlist_id = @id ORDER BY position, track_id",
	).all({ id: playlistId }) as { t: string; p: number }[];
	const present = new Set(rows.map((row) => row.t));
	const wanted = order.filter((id) => present.has(id));
	const named = new Set(wanted);
	const sequence = [
		...wanted,
		...rows.map((row) => row.t).filter((id) => !named.has(id)),
	];
	const was = new Map(rows.map((row) => [row.t, row.p]));
	const set = statement(
		"UPDATE playlist_tracks SET position = @p WHERE playlist_id = @id AND track_id = @t",
	);
	let logged = 0;
	sequence.forEach((trackId, i) => {
		const position = (i + 1) * STEP;
		const previous = was.get(trackId);
		if (previous === position) return;
		set.run({ id: playlistId, t: trackId, p: position });
		log(
			info,
			now,
			playlistId,
			"member",
			{ trackId, position: previous },
			{ trackId, position },
		);
		logged++;
	});
	if (logged > 0) ensureBatch(tx, info, logged, now);
	return logged;
}

// -- smart playlists --------------------------------------------------------

export const SMART_SCHEMA: SmartSchema = {
	columns: {
		bpm: "tracks.bpm",
		rating: "tracks.rating",
		energy: "tracks.energy",
		year: "tracks.year",
		playCount: "tracks.play_count",
		durationSec: "tracks.duration_ms",
		lufs: "tracks.loudness",
		genre: "tracks.genre",
		artist: "tracks.artist",
		title: "tracks.title",
		album: "tracks.album",
		label: "tracks.label",
		remixer: "tracks.remixer",
		key: "tracks.key",
		addedAt: "tracks.added_at",
		lastPlayedAt: "tracks.last_played_at",
	},
	scale: { durationSec: 1000 },
	dateUnit: "ms",
	tags: {
		trackId: "tracks.id",
		table: "track_tags",
		trackColumn: "track_id",
		tagColumn: "name",
		join: { table: "tags", idColumn: "id", linkColumn: "tag_id" },
	},
};

const SORT_SQL: Record<string, string> = {
	title: "tracks.title collate nocase",
	artist: "tracks.artist collate nocase",
	bpm: "tracks.bpm",
	rating: "tracks.rating",
	addedAt: "tracks.added_at",
	lastPlayedAt: "tracks.last_played_at",
};

// A compiled `{ sql, params }` as a drizzle fragment (the placeholders bound in order).
export function fragment(compiled: {
	sql: string;
	params: Array<string | number>;
}): SQL {
	const parts = compiled.sql.split("?");
	const chunks: SQL[] = [];
	parts.forEach((part, i) => {
		chunks.push(sql.raw(part));
		if (i < compiled.params.length) chunks.push(sql`${compiled.params[i]}`);
	});
	return sql.join(chunks, sql.raw(""));
}

const NOT_QUARANTINED = sql.raw('("tracks"."issues" & 2048) = 0');

// The tracks a smart playlist holds, as a condition on `tracks`. A limit keeps the first
// N of the playlist's sort (a subquery), so the window and its total agree.
export function smartWhere(def: StoredSmart, now = Date.now()): SQL {
	const compiled = fragment(compileRule(def.rule, SMART_SCHEMA, now));
	const base = sql`${NOT_QUARANTINED} AND ${compiled}`;
	if (!def.limit) return base;
	const order = SORT_SQL[def.sort?.field ?? "addedAt"] ?? "tracks.added_at";
	const dir = (def.sort?.dir ?? "desc") === "asc" ? "asc" : "desc";
	return sql`tracks.id IN (SELECT tracks.id FROM tracks WHERE ${base} ORDER BY ${sql.raw(order)} ${sql.raw(dir)}, tracks.id LIMIT ${Math.max(1, Math.floor(def.limit))})`;
}

export const isSmart = (value: unknown): value is StoredSmart =>
	typeof value === "object" && value !== null && "rule" in value;

// -- undo -------------------------------------------------------------------

export interface PlaylistChangeRow {
	entityId: string;
	field: string;
	before: unknown;
	after: unknown;
}

const same = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Reverses a batch's playlist changes, newest first. A value edited since the batch is
// left as it is (and counted skipped). The reversal is logged under `info`.
export function undoPlaylistChanges(
	tx: Tx,
	info: BatchInfo,
	rows: readonly PlaylistChangeRow[],
	now: Date,
): { restored: number; skipped: number; ids: string[] } {
	let restored = 0;
	let skipped = 0;
	const touched = new Set<string>();
	for (const row of [...rows].reverse()) {
		const id = row.entityId;
		const current = getPlaylist(id);
		touched.add(id);
		if (row.field === "node") {
			if (row.before === null) {
				// Created by the batch: gone again.
				if (!current) continue;
				const members = statement(
					"SELECT track_id, position FROM playlist_tracks WHERE playlist_id = @id",
				).all({ id }) as { track_id: string; position: number }[];
				for (const m of members)
					log(
						info,
						now,
						id,
						"member",
						{ trackId: m.track_id, position: m.position },
						null,
					);
				statement("DELETE FROM playlist_tracks WHERE playlist_id = @id").run({
					id,
				});
				statement("DELETE FROM playlists WHERE id = @id").run({ id });
				log(info, now, id, "node", nodeValue(current), null);
				restored++;
			} else if (row.after === null) {
				if (current) {
					skipped++;
					continue;
				}
				const value = row.before as NodeValue;
				const parent = value.parentId ? getPlaylist(value.parentId) : undefined;
				createNode(
					tx,
					info,
					{
						id,
						parentId: value.parentId && !parent ? null : value.parentId,
						kind: value.kind,
						name: value.name,
						rule: value.rule,
						position: value.position,
					},
					now,
				);
				restored++;
			}
			continue;
		}
		if (row.field === "member") {
			const before = row.before as MemberValue | null;
			const after = row.after as MemberValue | null;
			if (!current) {
				skipped++;
				continue;
			}
			const trackId = (before ?? after)?.trackId as string;
			const has = memberPosition(id, trackId);
			if (before === null && after) {
				if (has === null) continue;
				removeMembers(tx, info, id, [trackId], now);
				restored++;
			} else if (after === null && before) {
				if (has !== null) continue;
				const r = statement(
					`INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
					 SELECT @p, id, @position, @now FROM tracks WHERE id = @t`,
				).run({
					p: id,
					t: trackId,
					position: before.position,
					now: now.getTime(),
				});
				if (r.changes > 0) {
					log(info, now, id, "member", null, before);
					ensureBatch(tx, info, 1, now);
					restored++;
				} else skipped++;
			} else if (before && after) {
				if (has === null || has !== after.position) {
					skipped++;
					continue;
				}
				statement(
					"UPDATE playlist_tracks SET position = @position WHERE playlist_id = @p AND track_id = @t",
				).run({ p: id, t: trackId, position: before.position });
				log(info, now, id, "member", after, before);
				ensureBatch(tx, info, 1, now);
				restored++;
			}
			continue;
		}
		// name, parentId, position, rule
		if (!current) {
			skipped++;
			continue;
		}
		const column = {
			name: "name",
			parentId: "parent_id",
			position: "position",
			rule: "rule",
		}[row.field];
		if (!column) continue;
		const now$ = (current as unknown as Record<string, unknown>)[row.field];
		if (!same(now$, row.after)) {
			skipped++;
			continue;
		}
		statement(
			`UPDATE playlists SET ${column} = @v, updated_at = @now WHERE id = @id`,
		).run({
			id,
			v:
				row.field === "rule"
					? row.before === null
						? null
						: JSON.stringify(row.before)
					: (row.before as string | number | null),
			now: now.getTime(),
		});
		log(info, now, id, row.field, row.after, row.before);
		ensureBatch(tx, info, 1, now);
		restored++;
	}
	return { restored, skipped, ids: [...touched] };
}

export type { ChangeOrigin };
