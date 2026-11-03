import { stat } from "node:fs/promises";
import { eq } from "@fcalell/plugin-db/orm";
import { analyzeFile } from "@trackvault/core/analyze";
import type { InboxDecision } from "@trackvault/core/inbox";
import { safeJoin } from "@trackvault/core/paths";
import { files, tracks, trackTags, wishlist } from "../../../schema/index.ts";
import peaks from "../../jobs/peaks.ts";
import { enqueue } from "../../services/jobs.ts";
import { bumpVersion, notifyChanged } from "../../services/library.ts";
import {
	applyPatches,
	type BatchInfo,
	flushTagWrites,
	openBatch,
} from "../changes.ts";
import { db } from "../db.ts";
import { type FileMove, moveTracked } from "../file-ops.ts";
import { acquireFs } from "../fs-lock.ts";
import { replaceMember } from "../playlists.ts";
import { moveFile, quarantinePath } from "../quarantine.ts";
import { statement } from "../raw.ts";
import { applyOutcomes } from "../scan/apply.ts";
import type { AnalyzeOutcome } from "../scan/pool.ts";
import { readSettings } from "../settings.ts";
import { TAG_KEYS, type TagValues } from "../track-fields.ts";
import { applyTagSets } from "../track-tags.ts";
import { moveAcross, pruneInboxFolders, REJECTED_DIR } from "./files.ts";
import { getItem, patchItem, proposedOf } from "./items.ts";
import { targetFor } from "./steps.ts";

export interface ApproveResult {
	approved: number;
	replaced: number;
	failed: number;
	errors: string[];
}

interface Landed {
	id: string;
	from: string;
	target: string;
	replaces: string | null;
}

const CHUNK = 40;
const TAG_SET = new Set<string>(TAG_KEYS);

const replacesOf = (decision: unknown): string | null => {
	const d = decision as InboxDecision | null;
	return d?.kind === "better-than-existing" ? String(d.replaces) : null;
};

