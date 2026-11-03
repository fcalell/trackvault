import { makeBackup, pruneLocal } from "../lib/backup/make.ts";
import { offsiteConfigured } from "../lib/backup/offsite.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";
import { enqueue } from "../services/jobs.ts";
import offsite from "./offsite.ts";

export interface BackupPayload {
	kind: "auto" | "manual";
}

export interface BackupResult {
	name: string;
	size: number;
	rawSize: number;
	rows: Record<string, number>;
	pruned: string[];
}

// A database backup: SQLite's online backup while the hub runs, checked, packed and
// proved, then the old ones the keep policy lets go of are removed and, with offsite
// storage on, the upload is queued. Safe to run twice: each run is a new file.
export default defineJob<BackupPayload, BackupResult>({
	kind: "backup",
	concurrency: 1,
	maxAttempts: 2,
	async run({ payload, signal, progress }) {
		const settings = readSettings();
		const meta = await makeBackup(settings, {
			kind: payload.kind,
			signal,
			progress,
		});
		const pruned = pruneLocal(settings);
		progress(1, 1, `Backed up ${Math.round(meta.size / 1e6)} MB`);
		if (settings.offsiteEnabled && offsiteConfigured(settings)) {
			enqueue(
				offsite,
				{
					database: settings.offsiteDatabases,
					library: settings.offsiteLibrary,
				},
				{ reuse: () => true },
			);
		}
		return {
			name: meta.name,
			size: meta.size,
			rawSize: meta.rawSize,
			rows: meta.rows,
			pruned,
		};
	},
});
