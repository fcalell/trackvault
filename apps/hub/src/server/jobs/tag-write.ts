import type { TagPatch } from "@trackvault/core/tags";
import { type WriteResult, writeTrackFiles } from "../lib/changes.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";

export interface TagWritePayload {
	items: Array<{ trackId: string; patch: TagPatch }>;
}

export type TagWriteResult = WriteResult;

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
		for (const [index, item] of payload.items.entries()) {
			signal.throwIfAborted();
			await writeTrackFiles(root, item.trackId, item.patch, result);
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
