import { isLossless } from "@trackvault/core/dedupe";
import { ISSUE } from "@trackvault/core/issues";
import { safeJoin } from "@trackvault/core/paths";
import { checkBitrate, ffmpegAvailable } from "@trackvault/core/quality";
import {
	type HealthWrite,
	healthCandidates,
	writeHealth,
} from "../lib/health.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";

export interface BitratePayload {
	trackIds?: string[];
}

export interface BitrateResult {
	checked: number;
	fake: number;
	suspect: number;
	skipped?: string;
}

const GROUP = 50;

// Measures where each file's audio ends (ffmpeg, a few seconds from three places)
// and compares it with the lowpass of the bitrate the file claims: a 320 that ends
// where a 128 does is flagged as a fake bitrate.
export default defineJob<BitratePayload, BitrateResult>({
	kind: "bitrate",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		if (!(await ffmpegAvailable())) {
			progress(0, 0, "Needs ffmpeg on the hub's PATH");
			return { checked: 0, fake: 0, suspect: 0, skipped: "needs ffmpeg" };
		}
		const todo = healthCandidates("bitrate_verdict", payload.trackIds);
		const result: BitrateResult = { checked: 0, fake: 0, suspect: 0 };
		let pending: HealthWrite[] = [];
		let next = 0;
		progress(0, todo.length, "Measuring spectra");
		const worker = async (): Promise<void> => {
			for (;;) {
				signal.throwIfAborted();
				const item = todo[next++];
				if (!item) return;
				try {
					const verdict = await checkBitrate(safeJoin(root, item.path), {
						claimedKbps: item.bitrate ?? 0,
						lossless: isLossless(item.format),
						sampleRate: item.sampleRate ?? undefined,
						durationSec: item.durationMs ? item.durationMs / 1000 : undefined,
					});
					const fake = verdict.verdict === "fake";
					pending.push({
						id: item.id,
						fileHash: item.fileHash,
						set: fake ? ISSUE.fakeBitrate : 0,
						clear: fake ? 0 : ISSUE.fakeBitrate,
						cutoffHz: verdict.cutoffHz ? Math.round(verdict.cutoffHz) : null,
						bitrateVerdict: verdict.verdict,
						bitrateNote: verdict.explanation,
					});
					if (fake) result.fake++;
					if (verdict.verdict === "suspect") result.suspect++;
				} catch {
					// A file ffmpeg cannot read is the integrity check's to flag.
				}
				result.checked++;
				if (pending.length >= GROUP) {
					const group = pending;
					pending = [];
					writeHealth(group);
				}
				progress(result.checked, todo.length, "Measuring spectra");
			}
		};
		try {
			await Promise.all([worker(), worker()]);
		} finally {
			writeHealth(pending);
		}
		progress(
			result.checked,
			todo.length,
			`${result.checked} measured, ${result.fake} fake`,
		);
		return result;
	},
});
