import { applyPatches, flushTagWrites } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { statement } from "../lib/raw.ts";
import { eachTrack } from "../lib/selection.ts";
import type { TagKey, TagValues } from "../lib/track-fields.ts";

export interface AutotagApplyResult {
	tracks: number;
	fields: number;
	stale: number;
	written: number;
	failed: number;
}

interface Accepted {
	id: number;
	trackId: string;
	field: TagKey;
	before: string | null;
	after: string;
}

// Applies every accepted proposal as one batch (origin "autotag") and writes the
// tags to the files. A proposal applies only while the field still holds what the
// provider was compared with; a field changed since goes stale. A field already at
// the proposed value counts as applied, so a run resumed after a stop finishes.
export default defineJob<Record<string, never>, AutotagApplyResult>({
	kind: "autotag-apply",
	concurrency: 1,
	async run({ id, signal, progress }) {
		const accepted = statement(
			"SELECT id, track_id AS trackId, field, before, after FROM proposals WHERE state = 'accepted' ORDER BY track_id, id",
		).all() as Accepted[];
		const byTrack = new Map<string, Accepted[]>();
		for (const row of accepted)
			byTrack.set(row.trackId, [...(byTrack.get(row.trackId) ?? []), row]);
		const entries: Array<{ id: string; patch: TagValues }> = [];
		const applied: number[] = [];
		const stale: number[] = [];
		const text = (v: unknown): string | null =>
			v === null || v === undefined || v === "" ? null : String(v);
		for (const row of eachTrack([...byTrack.keys()])) {
			const patch: TagValues = {};
			for (const proposal of byTrack.get(row.id) ?? []) {
				const now = text(row[proposal.field]);
				if (now === proposal.after) applied.push(proposal.id);
				else if (now === proposal.before) {
					patch[proposal.field] = proposal.after;
					applied.push(proposal.id);
				} else stale.push(proposal.id);
			}
			if (Object.keys(patch).length > 0) entries.push({ id: row.id, patch });
		}
		progress(0, entries.length, "Applying tags");
		const result = applyPatches(
			entries,
			{ batchId: id, origin: "autotag", label: "Auto-tag" },
			{
				signal,
				progress: (done) => progress(done, entries.length, "Applying tags"),
			},
		);
		const written = await flushTagWrites(id, {
			signal,
			progress: (done, of, message) => progress(done, of, message),
		});
		const mark = (ids: number[], state: string): void => {
			db().transaction(() => {
				for (const proposal of ids)
					statement("UPDATE proposals SET state = @s WHERE id = @id").run({
						s: state,
						id: proposal,
					});
			});
		};
		mark(applied, "applied");
		mark(stale, "stale");
		return {
			tracks: result.tracks,
			fields: result.fields,
			stale: stale.length,
			written: written.written,
			failed: written.failed,
		};
	},
});
