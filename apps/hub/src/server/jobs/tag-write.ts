import { stat } from "node:fs/promises";
import { and, eq } from "@fcalell/plugin-db/orm";
import { safeJoin } from "@trackvault/core/paths";
import { type TagPatch, writeTags } from "@trackvault/core/tags";
import { files } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";

export interface TagWritePayload {
	items: Array<{ trackId: string; patch: TagPatch }>;
}

export interface TagWriteResult {
	written: number;
	failed: number;
	errors: string[];
}

// Writes tag edits made in the library into the files of the tracks. The patch
// travels with the job, so a repeat after a restart writes the same values; the
// file's new size, mtime and inode are recorded so the scanner does not read it
// back as a change.
export default defineJob<TagWritePayload, TagWriteResult>({
	kind: "tag-write",
	concurrency: 2,
	async run({ payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const result: TagWriteResult = { written: 0, failed: 0, errors: [] };
		const total = payload.items.length;
		const database = db();

		for (const [index, item] of payload.items.entries()) {
			signal.throwIfAborted();
			const rows = database
				.select({ id: files.id, path: files.path })
				.from(files)
				.where(and(eq(files.trackId, item.trackId), eq(files.state, "ok")))
				.all();
			if (rows.length === 0) {
				result.failed++;
				result.errors.push(`${item.trackId}: no file on disk`);
			}
			for (const row of rows) {
				try {
					const absolute = safeJoin(root, row.path);
					await writeTags(absolute, item.patch);
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
					if (result.errors.length < 20) {
						result.errors.push(
							`${row.path}: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
			}
			progress(index + 1, total, "Writing tags");
		}
		progress(
			total,
			total,
			result.failed > 0
				? `${result.written} written, ${result.failed} failed`
				: `${result.written} written`,
		);
		if (result.written === 0 && result.failed > 0)
			throw new Error(result.errors[0] ?? "No tags were written");
		return result;
	},
});
