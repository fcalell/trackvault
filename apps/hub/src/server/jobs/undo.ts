import { and, asc, eq, inArray } from "@fcalell/plugin-db/orm";
import {
	batches,
	changes,
	files,
	tags,
	tracks,
	trackTags,
} from "../../schema/index.ts";
import { applyPatches, clean, flushTagWrites } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { type FileMove, type FileValue, moveTracked } from "../lib/file-ops.ts";
import { acquireFs } from "../lib/fs-lock.ts";
import { defineJob } from "../lib/job.ts";
import { undoPlaylistChanges } from "../lib/playlists.ts";
import { inserter } from "../lib/raw.ts";
import { readSettings } from "../lib/settings.ts";
import { notifyPlaylists } from "../lib/sync/wake.ts";
import { TAG_KEYS, type TagKey, type TagValues } from "../lib/track-fields.ts";
import { setTagNames } from "../lib/track-tags.ts";
import { bumpVersion, notifyChanged } from "../services/library.ts";
import { removeEmptyFolders } from "./organise.ts";

export interface UndoPayload {
	batchId: string;
}

export interface UndoResult {
	batchId: string;
	restored: number;
	// Fields changed since the batch, left as they are now.
	skipped: number;
	failed: number;
	errors: string[];
}

const TAG_SET = new Set<string>(TAG_KEYS);
const insertChange = inserter(changes);
const CHUNK = 500;

