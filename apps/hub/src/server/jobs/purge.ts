import { and, eq, inArray, lt } from "@fcalell/plugin-db/orm";
import { files, tracks, trackTombstones } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { acquireFs } from "../lib/fs-lock.ts";
import { purgeRejected } from "../lib/inbox/files.ts";
import { defineJob } from "../lib/job.ts";
import { removeFile } from "../lib/quarantine.ts";
import { readSettings } from "../lib/settings.ts";
import { bumpVersion, notifyChanged } from "../services/library.ts";
import { removeEmptyFolders } from "./organise.ts";

export interface PurgePayload {
	// Only files quarantined more than this many days ago; absent is all of them
	// (the owner pressed "Empty the quarantine").
	olderThanDays?: number;
	fileIds?: number[];
}

export interface PurgeResult {
	deleted: number;
	failed: number;
}

// Deletes quarantined files from the disk for good, and their tracks from the
// library once no file of the track is left. The change log keeps the record.
export default defineJob<PurgePayload, PurgeResult>({
	kind: "purge",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const where = and(
			eq(files.state, "quarantined"),
			payload.fileIds ? inArray(files.id, payload.fileIds) : undefined,
			payload.olderThanDays !== undefined
				? lt(
						files.quarantinedAt,
						new Date(Date.now() - payload.olderThanDays * 24 * 3600 * 1000),
					)
				: undefined,
		);
		const rows = db().select().from(files).where(where).all();
		progress(0, rows.length, "Deleting files");
		const release = await acquireFs(signal);
		const result: PurgeResult = { deleted: 0, failed: 0 };
		try {
			const gone: number[] = [];
			const trackIds = new Set<string>();
			for (const [index, row] of rows.entries()) {
				signal.throwIfAborted();
				try {
					await removeFile(root, row.path);
					gone.push(row.id);
					if (row.trackId) trackIds.add(row.trackId);
					result.deleted++;
				} catch {
					result.failed++;
				}
				if (index % 50 === 0) progress(index, rows.length, "Deleting files");
			}
			let version = 0;
			for (let i = 0; i < gone.length; i += 400) {
				version = db().transaction((tx) => {
					const v = bumpVersion(tx);
					tx.delete(files)
						.where(inArray(files.id, gone.slice(i, i + 400)))
						.run();
					return v;
				});
			}
			// A track with no file left is gone from the library for good.
			const orphans = [...trackIds].filter(
				(id) =>
					!db()
						.select({ id: files.id })
						.from(files)
						.where(eq(files.trackId, id))
						.limit(1)
						.get(),
			);
			for (let i = 0; i < orphans.length; i += 400) {
				version = db().transaction((tx) => {
					const v = bumpVersion(tx);
					const gone = orphans.slice(i, i + 400);
					// A device reading changes since a version learns of the removal here.
					tx.insert(trackTombstones)
						.values(
							gone.map((trackId) => ({ trackId, version: v, at: new Date() })),
						)
						.onConflictDoUpdate({
							target: trackTombstones.trackId,
							set: { version: v },
						})
						.run();
					tx.delete(tracks).where(inArray(tracks.id, gone)).run();
					return v;
				});
			}
			if (version > 0) notifyChanged([], version, true);
			await removeEmptyFolders(
				root,
				rows.map((row) => row.path),
			);
			// Inbox files the owner rejected age out with the rest.
			if (!payload.fileIds)
				result.deleted += await purgeRejected(root, payload.olderThanDays);
			progress(rows.length, rows.length, `${result.deleted} deleted`);
			return result;
		} finally {
			release();
		}
	},
});
