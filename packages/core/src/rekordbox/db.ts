/// <reference path="./sqlcipher.d.ts" />

import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3-multiple-ciphers";
import { masterDbKey } from "./key.ts";

const exec = promisify(execFile);

export type MasterDb = Database.Database;

export interface OpenOptions {
	// Default true: a reader never writes. A writer passes `false`.
	readonly?: boolean;
	// The SQLCipher passphrase. Default: the fixed Rekordbox 6/7 one (`masterDbKey`),
	// or `REKORDBOX_DB_KEY` when set.
	key?: string;
}

export class RekordboxKeyError extends Error {
	constructor(path: string, cause: unknown) {
		super(
			`cannot decrypt ${path}: wrong key, not a Rekordbox 6/7 master.db, or a newer cipher`,
			{ cause },
		);
		this.name = "RekordboxKeyError";
	}
}

// Opens master.db (SQLCipher 4 as Rekordbox 6/7 writes it).
//
// Parameters, as pyrekordbox's `sqlite+pysqlcipher` URL does: `PRAGMA key` with the
// passphrase, so SQLCipher derives the page key with PBKDF2-HMAC-SHA512 (256000
// rounds), AES-256-CBC pages of 4096 bytes, HMAC-SHA512 per page. With
// better-sqlite3-multiple-ciphers that is `cipher='sqlcipher'` + `legacy=4` (the
// SQLCipher 4 defaults) before the key.
//
// Never open the live file of a running Rekordbox: read a `snapshotCopy`.
export function openMasterDb(
	path: string,
	options: OpenOptions = {},
): MasterDb {
	const readonly = options.readonly ?? true;
	const key = options.key ?? process.env.REKORDBOX_DB_KEY ?? masterDbKey();
	if (!/^[0-9A-Za-z]+$/.test(key))
		throw new Error("master.db key must be alphanumeric");
	const db = new Database(path, { readonly, fileMustExist: true });
	try {
		db.pragma("cipher='sqlcipher'");
		db.pragma("legacy=4");
		db.pragma(`key='${key}'`);
		// Page 1 is decrypted by the first read: a wrong key fails here.
		db.prepare("SELECT count(*) FROM sqlite_master").get();
		if (readonly) {
			db.pragma("query_only=ON");
			db.pragma("cache_size=-65536");
			db.pragma("temp_store=MEMORY");
		}
	} catch (error) {
		db.close();
		throw new RekordboxKeyError(path, error);
	}
	return db;
}

