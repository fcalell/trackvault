import { createHash } from "node:crypto";
import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	createGunzip,
	createGzip,
	createZstdCompress,
	createZstdDecompress,
} from "node:zlib";
import { parseBackupName } from "@trackvault/core/backup";

// The files of a database backup, on node alone (no hub imports) so the restore
// scripts, which run with the hub stopped, use exactly the code the hub made them with.
//
// A backup is `trackvault-<time>.sqlite[.zst|.gz]` with a sidecar `<name>.json`
// that says what it holds and what was checked. The sidecar lives beside the file,
// not in the database: restoring an older database must not forget newer backups.

export type Compression = "zstd" | "gzip" | "none";

export interface BackupMeta {
	format: 1;
	name: string;
	takenAt: string;
	kind: "auto" | "manual";
	compression: Compression;
	// Bytes of the file as stored, and of the database inside.
	size: number;
	rawSize: number;
	sha256: string;
	rawSha256: string;
	// Migrations the database had applied, to tell a backup newer than the code.
	migrations: number;
	tables: number;
	rows: Record<string, number>;
	integrity: string;
	// The newest check that opened the backup and ran integrity_check; null never.
	verifiedAt: string | null;
	verified: boolean;
	offsite: { key: string; uploadedAt: string; encrypted: boolean } | null;
}

export const sidecarOf = (file: string): string => `${file}.json`;

export function defaultBackupDir(dbFile: string): string {
	return join(dirname(resolve(dbFile)), "backups");
}

export function readMeta(file: string): BackupMeta | null {
	try {
		return JSON.parse(readFileSync(sidecarOf(file), "utf8")) as BackupMeta;
	} catch {
		return null;
	}
}

export function writeMeta(file: string, meta: BackupMeta): void {
	const target = sidecarOf(file);
	writeFileSync(`${target}.tmp`, JSON.stringify(meta, null, 2));
	renameSync(`${target}.tmp`, target);
}

export interface LocalBackup {
	name: string;
	path: string;
	at: Date;
	size: number;
	compression: Compression;
	meta: BackupMeta | null;
}

// The backups in a folder, newest first. A file without a sidecar (copied in from
// elsewhere) is listed with no meta: it is unverified.
export function listLocal(dir: string): LocalBackup[] {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const out: LocalBackup[] = [];
	for (const name of names) {
		const parsed = parseBackupName(name);
		if (!parsed) continue;
		const path = join(dir, name);
		let size: number;
		try {
			size = statSync(path).size;
		} catch {
			continue;
		}
		out.push({
			name,
			path,
			at: parsed.at,
			size,
			compression: parsed.compression,
			meta: readMeta(path),
		});
	}
	return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function removeBackup(path: string): void {
	rmSync(path, { force: true });
	rmSync(sidecarOf(path), { force: true });
}

const tap = (hash: ReturnType<typeof createHash>): Transform =>
	new Transform({
		transform(chunk, _encoding, callback) {
			hash.update(chunk);
			callback(null, chunk);
		},
	});

export async function sha256File(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path))
		hash.update(chunk as Buffer);
	return hash.digest("hex");
}

// Compresses `source` into `dest` (written whole, then moved into place), hashing
// both ends in the one pass.
export async function compressFile(
	source: string,
	dest: string,
	compression: Compression,
	signal?: AbortSignal,
): Promise<{
	rawSha256: string;
	sha256: string;
	rawSize: number;
	size: number;
}> {
	const raw = createHash("sha256");
	const stored = createHash("sha256");
	const part = `${dest}.tmp`;
	const stages: NodeJS.ReadWriteStream[] = [tap(raw)];
	if (compression === "zstd") stages.push(createZstdCompress());
	if (compression === "gzip") stages.push(createGzip({ level: 6 }));
	stages.push(tap(stored));
	try {
		await pipeline(
			createReadStream(source),
			...stages,
			createWriteStream(part),
			{ signal },
		);
		renameSync(part, dest);
	} catch (error) {
		rmSync(part, { force: true });
		throw error;
	}
	return {
		rawSha256: raw.digest("hex"),
		sha256: stored.digest("hex"),
		rawSize: statSync(source).size,
		size: statSync(dest).size,
	};
}

