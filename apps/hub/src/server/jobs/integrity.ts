import { ISSUE } from "@trackvault/core/issues";
import { safeJoin } from "@trackvault/core/paths";
import { checkIntegrity, ffmpegAvailable } from "@trackvault/core/quality";
import {
	type HealthWrite,
	healthCandidates,
	writeHealth,
} from "../lib/health.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";

export interface IntegrityPayload {
	trackIds?: string[];
}

export interface IntegrityResult {
	checked: number;
	corrupt: number;
	warnings: number;
	skipped?: string;
}

const GROUP = 50;

// Decodes each file to its end with ffmpeg; one that fails carries the corrupt flag.
// Only files not yet checked (or changed since) are looked at, two at a time.
export default defineJob<IntegrityPayload, IntegrityResult>({
	kind: "integrity",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		if (!(await ffmpegAvailable())) {
			progress(0, 0, "Needs ffmpeg on the hub's PATH");
			return { checked: 0, corrupt: 0, warnings: 0, skipped: "needs ffmpeg" };
		}
		const todo = healthCandidates("integrity", payload.trackIds);
		const result: IntegrityResult = { checked: 0, corrupt: 0, warnings: 0 };
		let pending: HealthWrite[] = [];
		let next = 0;
		progress(0, todo.length, "Decoding files");
		const worker = async (): Promise<void> => {
			for (;;) {
				signal.throwIfAborted();
				const item = todo[next++];
				if (!item) return;
				const check = await checkIntegrity(safeJoin(root, item.path));
				if (check.status === "unavailable") continue;
				const bad = check.status === "corrupt";
				pending.push({
					id: item.id,
					fileHash: item.fileHash,
					set: bad ? ISSUE.corrupt : 0,
					clear: bad ? 0 : ISSUE.corrupt,
					integrity: check.status,
					integrityErrors: check.errors,
				});
				result.checked++;
				if (bad) result.corrupt++;
				if (check.status === "warnings") result.warnings++;
				if (pending.length >= GROUP) {
					const group = pending;
					pending = [];
					writeHealth(group);
				}
				progress(result.checked, todo.length, "Decoding files");
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
			`${result.checked} checked, ${result.corrupt} corrupt`,
		);
		return result;
	},
});