export interface Snapshot {
	// The copied master.db.
	path: string;
	dir: string;
	cleanup(): Promise<void>;
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function signature(paths: string[]): Promise<string> {
	const parts: string[] = [];
	for (const p of paths) {
		try {
			const s = await stat(p);
			parts.push(`${s.size}:${s.mtimeMs}`);
		} catch {
			parts.push("-");
		}
	}
	return parts.join("|");
}

// Copies master.db and its -wal into `dir` (a fresh temp dir by default) so it can
// be read while Rekordbox runs. The copy is retried until the files stop changing
// between the start and the end of the copy (a crude consistency check: a
// checkpoint in flight changes the pair).
//
// `-shm` is deliberately not copied: it is only a shared-memory index of the WAL,
// SQLite rebuilds it from the -wal on the first open of the copy, and a stale index
// from a live writer could point at frames the copy does not have.
export async function snapshotCopy(
	masterDbPath: string,
	dir?: string,
): Promise<Snapshot> {
	const target = dir ?? (await mkdtemp(join(tmpdir(), "tv-rekordbox-")));
	await mkdir(target, { recursive: true });
	const wal = `${masterDbPath}-wal`;
	const dest = join(target, basename(masterDbPath));
	for (let attempt = 0; attempt < 5; attempt++) {
		const before = await signature([masterDbPath, wal]);
		await copyFile(masterDbPath, dest);
		if (await exists(wal)) await copyFile(wal, `${dest}-wal`);
		else await rm(`${dest}-wal`, { force: true });
		if ((await signature([masterDbPath, wal])) === before) break;
	}
	return {
		path: dest,
		dir: target,
		cleanup: () => rm(target, { recursive: true, force: true }),
	};
}

export interface OpenSnapshot {
	db: MasterDb;
	snapshot: Snapshot;
	// Closes the database and deletes the copy.
	close(): Promise<void>;
}

// A copy opened for reading. The copy is opened read-write so SQLite can replay
// its WAL, then locked with `query_only`.
export async function openSnapshot(
	masterDbPath: string,
	options: Pick<OpenOptions, "key"> & { dir?: string } = {},
): Promise<OpenSnapshot> {
	const snapshot = await snapshotCopy(masterDbPath, options.dir);
	try {
		const db = openMasterDb(snapshot.path, {
			readonly: false,
			key: options.key,
		});
		db.pragma("query_only=ON");
		db.pragma("cache_size=-65536");
		db.pragma("temp_store=MEMORY");
		return {
			db,
			snapshot,
			close: async () => {
				db.close();
				await snapshot.cleanup();
			},
		};
	} catch (error) {
		await snapshot.cleanup();
		throw error;
	}
}

// ---- schema probe -----------------------------------------------------------

// Every column the readers and the writer touch. A database missing one is not a
// schema this library knows.
export const REQUIRED_COLUMNS = {
	djmdContent: [
		"ID",
		"UUID",
		"FolderPath",
		"FileNameL",
		"Title",
		"ArtistID",
		"AlbumID",
		"GenreID",
		"LabelID",
		"RemixerID",
		"KeyID",
		"ColorID",
		"BPM",
		"Length",
		"BitRate",
		"SampleRate",
		"BitDepth",
		"FileSize",
		"FileType",
		"Rating",
		"Commnt",
		"ReleaseYear",
		"TrackNo",
		"DiscNo",
		"DJPlayCount",
		"AnalysisDataPath",
		"Analysed",
		"DateCreated",
		"StockDate",
		"OrgFolderPath",
		"MasterDBID",
		"MasterSongID",
		"ContentLink",
		"DeviceID",
		"rb_file_id",
		"HotCueAutoLoad",
		"created_at",
		"updated_at",
		"rb_local_usn",
	],
	djmdArtist: [
		"ID",
		"Name",
		"UUID",
		"rb_local_usn",
		"created_at",
		"updated_at",
	],
	djmdAlbum: [
		"ID",
		"Name",
		"AlbumArtistID",
		"UUID",
		"rb_local_usn",
		"created_at",
		"updated_at",
	],
	djmdGenre: ["ID", "Name", "UUID", "rb_local_usn", "created_at", "updated_at"],
	djmdLabel: ["ID", "Name", "UUID", "rb_local_usn", "created_at", "updated_at"],
	djmdKey: ["ID", "ScaleName", "Seq"],
	djmdColor: ["ID", "ColorCode", "SortKey", "Commnt"],
	djmdPlaylist: [
		"ID",
		"Seq",
		"Name",
		"Attribute",
		"ParentID",
		"SmartList",
		"UUID",
		"created_at",
		"updated_at",
		"rb_local_usn",
	],
	djmdSongPlaylist: [
		"ID",
		"PlaylistID",
		"ContentID",
		"TrackNo",
		"UUID",
		"created_at",
		"updated_at",
		"rb_local_usn",
	],
	djmdCue: [
		"ID",
		"ContentID",
		"InMsec",
		"InFrame",
		"OutMsec",
		"OutFrame",
		"Kind",
		"Color",
		"ColorTableIndex",
		"ActiveLoop",
		"Comment",
		"BeatLoopSize",
		"UUID",
		"created_at",
		"updated_at",
		"rb_local_usn",
	],
	djmdMyTag: [
		"ID",
		"Seq",
		"Name",
		"Attribute",
		"ParentID",
		"UUID",
		"created_at",
		"updated_at",
		"rb_local_usn",
	],
	djmdSongMyTag: [
		"ID",
		"MyTagID",
		"ContentID",
		"TrackNo",
		"UUID",
		"created_at",
		"updated_at",
		"rb_local_usn",
	],
	djmdHistory: ["ID", "Seq", "Name", "Attribute", "ParentID", "DateCreated"],
	djmdSongHistory: ["ID", "HistoryID", "ContentID", "TrackNo", "created_at"],
	djmdProperty: ["DBID", "DBVersion"],
	djmdMenuItems: ["ID", "Name", "rb_local_usn"],
	djmdDevice: ["ID", "MasterDBID"],
	agentRegistry: ["registry_id", "int_1", "str_1", "updated_at"],
} as const satisfies Record<string, readonly string[]>;

// `DjmdProperty.DBVersion` values the writer has been tested against on a real
// install. EMPTY until the R2 spike on a throwaway Rekordbox 7 library records the
// value (see VERIFY.md); until then every write needs `allowedVersions` or
// `allowUntested` passed explicitly.
export const WRITE_ALLOWED_DB_VERSIONS: readonly string[] = [];

export interface SchemaInfo {
	dbVersion: string | null;
	dbId: string | null;
	// Table -> required columns the database does not have (empty = complete).
	missing: Record<string, string[]>;
	complete: boolean;
	// The `agentRegistry` rows by `registry_id` (small; includes `localUpdateCount`).
	registry: Record<string, { int1: number | null; str1: string | null }>;
}

export function probeSchema(db: MasterDb): SchemaInfo {
	const missing: Record<string, string[]> = {};
	for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
		const have = new Set(
			(db.pragma(`table_info(${table})`) as { name: string }[]).map(
				(c) => c.name,
			),
		);
		const lacking = columns.filter((c) => !have.has(c));
		if (lacking.length > 0) missing[table] = lacking;
	}
	let dbVersion: string | null = null;
	let dbId: string | null = null;
	if (!missing.djmdProperty) {
		const row = db
			.prepare("SELECT DBID, DBVersion FROM djmdProperty LIMIT 1")
			.get() as { DBID: string | null; DBVersion: string | null } | undefined;
		dbVersion = row?.DBVersion ?? null;
		dbId = row?.DBID ?? null;
	}
	const registry: SchemaInfo["registry"] = {};
	if (!missing.agentRegistry) {
		const rows = db
			.prepare("SELECT registry_id, int_1, str_1 FROM agentRegistry")
			.all() as {
			registry_id: string;
			int_1: number | null;
			str_1: string | null;
		}[];
		for (const r of rows)
			registry[r.registry_id] = { int1: r.int_1, str1: r.str_1 };
	}
	return {
		dbVersion,
		dbId,
		missing,
		complete: Object.keys(missing).length === 0,
		registry,
	};
}

