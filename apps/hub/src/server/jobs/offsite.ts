import { offsiteObjects } from "../../schema/index.ts";
import { listLocal } from "../lib/backup/files.ts";
import { backupDirOf } from "../lib/backup/make.ts";
import {
	connect,
	libraryRows,
	objectKeyOf,
	offsiteConfigured,
	pruneRemote,
	rk,
	syncLibrary,
	uploadBackup,
	writeManifest,
} from "../lib/backup/offsite.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";

export interface OffsitePayload {
	// Send the database backups not yet offsite (and trim the remote ones).
	database: boolean;
	// Send the audio files that changed since the last sync.
	library: boolean;
}

export interface OffsiteResult {
	databases: number;
	uploaded: number;
	skipped: number;
	failed: number;
	bytes: number;
	pruned: number;
	manifest: number | null;
}

// Offsite storage: the database backups first (small, what a restore starts from),
// then the library's files, then the manifest that lists what is there. Every part
// is safe to repeat: a stopped sync continues its multipart upload and passes over
// what the bucket already holds.
export default defineJob<OffsitePayload, OffsiteResult>({
	kind: "offsite",
	concurrency: 1,
	maxAttempts: 5,
	async run({ payload, signal, progress }) {
		let settings = readSettings();
		if (!offsiteConfigured(settings))
			throw new Error("Offsite storage is not set up");
		const remote = connect(settings);
		const result: OffsiteResult = {
			databases: 0,
			uploaded: 0,
			skipped: 0,
			failed: 0,
			bytes: 0,
			pruned: 0,
			manifest: null,
		};
		if (payload.database) {
			progress(0, 0, "Sending database backups");
			const local = listLocal(backupDirOf(settings));
			for (const [index, backup] of local.entries()) {
				signal.throwIfAborted();
				progress(index, local.length, `Sending ${backup.name}`);
				if (await uploadBackup(remote, backup, signal)) result.databases++;
			}
			if (settings.offsitePrune)
				result.pruned = await pruneRemote(remote, settings, signal);
		}
		if (payload.library) {
			const root = settings.libraryRoot;
			if (!root) throw new Error("The library folder is not set");
			progress(0, 0, "Comparing the library with the bucket");
			const synced = await syncLibrary(remote, {
				root,
				signal,
				progress,
				refreshLimit: () => {
					settings = readSettings();
					remote.limiter.setRate(settings.offsiteBandwidthKbps * 1024);
				},
			});
			result.uploaded = synced.uploaded;
			result.skipped = synced.skipped;
			result.failed = synced.failed;
			result.bytes = synced.bytes;
			progress(0, 0, "Writing the manifest");
			result.manifest = await writeManifest(remote, synced.present, signal);
			if (synced.failed > 0) {
				progress(
					1,
					1,
					`${synced.uploaded} sent, ${synced.failed} failed: ${synced.firstError}`,
				);
				return result;
			}
		} else if (payload.database) {
			// A database-only run keeps the manifest's list of backups current.
			result.manifest = await refreshManifestBackups(remote, signal);
		}
		progress(
			1,
			1,
			payload.library
				? `${result.uploaded} files sent, ${result.skipped} already there, ${result.databases} backups`
				: `${result.databases} backups sent`,
		);
		return result;
	},
});

// Without a library pass the manifest still gains the new backups: the files it
// lists are what the tables say are in the bucket.
async function refreshManifestBackups(
	remote: ReturnType<typeof connect>,
	signal: AbortSignal,
): Promise<number> {
	const have = new Map(
		db()
			.select()
			.from(offsiteObjects)
			.all()
			.map((row) => [row.key, row.fileHash] as const),
	);
	const present = libraryRows().filter(
		(row) => have.get(rk(remote, objectKeyOf(row))) === row.fileHash,
	);
	return writeManifest(remote, present, signal);
}
