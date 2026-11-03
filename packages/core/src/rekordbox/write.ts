/// <reference path="./sqlcipher.d.ts" />

import { randomBytes, randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import type Database from "better-sqlite3-multiple-ciphers";
import { withAnlzPath } from "./anlz.ts";
import {
	type Backup,
	backupMasterDb,
	cloudLibrarySyncEnabled,
	isRekordboxRunning,
	isWriteSupported,
	type MasterDb,
	type OpenOptions,
	openMasterDb,
	probeSchema,
	type SchemaInfo,
	WRITE_ALLOWED_DB_VERSIONS,
} from "./db.ts";
import { anlzPathFor } from "./discover.ts";
import {
	applyMasterPlaylistsXml,
	type PlaylistXmlOp,
} from "./masterplaylists.ts";

// The writer. Mirrors what pyrekordbox's `Rekordbox6Database` does for each
// operation (db6/database.py + registry.py), expressed as plain SQL so it runs in
// one better-sqlite3 transaction:
//  - IDs: 28-bit random integers (>= 100, unused in the table), stored as text, for
//    every row of the ID/UUID tables; song-playlist / song-my-tag rows get a UUID v4
//    string as ID. Every row also gets a UUID v4 in `UUID`.
//  - Sync columns on a created row: rb_data_status 0, rb_local_data_status 0,
//    rb_local_deleted 0, rb_local_synced 0, usn NULL (the cloud's), rb_local_usn set below.
//  - rb_local_usn: `agentRegistry.localUpdateCount.int_1` is the global counter. Each
//    created / changed row gets the next value as its rb_local_usn (in the order the
//    rows were first touched), each delete takes one value, and the counter is
//    written back. pyrekordbox bumps once per attribute assignment instead; both
//    keep it strictly increasing, which is all this relies on (VERIFY.md).
//  - created_at / updated_at: "YYYY-MM-DD HH:MM:SS.SSS +00:00" (UTC).
//  - DateCreated / StockDate on a track: "YYYY-MM-DD" (local date).

export class WriteRefused extends Error {
	readonly code: "running" | "unknown-process" | "schema" | "cloud-sync";
	constructor(code: WriteRefused["code"], message: string) {
		super(message);
		this.name = "WriteRefused";
		this.code = code;
	}
}

export interface WriteOptions extends Pick<OpenOptions, "key"> {
	// Default `WRITE_ALLOWED_DB_VERSIONS`.
	allowedVersions?: readonly string[];
	// Skip the version allowlist (a throwaway test library only). The schema must
	// still have every required column.
	allowUntested?: boolean;
	// Skip the "Rekordbox is running" check (tests only).
	ignoreRunning?: boolean;
	// Write even when Cloud Library Sync is detected on (never do this on a managed install).
	allowCloudSync?: boolean;
	// The parsed rekordboxAgent options.json (`readRekordboxOptions`), extra evidence
	// for the Cloud Library Sync check.
	agentOptions?: Record<string, unknown> | null;
	// Copies of master.db to keep, taken before the first write (default 5; 0 = no backup).
	backupKeep?: number;
}

export interface FieldInput {
	title?: string | null;
	artist?: string | null;
	remixer?: string | null;
	album?: string | null;
	albumArtist?: string | null;
	genre?: string | null;
	label?: string | null;
	comment?: string | null;
	year?: number | null;
	// Stars 0..5.
	rating?: number;
	// A djmdColor name (its `Commnt`), null for none.
	color?: string | null;
	// An existing djmdKey ScaleName.
	key?: string | null;
	bpm?: number | null;
	trackNo?: number | null;
	durationSec?: number | null;
	bitrate?: number | null;
	sampleRate?: number | null;
	bitDepth?: number | null;
	fileSize?: number | null;
}

export interface CueInput {
	// 0 memory cue, 1.. hot cue (A = 1).
	kind: number;
	startMs: number;
	// Loop end; null for a plain cue.
	endMs?: number | null;
	// djmdCue.Color (-1 none) and palette index.
	color?: number | null;
	colorTableIndex?: number | null;
	comment?: string | null;
	activeLoop?: boolean;
	beatLoopSize?: number | null;
}

const FILE_TYPES: Record<string, number> = {
	".mp3": 1,
	".m4a": 4,
	".flac": 5,
	".wav": 11,
	".aiff": 12,
	".aif": 12,
};

// Paths in master.db and ANLZ files use "/" on both platforms.
export function toRekordboxPath(path: string): string {
	return path.replace(/\\/g, "/");
}

function utcStamp(date: Date): string {
	return `${date.toISOString().replace("T", " ").slice(0, 23)} +00:00`;
}

function localDate(date: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

type Param = string | number | bigint | Buffer | null;
type Stmt = Database.Statement<Param[]>;

export interface WriteSummary {
	// Rows inserted / updated / deleted.
	created: number;
	changed: number;
	deleted: number;
	// The counter after the transaction.
	localUpdateCount: number;
}

// Operations inside one transaction. Obtained from `MasterWriter.transaction`.
export class WriteTx {
	private readonly stmts = new Map<string, Stmt>();
	private readonly columnCache = new Map<string, Set<string>>();
	private readonly touched = new Map<string, [string, string, string]>();
	private readonly lookups = new Map<string, string | null>();
	private readonly now: Date;
	private readonly stamp: string;
	private bumps = 0;
	private ratingScale: "stars" | "x51" | undefined;
	readonly xml: PlaylistXmlOp[] = [];
	counts = { created: 0, changed: 0, deleted: 0 };

	private readonly db: MasterDb;

	constructor(db: MasterDb, now: Date) {
		this.db = db;
		this.now = now;
		this.stamp = utcStamp(now);
	}

	// ---- plumbing ----------------------------------------------------------

	private stmt(sql: string): Stmt {
		let s = this.stmts.get(sql);
		if (!s) {
			s = this.db.prepare(sql) as Stmt;
			this.stmts.set(sql, s);
		}
		return s;
	}

	private columns(table: string): Set<string> {
		let c = this.columnCache.get(table);
		if (!c) {
			c = new Set(
				(this.db.pragma(`table_info(${table})`) as { name: string }[]).map(
					(r) => r.name,
				),
			);
			this.columnCache.set(table, c);
		}
		return c;
	}

	private get<T>(sql: string, ...params: Param[]): T | undefined {
		return this.stmt(sql).get(...params) as T | undefined;
	}

	private all<T>(sql: string, ...params: Param[]): T[] {
		return this.stmt(sql).all(...params) as T[];
	}

	private idExists(table: string, column: string, id: string): boolean {
		return (
			this.get(`SELECT 1 FROM ${table} WHERE ${column} = ?`, id) !== undefined
		);
	}

	// Random 28-bit id, >= 100, unused in `table.column` (pyrekordbox `generate_unused_id`).
	private newId(table: string, column = "ID"): string {
		for (let i = 0; i < 1_000_000; i++) {
			const id = randomBytes(4).readUInt32BE() >>> 4;
			if (id < 100) continue;
			if (!this.idExists(table, column, String(id))) return String(id);
		}
		throw new Error(`no unused id in ${table}`);
	}

	private touch(table: string, id: string, idColumn = "ID"): void {
		const key = `${table}\0${id}`;
		if (!this.touched.has(key)) this.touched.set(key, [table, idColumn, id]);
	}

	private insert(
		table: string,
		row: Record<string, Param>,
		idColumn = "ID",
	): void {
		const cols = this.columns(table);
		const full: Record<string, Param> = {
			UUID: randomUUID(),
			rb_data_status: 0,
			rb_local_data_status: 0,
			rb_local_deleted: 0,
			rb_local_synced: 0,
			created_at: this.stamp,
			updated_at: this.stamp,
			...row,
		};
		const names = Object.keys(full).filter((c) => cols.has(c));
		const sql = `INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`;
		this.stmt(sql).run(...names.map((n) => full[n] ?? null));
		this.touch(table, String(full[idColumn]), idColumn);
		this.counts.created++;
	}

	// UPDATE only the columns whose value differs; touches the row (updated_at,
	// rb_local_usn) only when something changed. Returns whether it did.
	private update(
		table: string,
		id: string,
		patch: Record<string, Param>,
		idColumn = "ID",
	): boolean {
		const names = Object.keys(patch);
		if (names.length === 0) return false;
		const differs = names.map((n) => `${n} IS NOT ?`).join(" OR ");
		const sets = [...names.map((n) => `${n} = ?`), "updated_at = ?"].join(", ");
		const values = names.map((n) => patch[n] ?? null);
		const info = this.stmt(
			`UPDATE ${table} SET ${sets} WHERE ${idColumn} = ? AND (${differs})`,
		).run(...values, this.stamp, id, ...values);
		if (info.changes === 0) return false;
		this.touch(table, id, idColumn);
		this.counts.changed++;
		return true;
	}

	private remove(table: string, column: string, id: string): number {
		const info = this.stmt(`DELETE FROM ${table} WHERE ${column} = ?`).run(id);
		this.bumps += info.changes;
		this.counts.deleted += info.changes;
		return info.changes;
	}

	// Assigns rb_local_usn to every touched row and writes the counter back. Called by
	// the writer at the end of the transaction.
	finish(): WriteSummary {
		const reg = this.get<{ int_1: number | null }>(
			"SELECT int_1 FROM agentRegistry WHERE registry_id = 'localUpdateCount'",
		);
		if (!reg) throw new Error("agentRegistry has no localUpdateCount row");
		let usn = reg.int_1 ?? 0;
		for (const [table, idColumn, id] of this.touched.values()) {
			usn++;
			this.stmt(
				`UPDATE ${table} SET rb_local_usn = ? WHERE ${idColumn} = ?`,
			).run(usn, id);
		}
		usn += this.bumps;
		if (usn !== (reg.int_1 ?? 0)) {
			this.stmt(
				"UPDATE agentRegistry SET int_1 = ?, updated_at = ? WHERE registry_id = 'localUpdateCount'",
			).run(usn, this.stamp);
		}
		return { ...this.counts, localUpdateCount: usn };
	}

	// ---- lookups ---------------------------------------------------------------

	// Artist / album / genre / label by exact name; created when absent.
	private entity(
		table: "djmdArtist" | "djmdAlbum" | "djmdGenre" | "djmdLabel",
		name: string | null | undefined,
		extra: () => Record<string, Param> = () => ({}),
	): string | null {
		if (name === null || name === undefined || name === "") return null;
		const cacheKey = `${table}\0${name}`;
		const cached = this.lookups.get(cacheKey);
		if (cached !== undefined) return cached;
		const row = this.get<{ ID: string }>(
			`SELECT ID FROM ${table} WHERE Name = ?`,
			name,
		);
		let id: string;
		if (row) id = String(row.ID);
		else {
			id = this.newId(table);
			this.insert(table, { ID: id, Name: name, ...extra() });
		}
		this.lookups.set(cacheKey, id);
		return id;
	}

	private colorId(name: string | null | undefined): string | null {
		if (!name) return null;
		const row = this.get<{ ID: string }>(
			"SELECT ID FROM djmdColor WHERE Commnt = ?",
			name,
		);
		if (!row) throw new Error(`unknown Rekordbox colour: ${name}`);
		return String(row.ID);
	}

	private keyId(name: string | null | undefined): string | null {
		if (!name) return null;
		const row = this.get<{ ID: string }>(
			"SELECT ID FROM djmdKey WHERE ScaleName = ?",
			name,
		);
		if (!row) throw new Error(`unknown Rekordbox key: ${name}`);
		return String(row.ID);
	}

	// Stars to the stored value, in the scale the library already uses.
	private ratingValue(stars: number): number {
		if (this.ratingScale === undefined) {
			const row = this.get<{ m: number | null }>(
				"SELECT max(Rating) AS m FROM djmdContent",
			);
			this.ratingScale = (row?.m ?? 0) > 5 || !row?.m ? "x51" : "stars";
		}
		const s = Math.max(0, Math.min(5, Math.round(stars)));
		return this.ratingScale === "x51" ? s * 51 : s;
	}

	private contentPatch(fields: FieldInput): Record<string, Param> {
		const p: Record<string, Param> = {};
		if (fields.title !== undefined) p.Title = fields.title;
		if (fields.artist !== undefined)
			p.ArtistID = this.entity("djmdArtist", fields.artist);
		if (fields.remixer !== undefined)
			p.RemixerID = this.entity("djmdArtist", fields.remixer);
		if (fields.album !== undefined) {
			p.AlbumID = this.entity("djmdAlbum", fields.album, () => ({
				AlbumArtistID: this.entity("djmdArtist", fields.albumArtist),
				Compilation: 0,
			}));
		}
		if (fields.genre !== undefined)
			p.GenreID = this.entity("djmdGenre", fields.genre);
		if (fields.label !== undefined)
			p.LabelID = this.entity("djmdLabel", fields.label);
		if (fields.comment !== undefined) p.Commnt = fields.comment;
		if (fields.year !== undefined) p.ReleaseYear = fields.year ?? 0;
		if (fields.rating !== undefined) p.Rating = this.ratingValue(fields.rating);
		if (fields.color !== undefined) p.ColorID = this.colorId(fields.color);
		if (fields.key !== undefined) p.KeyID = this.keyId(fields.key);
		if (fields.bpm !== undefined)
			p.BPM = fields.bpm ? Math.round(fields.bpm * 100) : 0;
		if (fields.trackNo !== undefined) p.TrackNo = fields.trackNo ?? 0;
		if (fields.durationSec !== undefined) p.Length = fields.durationSec ?? 0;
		if (fields.bitrate !== undefined) p.BitRate = fields.bitrate ?? 0;
		if (fields.sampleRate !== undefined) p.SampleRate = fields.sampleRate ?? 0;
		if (fields.bitDepth !== undefined) p.BitDepth = fields.bitDepth ?? 0;
		if (fields.fileSize !== undefined) p.FileSize = fields.fileSize;
		return p;
	}

	// ---- content -------------------------------------------------------------------

	contentIdByPath(path: string): string | null {
		const row = this.get<{ ID: string }>(
			"SELECT ID FROM djmdContent WHERE FolderPath = ?",
			toRekordboxPath(path),
		);
		return row ? String(row.ID) : null;
	}

	// Creates a track pointing at `path` (a local file) or, when a row already has
	// that path, updates its fields. Returns the content id. A new row is the same
	// shape pyrekordbox `add_content` writes; Rekordbox analyses it on first load.
	upsertContent(
		path: string,
		fields: FieldInput = {},
	): { id: string; created: boolean } {
		const rbPath = toRekordboxPath(path);
		const existing = this.contentIdByPath(rbPath);
		if (existing) {
			this.updateContent(existing, fields);
			return { id: existing, created: false };
		}
		const fileType = FILE_TYPES[extname(rbPath).toLowerCase()];
		if (fileType === undefined)
			throw new Error(`unsupported file type: ${rbPath}`);
		const menu = this.get<{ rb_local_usn: number | null }>(
			"SELECT rb_local_usn FROM djmdMenuItems WHERE Name = 'TRACK'",
		);
		const device = this.get<{ ID: string; MasterDBID: string | null }>(
			"SELECT ID, MasterDBID FROM djmdDevice LIMIT 1",
		);
		if (!menu || !device)
			throw new Error("master.db has no TRACK menu item or device row");
		const id = this.newId("djmdContent");
		const fileId = this.newId("djmdContent", "rb_file_id");
		let size: number | null = fields.fileSize ?? null;
		if (size === null) {
			try {
				size = statSync(path).size;
			} catch {
				size = null;
			}
		}
		const date = localDate(this.now);
		this.insert("djmdContent", {
			ID: id,
			ContentLink: menu.rb_local_usn,
			DateCreated: date,
			StockDate: date,
			DeviceID: device.ID,
			MasterDBID: device.MasterDBID,
			MasterSongID: id,
			FileNameL: basename(rbPath),
			FileSize: size,
			FileType: fileType,
			FolderPath: rbPath,
			HotCueAutoLoad: "on",
			rb_file_id: fileId,
			// Everything the caller did not give is NULL / 0 like pyrekordbox leaves it.
			...this.contentPatch({ ...fields, fileSize: undefined }),
		});
		return { id, created: true };
	}

	updateContent(id: string, fields: FieldInput): boolean {
		return this.update("djmdContent", id, this.contentPatch(fields));
	}

	// Points a track at a new file (pyrekordbox `update_content_path`): FolderPath,
	// the file name, and OrgFolderPath when it equalled the old path. The ANLZ PPTH
	// lives in files: see `relinkAnlzPath`.
	relinkContent(id: string, newPath: string): boolean {
		const rbPath = toRekordboxPath(newPath);
		const row = this.get<{
			FolderPath: string | null;
			OrgFolderPath: string | null;
		}>("SELECT FolderPath, OrgFolderPath FROM djmdContent WHERE ID = ?", id);
		if (!row) throw new Error(`no content ${id}`);
		const patch: Record<string, Param> = {
			FolderPath: rbPath,
			FileNameL: basename(rbPath),
		};
		if (row.OrgFolderPath !== null && row.OrgFolderPath === row.FolderPath) {
			patch.OrgFolderPath = rbPath;
		}
		return this.update("djmdContent", id, patch);
	}

	// Moves a library root: every FolderPath under `fromPrefix` now lives under
	// `toPrefix`. Returns the ids and new paths (for `relinkAnlzPath`).
	relinkFolderPath(
		fromPrefix: string,
		toPrefix: string,
	): { id: string; path: string }[] {
		const from = toRekordboxPath(fromPrefix).replace(/\/+$/, "");
		const to = toRekordboxPath(toPrefix).replace(/\/+$/, "");
		const rows = this.all<{ ID: string; FolderPath: string }>(
			"SELECT ID, FolderPath FROM djmdContent WHERE substr(FolderPath, 1, ?) = ? AND substr(FolderPath, ?, 1) = '/'",
			from.length,
			from,
			from.length + 1,
		);
		const moved: { id: string; path: string }[] = [];
		for (const r of rows) {
			const path = to + r.FolderPath.slice(from.length);
			this.relinkContent(String(r.ID), path);
			moved.push({ id: String(r.ID), path });
		}
		return moved;
	}

	// Removes a track from this library: its playlist entries (the playlists are
	// renumbered), cues, My Tag links and the row. Rows other tables hold for it
	// (mixer params, banklists, history) are left (VERIFY.md).
	deleteContent(id: string): void {
		const lists = this.all<{ PlaylistID: string }>(
			"SELECT DISTINCT PlaylistID FROM djmdSongPlaylist WHERE ContentID = ?",
			id,
		);
		this.remove("djmdSongPlaylist", "ContentID", id);
		for (const l of lists) this.renumberPlaylist(String(l.PlaylistID));
		this.remove("djmdCue", "ContentID", id);
		this.remove("djmdSongMyTag", "ContentID", id);
		this.remove("djmdContent", "ID", id);
	}

	// ---- playlists -------------------------------------------------------------------

	private playlist(id: string): {
		ID: string;
		Attribute: number;
		ParentID: string | null;
		Seq: number;
	} {
		const row = this.get<{
			ID: string;
			Attribute: number;
			ParentID: string | null;
			Seq: number;
		}>(
			"SELECT ID, Attribute, ParentID, Seq FROM djmdPlaylist WHERE ID = ?",
			id,
		);
		if (!row) throw new Error(`no playlist ${id}`);
		return row;
	}

	private children(parentId: string | null): string[] {
		return this.all<{ ID: string }>(
			"SELECT ID FROM djmdPlaylist WHERE ParentID = ? ORDER BY Seq",
			parentId ?? "root",
		).map((r) => String(r.ID));
	}

	// Gives `ordered` the Seq 1..n under `parentId` (and that parent), changing only
	// rows whose parent or position differ.
	private placeChildren(parentId: string | null, ordered: string[]): void {
		const parent = parentId ?? "root";
		ordered.forEach((id, i) => {
			const changed = this.update("djmdPlaylist", id, {
				ParentID: parent,
				Seq: i + 1,
			});
			if (changed) {
				this.xml.push({ op: "update", id, parentId, at: this.now.getTime() });
			}
		});
	}

	private checkFolder(parentId: string | null): void {
		if (parentId === null) return;
		if (this.playlist(parentId).Attribute !== 1)
			throw new Error("parent is not a folder");
	}

	// A playlist or folder under `parentId` (null = top level) at 1-based `seq`
	// (default last). Smart playlists need Rekordbox's rule XML and are not created here.
	createPlaylist(input: {
		name: string;
		kind?: "playlist" | "folder";
		parentId?: string | null;
		seq?: number;
	}): string {
		const parentId = input.parentId ?? null;
		this.checkFolder(parentId);
		const attribute = input.kind === "folder" ? 1 : 0;
		const id = this.newId("djmdPlaylist");
		const siblings = this.children(parentId);
		this.insert("djmdPlaylist", {
			ID: id,
			Seq: siblings.length + 1,
			Name: input.name,
			Attribute: attribute,
			ParentID: parentId ?? "root",
		});
		this.xml.push({
			op: "add",
			id,
			parentId,
			attribute,
			at: this.now.getTime(),
		});
		if (input.seq !== undefined) {
			const at = Math.max(0, Math.min(siblings.length, input.seq - 1));
			siblings.splice(at, 0, id);
			this.placeChildren(parentId, siblings);
		}
		return id;
	}

	renamePlaylist(id: string, name: string): boolean {
		const changed = this.update("djmdPlaylist", id, { Name: name });
		if (changed)
			this.xml.push({
				op: "update",
				id,
				parentId: this.parentOf(id),
				at: this.now.getTime(),
			});
		return changed;
	}

	private parentOf(id: string): string | null {
		const p = this.playlist(id).ParentID;
		return !p || p === "root" ? null : String(p);
	}

	// Moves a playlist/folder to `parentId` at 1-based `seq` (default last).
	movePlaylist(id: string, parentId: string | null, seq?: number): void {
		const node = this.playlist(id);
		this.checkFolder(parentId);
		for (let up = parentId; up !== null; up = this.parentOf(up)) {
			if (up === id) throw new Error("cannot move a folder into itself");
		}
		const oldParent =
			!node.ParentID || node.ParentID === "root" ? null : String(node.ParentID);
		const target = this.children(parentId).filter((c) => c !== id);
		const at =
			seq === undefined
				? target.length
				: Math.max(0, Math.min(target.length, seq - 1));
		target.splice(at, 0, id);
		this.placeChildren(parentId, target);
		if (oldParent !== parentId)
			this.placeChildren(oldParent, this.children(oldParent));
	}

	// Orders the children of a folder (null = top level): `ordered` first, any child
	// not listed after them in its current order.
	reorderPlaylists(parentId: string | null, ordered: readonly string[]): void {
		const current = this.children(parentId);
		const known = new Set(current);
		for (const id of ordered)
			if (!known.has(id))
				throw new Error(`playlist ${id} is not in that folder`);
		const listed = new Set(ordered);
		this.placeChildren(parentId, [
			...ordered,
			...current.filter((c) => !listed.has(c)),
		]);
	}

	// Deletes a playlist or folder (with everything below it).
	deletePlaylist(id: string): void {
		const node = this.playlist(id);
		const parentId =
			!node.ParentID || node.ParentID === "root" ? null : String(node.ParentID);
		const doomed: string[] = [];
		const walk = (pid: string) => {
			doomed.push(pid);
			for (const c of this.children(pid)) walk(c);
		};
		walk(id);
		for (const pid of doomed) {
			this.remove("djmdSongPlaylist", "PlaylistID", pid);
			this.remove("djmdPlaylist", "ID", pid);
			this.xml.push({ op: "remove", id: pid });
		}
		this.placeChildren(parentId, this.children(parentId));
	}

	private renumberPlaylist(playlistId: string): void {
		const rows = this.all<{ ID: string; TrackNo: number }>(
			"SELECT ID, TrackNo FROM djmdSongPlaylist WHERE PlaylistID = ? ORDER BY TrackNo",
			playlistId,
		);
		rows.forEach((r, i) => {
			this.update("djmdSongPlaylist", String(r.ID), { TrackNo: i + 1 });
		});
	}

	// Makes the playlist hold exactly `contentIds` in that order. Existing rows of
	// kept tracks stay (same id), removed ones are deleted, new ones inserted, and
	// TrackNo is 1..n. The same track twice is allowed.
	setPlaylistTracks(playlistId: string, contentIds: readonly string[]): void {
		if (this.playlist(playlistId).Attribute !== 0) {
			throw new Error("only a normal playlist holds tracks");
		}
		const existing = this.all<{ ID: string; ContentID: string }>(
			"SELECT ID, ContentID FROM djmdSongPlaylist WHERE PlaylistID = ? ORDER BY TrackNo",
			playlistId,
		);
		const pool = new Map<string, string[]>();
		for (const r of existing) {
			const list = pool.get(String(r.ContentID));
			if (list) list.push(String(r.ID));
			else pool.set(String(r.ContentID), [String(r.ID)]);
		}
		const used = new Set<string>();
		contentIds.forEach((contentId, i) => {
			const rowId = pool.get(contentId)?.shift();
			if (rowId !== undefined) {
				used.add(rowId);
				this.update("djmdSongPlaylist", rowId, { TrackNo: i + 1 });
				return;
			}
			if (!this.idExists("djmdContent", "ID", contentId)) {
				throw new Error(`no content ${contentId}`);
			}
			this.insert("djmdSongPlaylist", {
				ID: randomUUID(),
				PlaylistID: playlistId,
				ContentID: contentId,
				TrackNo: i + 1,
			});
		});
		for (const r of existing) {
			if (!used.has(String(r.ID)))
				this.remove("djmdSongPlaylist", "ID", String(r.ID));
		}
		this.xml.push({
			op: "update",
			id: playlistId,
			parentId: this.parentOf(playlistId),
			at: this.now.getTime(),
		});
	}

	// ---- my tags ---------------------------------------------------------------------------

	// The id of the My Tag called `name` (any parent), created under `parentId` when absent.
	ensureMyTag(name: string, parentId: string | null = null): string {
		const row = this.get<{ ID: string }>(
			"SELECT ID FROM djmdMyTag WHERE Name = ? AND Attribute != 1",
			name,
		);
		if (row) return String(row.ID);
		const id = this.newId("djmdMyTag");
		const parent = parentId ?? "root";
		const seq = this.get<{ m: number | null }>(
			"SELECT max(Seq) AS m FROM djmdMyTag WHERE ParentID = ?",
			parent,
		);
		this.insert("djmdMyTag", {
			ID: id,
			Seq: (seq?.m ?? 0) + 1,
			Name: name,
			Attribute: 0,
			ParentID: parent,
		});
		return id;
	}

	// Sets a track's My Tags to exactly `names` (created when missing).
	setMyTags(contentId: string, names: readonly string[]): void {
		const wanted = [...new Set(names)].map((n) => this.ensureMyTag(n));
		const have = this.all<{ ID: string; MyTagID: string }>(
			"SELECT ID, MyTagID FROM djmdSongMyTag WHERE ContentID = ? ORDER BY TrackNo",
			contentId,
		);
		const rowOf = new Map(have.map((r) => [String(r.MyTagID), String(r.ID)]));
		wanted.forEach((tagId, i) => {
			const rowId = rowOf.get(tagId);
			if (rowId !== undefined) {
				this.update("djmdSongMyTag", rowId, { TrackNo: i + 1 });
				rowOf.delete(tagId);
				return;
			}
			this.insert("djmdSongMyTag", {
				ID: randomUUID(),
				MyTagID: tagId,
				ContentID: contentId,
				TrackNo: i + 1,
			});
		});
		for (const rowId of rowOf.values())
			this.remove("djmdSongMyTag", "ID", rowId);
	}

	// ---- cues --------------------------------------------------------------------------------

	// Makes the track's djmdCue rows exactly `cues`: identical cues stay, others are
	// deleted / inserted. Frames are derived (150 per second); MPEG frame columns
	// are written 0 (VERIFY.md).
	setCues(contentId: string, cues: readonly CueInput[]): void {
		const content = this.get<{ UUID: string | null }>(
			"SELECT UUID FROM djmdContent WHERE ID = ?",
			contentId,
		);
		if (!content) throw new Error(`no content ${contentId}`);
		const sig = (c: {
			kind: number;
			startMs: number;
			endMs: number | null;
			color: number | null;
			comment: string | null;
		}) =>
			`${c.kind}\0${c.startMs}\0${c.endMs ?? -1}\0${c.color ?? -1}\0${c.comment ?? ""}`;
		const have = this.all<{
			ID: string;
			Kind: number;
			InMsec: number;
			OutMsec: number | null;
			Color: number | null;
			Comment: string | null;
		}>(
			"SELECT ID, Kind, InMsec, OutMsec, Color, Comment FROM djmdCue WHERE ContentID = ?",
			contentId,
		);
		const pool = new Map<string, string[]>();
		for (const r of have) {
			const k = sig({
				kind: r.Kind ?? 0,
				startMs: r.InMsec ?? 0,
				endMs: r.OutMsec !== null && r.OutMsec >= 0 ? r.OutMsec : null,
				color: r.Color !== null && r.Color >= 0 ? r.Color : null,
				comment: r.Comment || null,
			});
			const list = pool.get(k);
			if (list) list.push(String(r.ID));
			else pool.set(k, [String(r.ID)]);
		}
		for (const c of cues) {
			const endMs = c.endMs ?? null;
			const color = c.color ?? null;
			const comment = c.comment || null;
			const k = sig({
				kind: c.kind,
				startMs: c.startMs,
				endMs,
				color,
				comment,
			});
			if (pool.get(k)?.pop() !== undefined) continue;
			this.insert("djmdCue", {
				ID: this.newId("djmdCue"),
				ContentID: contentId,
				ContentUUID: content.UUID,
				InMsec: c.startMs,
				InFrame: Math.round((c.startMs * 150) / 1000),
				InMpegFrame: 0,
				InMpegAbs: 0,
				OutMsec: endMs ?? -1,
				OutFrame: endMs === null ? 0 : Math.round((endMs * 150) / 1000),
				OutMpegFrame: 0,
				OutMpegAbs: 0,
				Kind: c.kind,
				Color: color ?? -1,
				ColorTableIndex: c.colorTableIndex ?? null,
				ActiveLoop: c.activeLoop ? 1 : 0,
				Comment: comment,
				BeatLoopSize: c.beatLoopSize ?? 0,
				CueMicrosec: c.startMs * 1000,
			});
		}
		for (const ids of pool.values())
			for (const id of ids) this.remove("djmdCue", "ID", id);
	}
}

// A guarded writer on one master.db. Open it only when Rekordbox is closed.
export class MasterWriter {
	readonly path: string;
	readonly db: MasterDb;
	readonly schema: SchemaInfo;
	readonly backup: Backup | null;

	private constructor(
		path: string,
		db: MasterDb,
		schema: SchemaInfo,
		backup: Backup | null,
	) {
		this.path = path;
		this.db = db;
		this.schema = schema;
		this.backup = backup;
	}

	// Refuses (WriteRefused) unless: Rekordbox is not running, the schema has every
	// required column and a DBVersion on the allowlist, and Cloud Library Sync is not
	// detected on. Then takes the backup and opens the database for writing.
	static async open(
		path: string,
		options: WriteOptions = {},
	): Promise<MasterWriter> {
		if (!options.ignoreRunning) {
			let running: boolean;
			try {
				running = await isRekordboxRunning();
			} catch (error) {
				throw new WriteRefused(
					"unknown-process",
					`cannot tell whether Rekordbox is running: ${(error as Error).message}`,
				);
			}
			if (running)
				throw new WriteRefused(
					"running",
					"Rekordbox is running; close it first",
				);
		}
		const db = openMasterDb(path, { readonly: false, key: options.key });
		try {
			const schema = probeSchema(db);
			if (!schema.complete) {
				throw new WriteRefused(
					"schema",
					`master.db lacks columns: ${JSON.stringify(schema.missing)}`,
				);
			}
			const allowed = options.allowedVersions ?? WRITE_ALLOWED_DB_VERSIONS;
			if (!options.allowUntested && !isWriteSupported(schema, allowed)) {
				throw new WriteRefused(
					"schema",
					`master.db DBVersion ${schema.dbVersion ?? "(none)"} is not on the write allowlist [${allowed.join(", ")}]`,
				);
			}
			if (!options.allowCloudSync) {
				const cloud = cloudLibrarySyncEnabled(db, options.agentOptions);
				if (cloud.state === "on") {
					throw new WriteRefused(
						"cloud-sync",
						`Cloud Library Sync looks enabled: ${cloud.evidence.join("; ")}`,
					);
				}
			}
			const keep = options.backupKeep ?? 5;
			const backup = keep > 0 ? await backupMasterDb(path, keep) : null;
			return new MasterWriter(path, db, schema, backup);
		} catch (error) {
			db.close();
			throw error;
		}
	}

	// Runs `fn` in one immediate transaction (all or nothing), then keeps
	// masterPlaylists6.xml in step with the playlist changes.
	async transaction<T>(
		fn: (tx: WriteTx) => T,
	): Promise<{ result: T; summary: WriteSummary }> {
		const run = this.db.transaction(() => {
			const tx = new WriteTx(this.db, new Date());
			const result = fn(tx);
			const summary = tx.finish();
			return { result, summary, xml: tx.xml };
		});
		const { result, summary, xml } = run.immediate();
		await applyMasterPlaylistsXml(dirname(this.path), xml);
		return { result, summary };
	}

	close(): void {
		this.db.close();
	}
}

// Rewrites the PPTH tag of a track's ANLZ files (.DAT/.EXT/.2EX that exist) for a
// relinked file. Each file is replaced atomically.
export async function relinkAnlzPath(
	shareDir: string,
	analysisDataPath: string,
	newPath: string,
): Promise<string[]> {
	const done: string[] = [];
	for (const kind of ["DAT", "EXT", "2EX"] as const) {
		const file = anlzPathFor(shareDir, analysisDataPath, kind);
		try {
			await stat(file);
		} catch {
			continue;
		}
		const next = withAnlzPath(await readFile(file), toRekordboxPath(newPath));
		await writeFile(`${file}.tv-tmp`, next);
		await rename(`${file}.tv-tmp`, file);
		done.push(file);
	}
	return done;
}
