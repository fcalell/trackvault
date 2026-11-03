import { stat } from "node:fs/promises";
import { and, eq, inArray, sql } from "@fcalell/plugin-db/orm";
import { safeJoin } from "@trackvault/core/paths";
import { type TagPatch, writeTags } from "@trackvault/core/tags";
import { batches, changes, files, tracks } from "../../schema/index.ts";
import { bumpVersion, notifyChanged } from "../services/library.ts";
import { db, type Tx } from "./db.ts";
import { inserter, statement } from "./raw.ts";
import { readSettings } from "./settings.ts";
import {
	derivedText,
	issuesAfterEdit,
	TAG_KEYS,
	type TagKey,
	type TagValues,
	type TrackRow,
} from "./track-fields.ts";

// Every write to the library goes through here: the hot path of a bulk edit, a rule,
// a unify, an undo and a merge. Rows are read 500 at a time, the new values worked
// out in memory, and written with prepared statements in one transaction per 500
// (under the 1k of the plan), each field recorded in `changes` under the batch.

export const CHUNK = 500;

export interface PatchEntry {
	id: string;
	patch: TagValues;
}

export interface BatchInfo {
	batchId: string;
	origin: "ui" | "rule" | "autotag" | "rekordbox" | "agent" | "scan";
	label: string;
}

const insertChange = inserter(changes);

// A tag value as the library keeps it: text trimmed (empty is none), numbers whole
// where the column is.
export function clean(key: TagKey, value: unknown): string | number | null {
	if (value === undefined || value === null) return null;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed === "") return null;
		if (key === "year" || key === "energy" || key === "rating") {
			const n = Number(trimmed);
			return Number.isFinite(n) ? Math.round(n) : null;
		}
		if (key === "bpm") {
			const n = Number(trimmed);
			return Number.isFinite(n) ? n : null;
		}
		return trimmed;
	}
	if (key === "rating") return Math.max(0, Math.round(Number(value)));
	return value as number;
}