export function isWriteSupported(
	info: SchemaInfo,
	allowedVersions: readonly string[] = WRITE_ALLOWED_DB_VERSIONS,
): boolean {
	return (
		info.complete &&
		info.dbVersion !== null &&
		allowedVersions.includes(info.dbVersion)
	);
}

// ---- running / cloud --------------------------------------------------------

// Whether the Rekordbox application is running. The background `rekordboxAgent`
// is a different process and does not count (exact name match).
//   macOS / Linux: `pgrep -x rekordbox` (exit 1 = none)
//   Windows: `tasklist /FI "IMAGENAME eq rekordbox.exe"`
// Throws when the check itself cannot run: callers treat that as "unknown, do not write".
export async function isRekordboxRunning(): Promise<boolean> {
	if (process.platform === "win32") {
		const { stdout } = await exec("tasklist", [
			"/FI",
			"IMAGENAME eq rekordbox.exe",
			"/NH",
			"/FO",
			"CSV",
		]);
		return /"rekordbox\.exe"/i.test(stdout);
	}
	try {
		await exec("pgrep", ["-x", "rekordbox"]);
		return true;
	} catch (error) {
		if ((error as { code?: number }).code === 1) return false;
		throw error;
	}
}

export interface CloudSyncStatus {
	// "unknown": no signal either way. Treat it as risky.
	state: "on" | "off" | "unknown";
	evidence: string[];
}