// Unpacks a stored backup (by its name's extension) to `dest`; returns the SHA-256
// of the database bytes.
export async function decompressFile(
	source: string,
	dest: string,
	compression: Compression,
	signal?: AbortSignal,
): Promise<string> {
	const raw = createHash("sha256");
	const stages: NodeJS.ReadWriteStream[] = [];
	if (compression === "zstd") stages.push(createZstdDecompress());
	if (compression === "gzip") stages.push(createGunzip());
	mkdirSync(dirname(dest), { recursive: true });
	try {
		await pipeline(
			createReadStream(source),
			...stages,
			tap(raw),
			createWriteStream(dest),
			{ signal },
		);
	} catch (error) {
		rmSync(dest, { force: true });
		throw error;
	}
	return raw.digest("hex");
}

// The SHA-256 of what a stored backup unpacks to, without writing it anywhere.
export async function hashUnpacked(
	source: string,
	compression: Compression,
	signal?: AbortSignal,
): Promise<string> {
	const raw = createHash("sha256");
	const stages: NodeJS.ReadWriteStream[] = [];
	if (compression === "zstd") stages.push(createZstdDecompress());
	if (compression === "gzip") stages.push(createGunzip());
	await pipeline(createReadStream(source), ...stages, tap(raw), sink(), {
		signal,
	});
	return raw.digest("hex");
}

const sink = (): Writable =>
	new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		},
	});

export interface DatabaseCheck {
	integrity: string;
	tables: number;
	rows: Record<string, number>;
	migrations: number;
	// What is wrong beyond integrity_check, empty when nothing.
	problems: string[];
}

// Opens a database file read-only and checks it: SQLite's integrity_check, the
// tables the hub cannot run without, and a row count per table.
export function checkDatabase(path: string): DatabaseCheck {
	const database = new DatabaseSync(path, { readOnly: true });
	try {
		const integrity = (
			database.prepare("PRAGMA integrity_check").all() as {
				integrity_check: string;
			}[]
		)
			.map((row) => row.integrity_check)
			.join("; ");
		const names = (
			database
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
				)
				.all() as { name: string }[]
		).map((row) => row.name);
		const rows: Record<string, number> = {};
		for (const name of names) {
			try {
				rows[name] = (
					database
						.prepare(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`)
						.get() as { n: number }
				).n;
			} catch {
				rows[name] = -1;
			}
		}
		const problems: string[] = [];
		for (const required of ["tracks", "files", "settings", "jobs"]) {
			if (!(required in rows)) problems.push(`table ${required} is missing`);
		}
		if (rows.settings === 0) problems.push("the settings row is missing");
		return {
			integrity,
			tables: names.length,
			rows,
			migrations: rows.__drizzle_migrations ?? 0,
			problems,
		};
	} finally {
		database.close();
	}
}

// Whether another process has the database open (the hub): an exclusive lock cannot
// be taken while one does. Opening the file also makes sure it is a database.
export function lockedByAnother(dbFile: string): boolean {
	if (!existsSync(dbFile)) return false;
	const database = new DatabaseSync(dbFile);
	try {
		database.exec("PRAGMA busy_timeout = 0");
		database.exec("PRAGMA locking_mode = EXCLUSIVE");
		database.exec("BEGIN EXCLUSIVE");
		database.exec("ROLLBACK");
		return false;
	} catch {
		return true;
	} finally {
		try {
			database.close();
		} catch {}
	}
}

// Makes a backup file safe to open anywhere: no WAL, so a single file is all there is.
export function settleJournal(path: string): void {
	const database = new DatabaseSync(path);
	try {
		database.exec("PRAGMA journal_mode = DELETE");
	} finally {
		database.close();
	}
}

// Puts a checked, unpacked database in place of `dbFile`: the old file and its WAL
// move aside (never deleted), then the new one is renamed in. Refuses while another
// process (the hub) has the database open.
export function installDatabase(
	unpacked: string,
	dbFile: string,
): { movedAside: string | null } {
	if (lockedByAnother(dbFile))
		throw new Error(
			`${dbFile} is open in another process (the hub). Stop the hub, then run this again.`,
		);
	mkdirSync(dirname(resolve(dbFile)), { recursive: true });
	let movedAside: string | null = null;
	if (existsSync(dbFile)) {
		movedAside = `${dbFile}.pre-restore-${Date.now()}`;
		renameSync(dbFile, movedAside);
		for (const suffix of ["-wal", "-shm"])
			if (existsSync(dbFile + suffix))
				renameSync(dbFile + suffix, movedAside + suffix);
	}
	renameSync(unpacked, dbFile);
	return { movedAside };
}
