import { flushTagWrites } from "../lib/changes.ts";
import { defineJob } from "../lib/job.ts";

export interface TagFlushPayload {
	batchId: string;
}

// Puts the tag fields a batch changed into the files: what an import from Rekordbox
// merged into the library reaches the replica's source files here, not in the request.
export default defineJob<TagFlushPayload, { written: number; failed: number }>({
	kind: "tag-flush",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const result = await flushTagWrites(payload.batchId, {
			signal,
			progress: (done, total, message) => progress(done, total, message),
		});
		progress(result.written, result.written, `${result.written} files written`);
		return { written: result.written, failed: result.failed };
	},
});
