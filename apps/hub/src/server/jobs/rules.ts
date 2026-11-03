import { applyRules, compileRules } from "@trackvault/core/rules";
import { applyPatches, flushTagWrites } from "../lib/changes.ts";
import { defineJob } from "../lib/job.ts";
import { PreviewWriter, text } from "../lib/previews.ts";
import { activeRules, patchOf, ruleTrack } from "../lib/rules.ts";
import {
	allTrackIds,
	eachTrack,
	labelOf,
	type Selection,
	selectedIds,
} from "../lib/selection.ts";
import { loadTaxonomies } from "../lib/taxonomy.ts";
import type { TagValues } from "../lib/track-fields.ts";

export interface RulesPayload {
	mode: "preview" | "apply";
	// The tracks to run over; absent is the whole library.
	tracks?: Selection;
	// The rules to run; absent is every enabled one, in order.
	ruleIds?: string[];
}

export interface RulesResult {
	mode: "preview" | "apply";
	tracks: number;
	fields: number;
	scanned: number;
	rules: number;
	written?: number;
	failed?: number;
}

// Runs the cleanup rules over a selection or the library: `preview` stores what
// would change (for the screen to page through), `apply` writes it, recorded
// under the job's id like any edit and put into the files.
export default defineJob<RulesPayload, RulesResult>({
	kind: "rules",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const rules = activeRules(payload.ruleIds);
		if (rules.length === 0 && payload.mode === "apply")
			throw new Error("No cleanup rule is switched on. Enable one first.");
		const compiled = compileRules(rules);
		const context = { taxonomies: loadTaxonomies() };
		// A preview with no rule on reads nothing: it says so.
		const ids =
			rules.length === 0
				? []
				: payload.tracks
					? selectedIds(payload.tracks)
					: allTrackIds();
		const total = ids.length;
		const result: RulesResult = {
			mode: payload.mode,
			tracks: 0,
			fields: 0,
			scanned: 0,
			rules: rules.length,
		};
		progress(0, total, "Reading tracks");

		function* patches(): Generator<{ id: string; patch: TagValues }> {
			for (const row of eachTrack(ids)) {
				signal.throwIfAborted();
				result.scanned++;
				const { patch, changes } = applyRules(
					ruleTrack(row),
					compiled,
					context,
				);
				if (changes.length === 0) continue;
				if (payload.mode === "preview") {
					result.tracks++;
					for (const change of changes) {
						if (change.field === "featured") continue;
						result.fields++;
						writer?.add({
							trackId: row.id,
							label: labelOf(row),
							field: change.field,
							before: text(change.before),
							after: text(change.after),
						});
					}
					continue;
				}
				yield { id: row.id, patch: patchOf(patch) };
			}
		}

		const writer =
			payload.mode === "preview" ? new PreviewWriter(id, "rules") : undefined;
		if (writer) {
			// Nothing is yielded in a preview: the run itself fills the writer.
			Array.from(patches());
			writer.flush();
			progress(total, total, `${result.tracks} tracks would change`);
			return result;
		}
		const applied = applyPatches(
			patches(),
			{ batchId: id, origin: "rule", label: "Cleanup rules" },
			{
				signal,
				progress: (handled) => progress(handled, total, "Applying rules"),
			},
		);
		result.tracks = applied.tracks;
		result.fields = applied.fields;
		const written = await flushTagWrites(id, {
			signal,
			progress: (done, of, message) => progress(done, of, message),
		});
		result.written = written.written;
		result.failed = written.failed;
		progress(total, total, `${applied.tracks} tracks cleaned`);
		return result;
	},
});
