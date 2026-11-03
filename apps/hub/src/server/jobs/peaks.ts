import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { eq, min } from "@fcalell/plugin-db/orm";
import { safeJoin } from "@trackvault/core/paths";
import { files } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { computePeaks, hasFfmpeg, hasPeaks, peaksPath } from "../lib/peaks.ts";
import { readSettings } from "../lib/settings.ts";

export interface PeaksPayload {
	// Only these tracks; absent makes the peaks of every track that has none.
	trackIds?: string[];
}

export interface PeaksResult {
	made: number;
	failed: number;
	skipped?: string;
}

// Waveform peaks for the tracks without them, one small file each. Low priority:
// one at a time, ffmpeg at `nice` 19, queued after a scan found new tracks. Safe
// to repeat: a track with a file is passed over.
export default defineJob<PeaksPayload, PeaksResult>({
	kind: "peaks",
	concurrency: 1,
	maxAttempts: 5,
	async run({ payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		if (!hasFfmpeg()) {
			progress(0, 0, "Waveforms need ffmpeg on the hub's PATH");
			return { made: 0, failed: 0, skipped: "ffmpeg is not installed" };
		}
		const result: PeaksResult = { made: 0, failed: 0 };
		const wanted = payload.trackIds ? new Set(payload.trackIds) : undefined;
		// Tracks a scan adds while this runs are picked up by the next round.
		const tried = new Set<string>();
		for (;;) {
			// The first file of each track that is on disk.
			const rows = db()
				.select({ trackId: files.trackId, path: min(files.path) })
				.from(files)
				.where(eq(files.state, "ok"))
				.groupBy(files.trackId)
				.all();
			const todo = rows.filter(
				(row) =>
					row.trackId !== null &&
					row.path !== null &&
					!tried.has(row.trackId) &&
					(!wanted || wanted.has(row.trackId)) &&
					!hasPeaks(row.trackId),
			);
			if (todo.length === 0) break;
			const base = tried.size;
			progress(base, base + todo.length, "Drawing waveforms");
			for (const [index, row] of todo.entries()) {
				signal.throwIfAborted();
				const id = row.trackId as string;
				tried.add(id);
				const target = peaksPath(id);
				try {
					const peaks = await computePeaks(
						safeJoin(root, row.path as string),
						signal,
					);
					await mkdir(dirname(target), { recursive: true });
					// Written whole, then moved into place: a reader never sees half a file.
					await writeFile(`${target}.tmp`, peaks);
					await rename(`${target}.tmp`, target);
					result.made++;
				} catch (error) {
					if (signal.aborted) throw error;
					result.failed++;
				}
				progress(base + index + 1);
			}
		}
		progress(
			tried.size,
			tried.size,
			result.failed > 0
				? `${result.made} drawn, ${result.failed} unreadable`
				: `${result.made} drawn`,
		);
		return result;
	},
});
