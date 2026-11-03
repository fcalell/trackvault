import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	checkDatabase,
	decompressFile,
	listLocal,
	sha256File,
	writeMeta,
} from "../lib/backup/files.ts";
import { backupDirOf } from "../lib/backup/make.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";

export interface BackupVerifyPayload {
	name: string;
}

export interface BackupVerifyResult {
	ok: boolean;
	problem: string | null;
}

// Opens a stored backup again: the file still hashes as it did, unpacks, and the
// database in it passes integrity_check with its tables in place. Catches a disk
// that rotted since the backup was taken. Safe to repeat.
export default defineJob<BackupVerifyPayload, BackupVerifyResult>({
	kind: "backup-verify",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const dir = backupDirOf(readSettings());
		const backup = listLocal(dir).find((item) => item.name === payload.name);
		if (!backup) throw new Error("That backup is no longer in the folder");
		const scratch = join(dir, `.verify-${backup.name}.raw`);
		let problem: string | null = null;
		try {
			progress(0, 3, "Reading the file");
			const stored = await sha256File(backup.path);
			if (backup.meta && stored !== backup.meta.sha256)
				problem = "The file no longer matches the checksum it was written with";
			else {
				mkdirSync(dir, { recursive: true });
				progress(1, 3, "Unpacking");
				const raw = await decompressFile(
					backup.path,
					scratch,
					backup.compression,
					signal,
				);
				if (backup.meta && raw !== backup.meta.rawSha256)
					problem =
						"The unpacked database differs from the one that was backed up";
				else {
					progress(2, 3, "Checking the database");
					const check = checkDatabase(scratch);
					if (check.integrity !== "ok")
						problem = `integrity_check: ${check.integrity}`;
					else if (check.problems.length > 0)
						problem = check.problems.join("; ");
					else if (backup.meta) {
						backup.meta.rows = check.rows;
						backup.meta.tables = check.tables;
						backup.meta.integrity = check.integrity;
					}
				}
			}
		} finally {
			rmSync(scratch, { force: true });
		}
		if (backup.meta) {
			writeMeta(backup.path, {
				...backup.meta,
				verified: problem === null,
				verifiedAt: new Date().toISOString(),
			});
		}
		progress(3, 3, problem ?? "The backup opens and checks out");
		if (problem) throw new Error(problem);
		return { ok: true, problem: null };
	},
});