const same = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Reverts a batch: each field goes back to its `before` value only while it still
// holds the batch's `after` (a field edited since is a conflict and is skipped);
// the files get the tags back, and moved or quarantined files return. The undo is a
// batch of its own, so it can be undone too.
export default defineJob<UndoPayload, UndoResult>({
	kind: "undo",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const database = db();
		const batch = database
			.select()
			.from(batches)
			.where(eq(batches.id, payload.batchId))
			.get();
		if (!batch) throw new Error("That batch is not in the history");
		if (batch.origin === "scan")
			throw new Error("A scan is not undone: it only reads what is on disk");
		if (batch.undoneBy && batch.undoneBy !== id)
			throw new Error("That batch was already undone");

		const rows = database
			.select()
			.from(changes)
			.where(eq(changes.batchId, payload.batchId))
			.orderBy(asc(changes.seq))
			.all();
		const result: UndoResult = {
			batchId: payload.batchId,
			restored: 0,
			skipped: 0,
			failed: 0,
			errors: [],
		};
		const total = rows.length;
		progress(0, total, "Reading the batch");

		// Per track, the first `before` and the last `after` of each field.
		const tagFields = new Map<
			string,
			Map<string, { before: unknown; after: unknown }>
		>();
		const tagSets = new Map<string, { before: string[]; after: string[] }>();
		const fileMoves = new Map<
			number,
			{ trackId: string; before: FileValue; after: FileValue }
		>();
		for (const row of rows) {
			if (row.entity !== "track") continue;
			if (TAG_SET.has(row.field)) {
				const fields = tagFields.get(row.entityId) ?? new Map();
				const seen = fields.get(row.field);
				fields.set(row.field, {
					before: seen ? seen.before : row.before,
					after: row.after,
				});
				tagFields.set(row.entityId, fields);
			} else if (row.field === "tags") {
				const seen = tagSets.get(row.entityId);
				tagSets.set(row.entityId, {
					before: seen ? seen.before : (row.before as string[]),
					after: row.after as string[],
				});
			} else if (row.field === "file") {
				const value = row.after as FileValue;
				const seen = fileMoves.get(value.id);
				fileMoves.set(value.id, {
					trackId: row.entityId,
					before: seen ? seen.before : (row.before as FileValue),
					after: value,
				});
			}
		}

		// -- tags: only the fields still at the batch's value ------------------
		const trackIds = [...tagFields.keys()];
		const patches: Array<{ id: string; patch: TagValues }> = [];
		for (let i = 0; i < trackIds.length; i += CHUNK) {
			signal.throwIfAborted();
			const group = trackIds.slice(i, i + CHUNK);
			const current = new Map(
				database
					.select()
					.from(tracks)
					.where(inArray(tracks.id, group))
					.all()
					.map((row) => [row.id, row]),
			);
			for (const trackId of group) {
				const row = current.get(trackId);
				const fields = tagFields.get(trackId);
				if (!row || !fields) continue;
				const patch: TagValues = {};
				for (const [field, value] of fields) {
					const key = field as TagKey;
					if (same(clean(key, row[key]), clean(key, value.after)))
						patch[key] = value.before as string | number | null;
					else result.skipped++;
				}
				if (Object.keys(patch).length > 0) patches.push({ id: trackId, patch });
			}
		}
		const info = {
			batchId: id,
			origin: "ui" as const,
			label: `Undo: ${batch.label}`,
		};
		const applied = applyPatches(patches, info, {
			signal,
			progress: (handled) => progress(handled, total, "Restoring values"),
		});
		result.restored += applied.fields;

		// -- custom tags -------------------------------------------------------
		for (const [trackId, set] of tagSets) {
			signal.throwIfAborted();
			const names = database
				.select({ name: tags.name })
				.from(trackTags)
				.innerJoin(tags, eq(tags.id, trackTags.tagId))
				.where(eq(trackTags.trackId, trackId))
				.all()
				.map((row) => row.name)
				.sort((a, b) => a.localeCompare(b));
			if (!same(names, set.after)) {
				result.skipped++;
				continue;
			}
			let version = 0;
			database.transaction((tx) => {
				version = bumpVersion(tx);
				const now = new Date();
				setTagNames(tx, trackId, set.before, now);
				insertChange({
					entity: "track",
					entityId: trackId,
					field: "tags",
					before: set.after,
					after: set.before,
					origin: "ui",
					batchId: id,
					at: now,
				});
				tx.insert(batches)
					.values({ id, origin: "ui", label: info.label, count: 1, at: now })
					.onConflictDoNothing()
					.run();
			});
			notifyChanged([trackId], version);
			result.restored++;
		}

		// -- playlists: the tree, the rule and the members ---------------------
		const playlistRows = rows
			.filter((row) => row.entity === "playlist")
			.map((row) => ({
				entityId: row.entityId,
				field: row.field,
				before: row.before,
				after: row.after,
			}));
		if (playlistRows.length > 0) {
			progress(0, playlistRows.length, "Restoring playlists");
			const undone = database.transaction((tx) =>
				undoPlaylistChanges(tx, info, playlistRows, new Date()),
			);
			result.restored += undone.restored;
			result.skipped += undone.skipped;
			notifyPlaylists();
		}

		// -- files: moved or quarantined ones return --------------------------
		const root = readSettings().libraryRoot;
		if (fileMoves.size > 0) {
			if (!root) throw new Error("The library folder is not set");
			const release = await acquireFs(signal);
			try {
				const moves: FileMove[] = [];
				for (const [fileId, move] of fileMoves) {
					const row = database
						.select()
						.from(files)
						.where(and(eq(files.id, fileId)))
						.get();
					if (
						!row ||
						row.path !== move.after.path ||
						row.state !== move.after.state
					) {
						result.skipped++;
						continue;
					}
					moves.push({
						trackId: move.trackId,
						fileId,
						from: move.after.path,
						to: move.before.path,
						fromState: move.after.state,
						toState: move.before.state,
						originalPath:
							move.before.state === "quarantined" ? move.after.path : null,
					});
				}
				moves.reverse();
				const moved = await moveTracked(root, moves, info, {
					signal,
					progress: (done) => progress(done, moves.length, "Moving files back"),
				});
				result.restored += moved.moved;
				result.failed += moved.failed;
				result.errors.push(...moved.errors);
				await removeEmptyFolders(
					root,
					moves.map((move) => move.from),
				);
			} finally {
				release();
			}
		}

		// -- the files' tags --------------------------------------------------
		const written = await flushTagWrites(id, {
			signal,
			progress: (done, of, message) => progress(done, of, message),
		});
		result.failed += written.failed;
		result.errors.push(...written.errors);

		database
			.update(batches)
			.set({ undoneBy: id })
			.where(eq(batches.id, payload.batchId))
			.run();
		progress(
			total,
			total,
			result.skipped > 0
				? `${result.restored} restored, ${result.skipped} changed since and left`
				: `${result.restored} restored`,
		);
		return result;
	},
});