// Rekordbox Cloud Library Sync. HEURISTIC, unverified on a real install (VERIFY.md):
//  - the special playlist `100000` ("Cloud Library Sync") exists in djmdPlaylist
//    (pyrekordbox lists it among its SPECIAL_PLAYLIST_IDS);
//  - `cloudAgentRegistry` has rows;
//  - rows carry a cloud `usn` (rows Rekordbox pushed/pulled have usn > 0).
// `optionsJson` (the parsed rekordboxAgent options.json) can add a flag: any option
// whose key mentions "cloud" and is truthy counts as "on" evidence.
export function cloudLibrarySyncEnabled(
	db: MasterDb,
	optionsJson?: Record<string, unknown> | null,
): CloudSyncStatus {
	const evidence: string[] = [];
	let signals = 0;
	const hasCloudPlaylist = db
		.prepare("SELECT 1 FROM djmdPlaylist WHERE ID = '100000' LIMIT 1")
		.get();
	if (hasCloudPlaylist)
		evidence.push("playlist 100000 (Cloud Library Sync) exists");
	try {
		const row = db
			.prepare("SELECT count(*) AS n FROM cloudAgentRegistry")
			.get() as {
			n: number;
		};
		if (row.n > 0) evidence.push(`cloudAgentRegistry has ${row.n} rows`);
		signals++;
	} catch {
		// table absent on this version
	}
	const synced = db
		.prepare(
			"SELECT count(*) AS n FROM djmdContent WHERE usn IS NOT NULL AND usn > 0",
		)
		.get() as { n: number };
	if (synced.n > 0) evidence.push(`${synced.n} tracks carry a cloud usn`);
	signals++;
	if (optionsJson) {
		signals++;
		for (const [k, v] of Object.entries(optionsJson)) {
			if (/cloud/i.test(k) && v && v !== "0" && v !== "false") {
				evidence.push(`option ${k}=${String(v)}`);
			}
		}
	}
	if (evidence.length > 0) return { state: "on", evidence };
	return { state: signals >= 2 ? "off" : "unknown", evidence };
}

// ---- backup -----------------------------------------------------------------

export interface Backup {
	path: string;
	pruned: string[];
}

function stamp(date: Date): string {
	const p = (n: number, w = 2) => String(n).padStart(w, "0");
	return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
}

// Timestamped file copy of master.db (+ -wal) into `<dir>/trackvault-backups/`,
// keeping the newest `keep` copies. The copy is the encrypted file as is, so
// restoring it is a plain file copy with Rekordbox closed.
export async function backupMasterDb(
	masterDbPath: string,
	keep: number,
): Promise<Backup> {
	const dir = join(dirname(masterDbPath), "trackvault-backups");
	await mkdir(dir, { recursive: true });
	const target = join(dir, `master-${stamp(new Date())}.db`);
	await copyFile(masterDbPath, target);
	if (await exists(`${masterDbPath}-wal`))
		await copyFile(`${masterDbPath}-wal`, `${target}-wal`);
	const copies = (await readdir(dir))
		.filter((f) => /^master-\d{8}-\d{6}\.db$/.test(f))
		.sort();
	const pruned: string[] = [];
	for (const name of copies.slice(
		0,
		Math.max(0, copies.length - Math.max(1, keep)),
	)) {
		await rm(join(dir, name), { force: true });
		await rm(join(dir, `${name}-wal`), { force: true });
		pruned.push(join(dir, name));
	}
	return { path: target, pruned };
}