function columnOf(key: TagKey): string {
	return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// The columns an edit can write: the tags and what follows from them. Only the ones
// that changed are in the statement, so SQLite leaves every index on the others alone
// (a track has dozens; rewriting them all for one tag was most of the time).
const DERIVED_COLUMNS = [
	["artists", "artists"],
	["mixName", "mix_name"],
	["blockKey", "block_key"],
	["issues", "issues"],
] as const;

function updateFor(keys: readonly string[]) {
	const columns = keys.map((key) => {
		const derived = DERIVED_COLUMNS.find(([name]) => name === key);
		return `"${derived ? derived[1] : columnOf(key as TagKey)}" = @${key}`;
	});
	return statement(
		`UPDATE tracks SET ${columns.join(", ")}, updated_at = @now, version = @version WHERE id = @id`,
	);
}

export function ensureBatch(
	tx: Tx,
	info: BatchInfo,
	added: number,
	at: Date,
): void {
	tx.insert(batches)
		.values({
			id: info.batchId,
			origin: info.origin,
			label: info.label,
			count: added,
			at,
		})
		.onConflictDoUpdate({
			target: batches.id,
			set: { count: sql`${batches.count} + ${added}` },
		})
		.run();
}

export interface ApplyResult {
	// Tracks that changed.
	tracks: number;
	// Fields that changed.
	fields: number;
	ids: string[];
	version: number;
}

// Applies patches (the values wanted, a key left out is left alone) and records
// each field that really changes. `entries` is read as it goes; `progress` hears
// the entries handled. Safe to repeat: a field already at its value changes nothing.
export function applyPatches(
	entries: Iterable<PatchEntry>,
	info: BatchInfo,
	options: {
		signal?: AbortSignal;
		progress?: (handled: number) => void;
		// Extra work in the same transaction as each chunk (custom tags): the tracks
		// it changed and the changes it logged.
		after?: (
			tx: Tx,
			ids: string[],
			version: number,
			now: Date,
		) => { touched: string[]; logged: number };
	} = {},
): ApplyResult {
	const database = db();
	const lowKbps = readSettings().lowBitrateThreshold;
	const result: ApplyResult = { tracks: 0, fields: 0, ids: [], version: 0 };
	let handled = 0;
	let chunk: PatchEntry[] = [];

	const flush = (): void => {
		if (chunk.length === 0) return;
		const group = chunk;
		chunk = [];
		const ids = group.map((entry) => entry.id);
		const touched: string[] = [];
		let version = 0;
		database.transaction((tx) => {
			version = bumpVersion(tx);
			const now = new Date();
			const rows = new Map<string, TrackRow>();
			for (const row of tx
				.select()
				.from(tracks)
				.where(inArray(tracks.id, ids))
				.all())
				rows.set(row.id, row);
			let logged = 0;
			for (const entry of group) {
				const before = rows.get(entry.id);
				if (!before) continue;
				const next: Record<string, unknown> = { ...before };
				const edits: Array<{ key: TagKey; was: unknown; now: unknown }> = [];
				for (const key of TAG_KEYS) {
					if (!(key in entry.patch)) continue;
					const value = clean(key, entry.patch[key]);
					const was = before[key] ?? null;
					if (value === was) continue;
					next[key] = value;
					edits.push({ key, was, now: value });
				}
				if (edits.length === 0) continue;
				const merged = next as unknown as TrackRow;
				const derived = derivedText(merged);
				const issues = issuesAfterEdit({ ...merged, ...derived }, lowKbps);
				const changed: Record<string, unknown> = {};
				for (const edit of edits) changed[edit.key] = edit.now;
				// The remixer a title implies follows the tags like the other derived columns.
				const remixer = derived.remixer ?? null;
				if (remixer !== (next.remixer ?? null)) changed.remixer = remixer;
				const follows: Record<string, unknown> = {
					artists: derived.artists,
					mixName: derived.mixName,
					blockKey: derived.blockKey,
					issues,
				};
				for (const [name] of DERIVED_COLUMNS)
					if (follows[name] !== (before as Record<string, unknown>)[name])
						changed[name] = follows[name];
				updateFor(Object.keys(changed).sort()).run({
					...changed,
					now: now.getTime(),
					version,
					id: entry.id,
				});
				for (const edit of edits) {
					insertChange({
						entity: "track",
						entityId: entry.id,
						field: edit.key,
						before: edit.was,
						after: edit.now,
						origin: info.origin,
						batchId: info.batchId,
						at: now,
					});
					logged++;
				}
				touched.push(entry.id);
				result.fields += edits.length;
			}
			const extra = options.after?.(tx, ids, version, now);
			if (extra) {
				logged += extra.logged;
				for (const id of extra.touched)
					if (!touched.includes(id)) touched.push(id);
			}
			if (logged > 0) ensureBatch(tx, info, logged, now);
		});
		if (touched.length > 0) {
			result.tracks += touched.length;
			result.ids.push(...touched);
			result.version = version;
			notifyChanged(touched, version);
		}
		handled += group.length;
		options.progress?.(handled);
	};

	for (const entry of entries) {
		options.signal?.throwIfAborted();
		chunk.push(entry);
		if (chunk.length >= CHUNK) flush();
	}
	flush();
	return result;
}

// -- the file side ---------------------------------------------------------

export interface WriteResult {
	written: number;
	failed: number;
	errors: string[];
}

// Puts a patch into the tags of every file the track has on disk, and records the
// file's new size, mtime and inode so the scanner does not read it back as a change.
export async function writeTrackFiles(
	root: string,
	trackId: string,
	patch: TagPatch,
	result: WriteResult,
): Promise<void> {
	const database = db();
	const rows = database
		.select({ id: files.id, path: files.path })
		.from(files)
		.where(and(eq(files.trackId, trackId), eq(files.state, "ok")))
		.all();
	if (rows.length === 0) {
		result.failed++;
		if (result.errors.length < 20)
			result.errors.push(`${trackId}: no file on disk`);
	}
	for (const row of rows) {
		try {
			const absolute = safeJoin(root, row.path);
			await writeTags(absolute, patch);
			const info = await stat(absolute);
			database
				.update(files)
				.set({
					size: info.size,
					mtimeMs: Math.floor(info.mtimeMs),
					inode: info.ino,
				})
				.where(eq(files.id, row.id))
				.run();
			result.written++;
		} catch (error) {
			result.failed++;
			if (result.errors.length < 20)
				result.errors.push(
					`${row.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
		}
	}
}

const TAG_SET = new Set<string>(TAG_KEYS);

// Writes to the files the tag fields a batch changed (the batch's rows in `changes`
// are the truth, so a job resumed after a restart writes what the first run did not).
export async function flushTagWrites(
	batchId: string,
	options: {
		signal?: AbortSignal;
		progress?: (done: number, total: number, message: string) => void;
	} = {},
): Promise<WriteResult> {
	const result: WriteResult = { written: 0, failed: 0, errors: [] };
	const root = readSettings().libraryRoot;
	if (!root) throw new Error("The library folder is not set");
	const rows = db()
		.select({
			entityId: changes.entityId,
			field: changes.field,
			after: changes.after,
		})
		.from(changes)
		.where(and(eq(changes.batchId, batchId), eq(changes.entity, "track")))
		.orderBy(changes.seq)
		.all();
	const patches = new Map<string, TagPatch>();
	for (const row of rows) {
		if (!TAG_SET.has(row.field)) continue;
		const patch = patches.get(row.entityId) ?? {};
		Object.assign(patch, { [row.field]: row.after ?? null });
		patches.set(row.entityId, patch);
	}
	const items = [...patches];
	let next = 0;
	let done = 0;
	const worker = async (): Promise<void> => {
		for (;;) {
			options.signal?.throwIfAborted();
			const at = next++;
			const item = items[at];
			if (!item) return;
			await writeTrackFiles(root, item[0], item[1], result);
			done++;
			options.progress?.(done, items.length, "Writing tags");
		}
	};
	await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
	return result;
}
