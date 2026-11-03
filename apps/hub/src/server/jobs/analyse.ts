import { analyseTrack } from "@trackvault/core/analysis";
import { ISSUE } from "@trackvault/core/issues";
import { safeJoin } from "@trackvault/core/paths";
import { windowSecOf } from "../../shared/intelligence.ts";
import { niceFfmpeg } from "../lib/analysis.ts";
import { applyPatches, flushTagWrites } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { hasFfmpeg } from "../lib/peaks.ts";
import { statement } from "../lib/raw.ts";
import {
	eachTrack,
	primaryFiles,
	type Selection,
	selectedIds,
} from "../lib/selection.ts";
import { readSettings } from "../lib/settings.ts";
import type { TagValues } from "../lib/track-fields.ts";
import { bumpVersion, notifyChanged } from "../services/library.ts";

export interface AnalysePayload {
	// Absent: every track lacking BPM, key, energy or loudness that was never analysed.
	tracks?: Selection;
	// Measure again, and replace the stored numbers.
	force?: boolean;
}

export interface AnalyseResult {
	analysed: number;
	filled: number;
	failed: number;
	skipped?: string;
}

type Part = "bpm" | "key" | "energy" | "loudness";

const FLUSH_EVERY = 50;

// BPM, key, energy and loudness for the tracks that lack them, one track at a time at
// the lowest CPU priority. Every result is stored (with how sure it is) the moment it
// is measured, so a stop loses nothing and a run repeated skips what is done. Empty
// BPM, key and energy tags are filled above the settings' confidence; a tag that has a
// value is never replaced, and a track Rekordbox analysed (it sent its ANLZ files) is
// left to Rekordbox.
export default defineJob<AnalysePayload, AnalyseResult>({
	kind: "analyse",
	concurrency: 1,
	maxAttempts: 10,
	async run({ id, payload, signal, progress }) {
		const settings = readSettings();
		const root = settings.libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		if (!hasFfmpeg()) {
			const skipped = "Analysis needs ffmpeg on the hub's PATH";
			progress(0, 0, skipped);
			return { analysed: 0, filled: 0, failed: 0, skipped };
		}
		const ffmpegPath = await niceFfmpeg();
		const wanted = settings.analyseFillConfidence / 100;
		const windowSec = windowSecOf(settings.analyseWindow);
		const ids = payload.tracks
			? selectedIds(payload.tracks)
			: (
					statement(
						`SELECT t.id FROM tracks t
						 WHERE (t.issues & ${ISSUE.quarantined}) = 0 AND (t.issues & ${ISSUE.missingFile | ISSUE.undecodable}) = 0
						 AND ${payload.force ? "1" : "(t.bpm IS NULL OR t.key IS NULL OR t.energy IS NULL OR t.loudness IS NULL) AND NOT EXISTS (SELECT 1 FROM analysis_results a WHERE a.track_id = t.id)"}
						 ORDER BY t.seq`,
					).all() as Array<{ id: string }>
				).map((row) => row.id);
		const files = primaryFiles(ids);
		const result: AnalyseResult = { analysed: 0, filled: 0, failed: 0 };
		const total = ids.length;
		progress(0, total, "Analysing");

		let patches: Array<{ id: string; patch: TagValues }> = [];
		let loudness: Array<{ id: string; lufs: number }> = [];
		const flush = (): void => {
			if (loudness.length > 0) {
				const group = loudness;
				loudness = [];
				let version = 0;
				db().transaction((tx) => {
					version = bumpVersion(tx);
					const update = statement(
						"UPDATE tracks SET loudness = @l, version = @v, updated_at = @now WHERE id = @id",
					);
					for (const item of group)
						update.run({
							l: item.lufs,
							v: version,
							now: Date.now(),
							id: item.id,
						});
				});
				notifyChanged(
					group.map((item) => item.id),
					version,
				);
			}
			if (patches.length > 0) {
				const group = patches;
				patches = [];
				const applied = applyPatches(group, {
					batchId: id,
					origin: "analysis",
					label: "Analysis",
				});
				result.filled += applied.fields;
			}
		};

		let handled = 0;
		for (const row of eachTrack(ids)) {
			signal.throwIfAborted();
			handled++;
			const file = files.get(row.id);
			if (!file) continue;
			const only: Part[] = payload.force
				? ["bpm", "key", "energy", "loudness"]
				: [
						...(row.bpm === null ? (["bpm"] as const) : []),
						...(row.key === null ? (["key"] as const) : []),
						...(row.energy === null ? (["energy"] as const) : []),
						...(row.loudness === null ? (["loudness"] as const) : []),
					];
			if (only.length === 0) continue;
			const found = await analyseTrack(safeJoin(root, file.path), {
				ffmpegPath,
				only,
				windowSec,
				...(row.durationMs ? { durationSec: row.durationMs / 1000 } : {}),
			});
			signal.throwIfAborted();
			const note =
				only
					.filter((part) => found[part].value === null)
					.map((part) => `${part}: ${found[part].reason ?? "none"}`)
					.join(", ") || null;
			if (only.every((part) => found[part].value === null)) result.failed++;
			else result.analysed++;
			const bpm =
				found.bpm.value === null ? null : Math.round(found.bpm.value * 10) / 10;
			statement(
				`INSERT INTO analysis_results (track_id, bpm, bpm_confidence, key, key_confidence, energy, energy_confidence,
					lufs, loudness_range, true_peak_db, note, file_hash, analysed_at)
				 VALUES (@t, @bpm, @bpmc, @key, @keyc, @energy, @energyc, @lufs, @lra, @peak, @note, @hash, @at)
				 ON CONFLICT (track_id) DO UPDATE SET
					bpm = COALESCE(excluded.bpm, bpm), bpm_confidence = COALESCE(excluded.bpm_confidence, bpm_confidence),
					key = COALESCE(excluded.key, key), key_confidence = COALESCE(excluded.key_confidence, key_confidence),
					energy = COALESCE(excluded.energy, energy), energy_confidence = COALESCE(excluded.energy_confidence, energy_confidence),
					lufs = COALESCE(excluded.lufs, lufs), loudness_range = COALESCE(excluded.loudness_range, loudness_range),
					true_peak_db = COALESCE(excluded.true_peak_db, true_peak_db),
					note = excluded.note, file_hash = excluded.file_hash, analysed_at = excluded.analysed_at`,
			).run({
				t: row.id,
				bpm,
				bpmc: found.bpm.value === null ? null : found.bpm.confidence,
				key: found.key.value?.camelot ?? null,
				keyc: found.key.value ? found.key.confidence : null,
				energy:
					found.energy.value === null ? null : Math.round(found.energy.value),
				energyc: found.energy.value === null ? null : found.energy.confidence,
				lufs: found.loudness.value?.integratedLufs ?? null,
				lra: found.loudness.value?.lra ?? null,
				peak:
					found.loudness.value &&
					Number.isFinite(found.loudness.value.truePeakDb)
						? found.loudness.value.truePeakDb
						: null,
				note,
				hash: null,
				at: Date.now(),
			});
			if (found.loudness.value)
				loudness.push({
					id: row.id,
					lufs: found.loudness.value.integratedLufs,
				});

			// Tags: empty ones only, above the confidence, never on Rekordbox's tracks.
			const rekordbox = statement(
				"SELECT 1 AS x FROM track_analysis WHERE track_id = @t LIMIT 1",
			).get({ t: row.id });
			if (!rekordbox) {
				const patch: TagValues = {};
				if (row.bpm === null && bpm !== null && found.bpm.confidence >= wanted)
					patch.bpm = bpm;
				if (
					row.key === null &&
					found.key.value &&
					found.key.confidence >= wanted
				)
					patch.key = found.key.value.camelot;
				if (
					row.energy === null &&
					found.energy.value !== null &&
					found.energy.confidence >= wanted
				)
					patch.energy = Math.round(found.energy.value);
				if (Object.keys(patch).length > 0) patches.push({ id: row.id, patch });
			}
			if (patches.length + loudness.length >= FLUSH_EVERY) flush();
			progress(handled, total, "Analysing");
		}
		flush();
		const written = await flushTagWrites(id, {
			signal,
			progress: (done, of, message) => progress(done, of, message),
		}).catch(() => null);
		progress(
			total,
			total,
			`${result.analysed} analysed${result.failed > 0 ? `, ${result.failed} not measurable` : ""}${written && written.failed > 0 ? `, ${written.failed} files not written` : ""}`,
		);
		return result;
	},
});
