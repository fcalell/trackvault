import { mkdirSync, rmSync, statfsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	backupName,
	expired,
	type RetentionPolicy,
} from "@trackvault/core/backup";
import { db } from "../db.ts";
import type { SettingsRow } from "../settings.ts";
import {
	type BackupMeta,
	checkDatabase,
	compressFile,
	defaultBackupDir,
	hashUnpacked,
	listLocal,
	removeBackup,
	settleJournal,
	writeMeta,
} from "./files.ts";

// better-sqlite3's connection behind the drizzle handle: its online backup copies
// the database page by page while the hub keeps reading and writing it.
interface BackupApi {
	backup(
		destination: string,
		options?: {
			progress?: (info: {
				totalPages: number;
				remainingPages: number;
			}) => number;
		},
	): Promise<unknown>;
}
const connection = (): BackupApi =>
	(db() as unknown as { $client: BackupApi }).$client;

export function backupDirOf(settings: SettingsRow): string {
	const file = process.env.DB_FILE;
	if (!file) throw new Error("DB_FILE is not set");
	return settings.backupDir || defaultBackupDir(file);
}

export const policyOf = (s: SettingsRow): RetentionPolicy => ({
	daily: s.backupKeepDaily,
	weekly: s.backupKeepWeekly,
	monthly: s.backupKeepMonthly,
});

// Pages copied between two turns of the event loop: 4 MiB, so the hub answers
// requests while a large database is being copied.
const PAGES_PER_STEP = 1024;

export interface MakeOptions {
	kind: "auto" | "manual";
	signal: AbortSignal;
	progress: (done: number, total: number, message: string) => void;
}

// Takes a backup: SQLite's online backup into a scratch file, settled to a single
// file, checked (integrity_check, tables, row counts), compressed, and the packed
// file proved to unpack to the same bytes. Nothing reaches the final name unless
// every step passed; a failure leaves no half file behind.
export async function makeBackup(
	settings: SettingsRow,
	options: MakeOptions,
): Promise<BackupMeta> {
	const dir = backupDirOf(settings);
	mkdirSync(dir, { recursive: true });
	const at = new Date();
	const name = backupName(at, settings.backupCompression);
	const scratch = join(dir, `.${name}.raw`);
	const final = join(dir, name);
	const dbFile = process.env.DB_FILE as string;
	try {
		// Room for the copy and the packed file, with a margin.
		const need = statSync(dbFile).size * 2.2;
		const stat = statfsSync(dir);
		if (stat.bavail * stat.bsize < need)
			throw new Error(
				`Not enough free space in ${dir} for a backup (about ${Math.ceil(need / 1e6)} MB needed)`,
			);
		options.progress(0, 0, "Copying the database");
		await connection().backup(scratch, {
			progress: ({ totalPages, remainingPages }) => {
				options.signal.throwIfAborted();
				options.progress(
					totalPages - remainingPages,
					totalPages,
					"Copying the database",
				);
				return PAGES_PER_STEP;
			},
		});
		options.signal.throwIfAborted();
		settleJournal(scratch);
		options.progress(0, 0, "Checking the copy");
		const check = checkDatabase(scratch);
		if (check.integrity !== "ok" || check.problems.length > 0)
			throw new Error(
				`The copy failed its check: ${[check.integrity !== "ok" ? check.integrity : "", ...check.problems].filter(Boolean).join("; ")}`,
			);
		options.progress(0, 0, "Compressing");
		const packed = await compressFile(
			scratch,
			final,
			settings.backupCompression,
			options.signal,
		);
		options.progress(0, 0, "Proving the file unpacks");
		const unpacked = await hashUnpacked(
			final,
			settings.backupCompression,
			options.signal,
		);
		if (unpacked !== packed.rawSha256)
			throw new Error("The packed backup does not unpack to the same bytes");
		const meta: BackupMeta = {
			format: 1,
			name,
			takenAt: at.toISOString(),
			kind: options.kind,
			compression: settings.backupCompression,
			size: packed.size,
			rawSize: packed.rawSize,
			sha256: packed.sha256,
			rawSha256: packed.rawSha256,
			migrations: check.migrations,
			tables: check.tables,
			rows: check.rows,
			integrity: check.integrity,
			verifiedAt: new Date().toISOString(),
			verified: true,
			offsite: null,
		};
		writeMeta(final, meta);
		return meta;
	} catch (error) {
		rmSync(final, { force: true });
		throw error;
	} finally {
		rmSync(scratch, { force: true });
	}
}

// Removes the local backups the policy lets go of; returns their names.
export function pruneLocal(settings: SettingsRow): string[] {
	const items = listLocal(backupDirOf(settings));
	// With no backup known to be good, nothing is let go.
	if (!items.some((item) => item.meta?.verified !== false)) return [];
	const gone = expired(
		items.map((item) => ({
			id: item.name,
			at: item.at,
			good: item.meta ? item.meta.verified : true,
		})),
		policyOf(settings),
	);
	for (const item of gone) {
		const found = items.find((each) => each.name === item.id);
		if (found) removeBackup(found.path);
	}
	return gone.map((item) => item.id);
}