// Files approved items into the library. For each: the file moves to the path the
// template names, is read into a track, gets the cleaned tags as one logged batch
// (written to the file afterwards, like any edit), and, when it replaces a library
// track, takes that track's playlists, custom tags and rating before the old files go
// to the quarantine. All of it is one batch, so one undo puts the library back.
export async function approveItems(
	ids: readonly string[],
	options: {
		batchId: string;
		origin: "ui" | "rule";
		signal?: AbortSignal;
		progress?: (done: number, total: number, message: string) => void;
	},
): Promise<ApproveResult> {
	const settings = readSettings();
	const root = settings.libraryRoot;
	if (!root) throw new Error("The library folder is not set");
	const info: BatchInfo = {
		batchId: options.batchId,
		origin: options.origin,
		label: "Inbox approval",
	};
	openBatch(info);
	const result: ApproveResult = {
		approved: 0,
		replaced: 0,
		failed: 0,
		errors: [],
	};
	const release = await acquireFs(options.signal);
	try {
		let handled = 0;
		const fail = (id: string, message: string): void => {
			result.failed++;
			if (result.errors.length < 20) result.errors.push(`${id}: ${message}`);
			patchItem(id, { error: message });
		};
		for (let i = 0; i < ids.length; i += CHUNK) {
			options.signal?.throwIfAborted();
			const landed: Landed[] = [];
			const outcomes: AnalyzeOutcome[] = [];
			const found = new Map<
				string,
				{ path: string; size: number; mtimeMs: number; inode: number }
			>();
			// 1. The files move into the library.
			for (const id of ids.slice(i, i + CHUNK)) {
				const row = getItem(id);
				if (row?.state !== "awaiting-approval") {
					handled++;
					continue;
				}
				try {
					const target = await targetFor(row, { root, settings });
					await moveFile(root, row.path, target);
					const absolute = safeJoin(root, target);
					const info = await stat(absolute);
					found.set(target, {
						path: target,
						size: info.size,
						mtimeMs: Math.floor(info.mtimeMs),
						inode: info.ino,
					});
					outcomes.push({
						path: target,
						analysis: await analyzeFile(absolute),
					});
					landed.push({
						id,
						from: row.path,
						target,
						replaces: replacesOf(row.decision),
					});
				} catch (error) {
					fail(id, error instanceof Error ? error.message : String(error));
				}
			}
			if (landed.length === 0) continue;

			// 2. They are read into tracks (the scan's own writer).
			const existed = new Set(
				(
					statement(
						`SELECT audio_hash AS h FROM tracks WHERE audio_hash IN (SELECT value FROM json_each(@h))`,
					).all({
						h: JSON.stringify(
							outcomes.flatMap((o) =>
								"analysis" in o ? [o.analysis.audioHash] : [],
							),
						),
					}) as Array<{ h: string }>
				).map((r) => r.h),
			);
			const applied = applyOutcomes(
				outcomes,
				found,
				new Map(),
				settings.lowBitrateThreshold,
				options.batchId,
			);
			notifyChanged(applied.ids, applied.version);
			if (applied.stats.added > 0) enqueue(peaks, {}, { reuse: () => true });

			// 3. Their tags, then the replaced tracks.
			const patches: Array<{ id: string; patch: TagValues }> = [];
			const moves: FileMove[] = [];
			const tracksOf = new Map<string, string>();
			for (const each of landed) {
				const outcome = outcomes.find((o) => o.path === each.target);
				const hash =
					outcome && "analysis" in outcome ? outcome.analysis.audioHash : null;
				const track = hash
					? (statement("SELECT id FROM tracks WHERE audio_hash = @h").get({
							h: hash,
						}) as { id: string } | undefined)
					: undefined;
				if (!track) {
					fail(each.id, "The file could not be read into the library");
					continue;
				}
				tracksOf.set(each.id, track.id);
				const row = getItem(each.id);
				if (!row) continue;
				const isNew = !existed.has(hash as string);
				const wanted: TagValues = {};
				if (isNew)
					for (const [key, value] of Object.entries(proposedOf(row)))
						if (TAG_SET.has(key))
							(wanted as Record<string, unknown>)[key] = value;
				if (each.replaces && each.replaces !== track.id) {
					const old = db()
						.select()
						.from(tracks)
						.where(eq(tracks.id, each.replaces))
						.get();
					if (old) {
						const mine = db()
							.select()
							.from(tracks)
							.where(eq(tracks.id, track.id))
							.get();
						if (mine && mine.rating === 0 && old.rating > 0)
							wanted.rating = old.rating;
						if (mine && !mine.comment && old.comment)
							wanted.comment = old.comment;
						for (const file of db()
							.select()
							.from(files)
							.where(eq(files.trackId, old.id))
							.all()) {
							if (file.state !== "ok") continue;
							moves.push({
								trackId: old.id,
								fileId: file.id,
								from: file.path,
								to: quarantinePath(options.batchId, file.path),
								fromState: "ok",
								toState: "quarantined",
								originalPath: file.path,
							});
						}
					}
				}
				if (Object.keys(wanted).length > 0)
					patches.push({ id: track.id, patch: wanted });
			}

			const swaps = landed
				.filter((each) => each.replaces && tracksOf.get(each.id))
				.map((each) => ({
					oldId: each.replaces as string,
					newId: tracksOf.get(each.id) as string,
				}))
				.filter((swap) => swap.oldId !== swap.newId);
			if (swaps.length > 0) {
				let version = 0;
				const touched: string[] = [];
				db().transaction((tx) => {
					version = bumpVersion(tx);
					const now = new Date();
					for (const swap of swaps) {
						replaceMember(tx, info, swap.oldId, swap.newId, now);
						const tagIds = tx
							.select({ tagId: trackTags.tagId })
							.from(trackTags)
							.where(eq(trackTags.trackId, swap.oldId))
							.all()
							.map((r) => r.tagId);
						if (tagIds.length > 0)
							applyTagSets(tx, [swap.newId], tagIds, [], info, now);
						touched.push(swap.newId);
					}
				});
				notifyChanged(touched, version);
			}
			if (patches.length > 0)
				applyPatches(
					patches,
					info,
					options.signal ? { signal: options.signal } : {},
				);
			if (moves.length > 0) {
				const moved = await moveTracked(
					root,
					moves,
					info,
					options.signal ? { signal: options.signal } : {},
				);
				result.replaced += swaps.length;
				for (const message of moved.errors)
					if (result.errors.length < 20) result.errors.push(message);
			}

			// 4. The items are done; a want they answered is in the library.
			for (const each of landed) {
				const trackId = tracksOf.get(each.id);
				if (!trackId) continue;
				const row = getItem(each.id);
				patchItem(each.id, { state: "approved", trackId, error: null });
				result.approved++;
				if (row?.wantId)
					db()
						.update(wishlist)
						.set({ status: "in-library", updatedAt: new Date() })
						.where(eq(wishlist.id, row.wantId))
						.run();
			}
			await pruneInboxFolders(
				root,
				landed.map((each) => each.from),
			);
			handled += landed.length;
			options.progress?.(handled, ids.length, "Filing tracks");
		}
		if (result.approved > 0)
			await flushTagWrites(options.batchId, {
				...(options.signal ? { signal: options.signal } : {}),
				...(options.progress ? { progress: options.progress } : {}),
			});
		return result;
	} finally {
		release();
	}
}

// Rejects items: their files wait in `.quarantine/_inbox/` for the quarantine's days.
export async function rejectItems(
	ids: readonly string[],
	batchId: string,
	signal?: AbortSignal,
): Promise<number> {
	const root = readSettings().libraryRoot;
	if (!root) throw new Error("The library folder is not set");
	let rejected = 0;
	const gone: string[] = [];
	for (const id of ids) {
		signal?.throwIfAborted();
		const row = getItem(id);
		if (!row || row.state === "approved" || row.state === "rejected") continue;
		try {
			const name = row.path.slice(row.path.lastIndexOf("/") + 1);
			await moveAcross(
				safeJoin(root, row.path),
				safeJoin(
					root,
					`${REJECTED_DIR}/${batchId}/${row.id.slice(0, 8)}-${name}`,
				),
			).catch((error: NodeJS.ErrnoException) => {
				// A file already gone is rejected all the same.
				if (error.code !== "ENOENT") throw error;
			});
			gone.push(row.path);
			patchItem(id, { state: "rejected", error: null });
			rejected++;
			if (row.wantId)
				db()
					.update(wishlist)
					.set({ status: "wanted", updatedAt: new Date() })
					.where(eq(wishlist.id, row.wantId))
					.run();
		} catch (error) {
			patchItem(id, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	await pruneInboxFolders(root, gone);
	return rejected;
}
