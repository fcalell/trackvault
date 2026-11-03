import { resolveName } from "@trackvault/core/taxonomy";
import { applyPatches, flushTagWrites, openBatch } from "../lib/changes.ts";
import { defineJob } from "../lib/job.ts";
import { PreviewWriter, text } from "../lib/previews.ts";
import {
	allTrackIds,
	eachTrack,
	labelOf,
	type Selection,
	selectedIds,
} from "../lib/selection.ts";
import { loadTaxonomies } from "../lib/taxonomy.ts";
import type { TagValues } from "../lib/track-fields.ts";

export type UnifyField = "genre" | "artist" | "label";

export interface UnifyPayload {
	mode: "preview" | "apply";
	fields: UnifyField[];
	tracks?: Selection;
}

export interface UnifyResult {
	mode: "preview" | "apply";
	tracks: number;
	fields: number;
	scanned: number;
	written?: number;
	failed?: number;
}

// Rewrites genre, artist and label to the canonical spelling the taxonomy knows
// (an alias, or for genres a close spelling), library-wide or over a selection.
export default defineJob<UnifyPayload, UnifyResult>({
	kind: "unify",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const taxonomies = loadTaxonomies();
		const ids = payload.tracks ? selectedIds(payload.tracks) : allTrackIds();
		const total = ids.length;
		const result: UnifyResult = {
			mode: payload.mode,
			tracks: 0,
			fields: 0,
			scanned: 0,
		};
		const writer =
			payload.mode === "preview"
				? new PreviewWriter(id, "unify", payload.fields)
				: undefined;
		progress(0, total, "Reading tracks");

		function* patches(): Generator<{ id: string; patch: TagValues }> {
			for (const row of eachTrack(ids)) {
				signal.throwIfAborted();
				result.scanned++;
				if (result.scanned % 1000 === 0)
					progress(result.scanned, total, "Reading tracks");
				const patch: TagValues = {};
				for (const field of payload.fields) {
					const value = row[field];
					if (!value) continue;
					const resolved = resolveName(value, taxonomies[field], {
						fuzzy: field === "genre",
					});
					if (resolved.name !== null && resolved.name !== value) {
						patch[field] = resolved.name;
						writer?.add({
							trackId: row.id,
							label: labelOf(row),
							field,
							before: text(value),
							after: resolved.name,
						});
					}
				}
				const fieldCount = Object.keys(patch).length;
				if (fieldCount === 0) continue;
				result.tracks++;
				result.fields += fieldCount;
				if (!writer) yield { id: row.id, patch };
			}
		}

		if (writer) {
			Array.from(patches());
			writer.flush();
			progress(total, total, `${result.tracks} tracks would change`);
			return result;
		}
		const info = {
			batchId: id,
			origin: "rule" as const,
			label: "Tidy spellings",
		};
		openBatch(info);
		const applied = applyPatches(patches(), info, { signal });
		result.tracks = applied.tracks;
		result.fields = applied.fields;
		const written = await flushTagWrites(id, {
			signal,
			progress: (done, of, message) => progress(done, of, message),
		});
		result.written = written.written;
		result.failed = written.failed;
		progress(total, total, `${applied.tracks} tracks unified`);
		return result;
	},
});
