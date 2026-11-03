import { applyPatches, flushTagWrites, openBatch } from "../lib/changes.ts";
import { defineJob } from "../lib/job.ts";
import { type Selection, selectedIds } from "../lib/selection.ts";
import type { TagValues } from "../lib/track-fields.ts";
import { applyTagSets } from "../lib/track-tags.ts";

export interface EditPayload {
	tracks: Selection;
	patch: TagValues;
	addTags: number[];
	removeTags: number[];
}

export interface EditResult {
	tracks: number;
	fields: number;
	written: number;
	failed: number;
	errors: string[];
}

// One edit over a selection: the values go into the database in chunks (each field
// recorded in `changes` under this job's id), then into the files. The batch's
// own rows decide what the files get, so a run resumed after a stop finishes it.
export default defineJob<EditPayload, EditResult>({
	kind: "edit",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const ids = selectedIds(payload.tracks);
		const total = ids.length;
		progress(0, total, "Editing tags");
		const info = { batchId: id, origin: "ui" as const, label: "Edit tags" };
		openBatch(info);
		const applied = applyPatches(
			ids.map((trackId) => ({ id: trackId, patch: payload.patch })),
			info,
			{
				signal,
				progress: (handled) => progress(handled, total, "Editing tags"),
				after: (tx, chunk, _version, now) =>
					applyTagSets(
						tx,
						chunk,
						payload.addTags,
						payload.removeTags,
						info,
						now,
					),
			},
		);
		const written = await flushTagWrites(id, {
			signal,
			progress: (done, of, message) => progress(done, of, message),
		});
		progress(
			applied.tracks,
			applied.tracks,
			`${applied.tracks} tracks edited${written.failed > 0 ? `, ${written.failed} files not written` : ""}`,
		);
		return {
			tracks: applied.tracks,
			fields: applied.fields,
			written: written.written,
			failed: written.failed,
			errors: written.errors,
		};
	},
});
