import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { RbSnapshot } from "@trackvault/core/rekordbox/sync";
import type {
	ExportChange,
	FileState,
	SnapshotRef,
} from "@trackvault/core/sync";
import Database from "better-sqlite3-multiple-ciphers";

// The agent's own SQLite file: manifest cursor, path map and file states, the Rekordbox
// base snapshot and links, pending queues. Nothing here is synced to the hub.

export interface FileRow {
	trackId: string;
	audioHash: string;
	fileHash: string;
	size: number;
	// Where the hub wants the file (relative to the root, "/" separators).
	relPath: string;
	// What is on disk now (null: nothing).
	haveRelPath: string | null;
	haveFileHash: string | null;
	state: FileState;
	attempts: number;
	nextAt: number;
	error: string | null;
	dirty: number;
	stateAt: string;
}

export interface LinkRow {
	contentId: string;
	trackId: string;
	via: "path" | "hash";
	path: string;
	// 1 when the content points into the replica root (the agent relinks it on a move).
	managed: number;
}

export interface UploadRow {
	path: string;
	root: string;
	size: number;
	mtimeMs: number;
	audioHash: string | null;
	fileHash: string | null;
	state: "new" | "hashed" | "known" | "uploading" | "done" | "failed";
	uploadId: string | null;
	attempts: number;
	nextAt: number;
	error: string | null;
}

export interface DesiredPlaylist {
	hubId: string;
	// The device's playlist id once linked.
	rbId: string | null;
	change: Extract<ExportChange, { kind: "playlist.set" }>;
}

const SCHEMA = `
create table if not exists kv(key text primary key, value text not null);
create table if not exists files(
	trackId text primary key,
	audioHash text not null,
	fileHash text not null,
	size integer not null,
	relPath text not null,
	haveRelPath text,
	haveFileHash text,
	state text not null,
	attempts integer not null default 0,
	nextAt integer not null default 0,
	error text,
	dirty integer not null default 1,
	stateAt text not null
);
create index if not exists files_state on files(state, nextAt);
create index if not exists files_audio on files(audioHash);
create table if not exists rb_links(
	contentId text primary key,
	trackId text not null,
	via text not null,
	path text not null,
	managed integer not null default 0
);
create index if not exists rb_links_track on rb_links(trackId);
create table if not exists rb_playlists(
	hubId text primary key,
	rbId text,
	json text not null
);
create table if not exists rb_deferred(trackId text primary key, json text not null);
create table if not exists rb_hashes(
	path text primary key,
	size integer not null,
	mtimeMs integer not null,
	audioHash text not null,
	fileHash text not null
);
create table if not exists anlz_sent(
	trackId text not null,
	kind text not null,
	hash text not null,
	primary key(trackId, kind)
);
create table if not exists anlz_hashes(
	path text primary key,
	size integer not null,
	mtimeMs integer not null,
	hash text not null
);
create table if not exists rb_base(
	id integer primary key check(id = 1),
	refId text not null,
	version integer not null,
	data blob not null
);
create table if not exists uploads(
	path text primary key,
	root text not null,
	size integer not null,
	mtimeMs integer not null,
	audioHash text,
	fileHash text,
	state text not null,
	uploadId text,
	attempts integer not null default 0,
	nextAt integer not null default 0,
	error text
);
create index if not exists uploads_state on uploads(state, nextAt);
`;

export class State {
	readonly db: Database.Database;

	constructor(path: string) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.pragma("journal_mode = WAL");
		this.db.pragma("synchronous = NORMAL");
		this.db.pragma("busy_timeout = 5000");
		this.db.exec(SCHEMA);
		// A crash mid-download leaves rows "downloading": they are pending again.
		this.db
			.prepare(
				"update files set state = 'pending', dirty = 1 where state = 'downloading'",
			)
			.run();
		this.db
			.prepare("update uploads set state = 'hashed' where state = 'uploading'")
			.run();
	}

	close(): void {
		this.db.close();
	}

	tx<T>(fn: () => T): T {
		return this.db.transaction(fn)();
	}

	// ---- kv ----------------------------------------------------------------------

	get<T>(key: string): T | null {
		const row = this.db
			.prepare("select value from kv where key = ?")
			.get(key) as { value: string } | undefined;
		return row ? (JSON.parse(row.value) as T) : null;
	}

	set(key: string, value: unknown): void {
		if (value === null || value === undefined) {
			this.db.prepare("delete from kv where key = ?").run(key);
			return;
		}
		this.db
			.prepare(
				"insert into kv(key, value) values(?, ?) on conflict(key) do update set value = excluded.value",
			)
			.run(key, JSON.stringify(value));
	}

	get cursor(): string | null {
		return this.get<string>("manifestCursor");
	}
	set cursor(value: string | null) {
		this.set("manifestCursor", value);
	}

	// ---- files ---------------------------------------------------------------------

	file(trackId: string): FileRow | undefined {
		return this.db
			.prepare("select * from files where trackId = ?")
			.get(trackId) as FileRow | undefined;
	}

	filesByAudioHash(audioHash: string): FileRow[] {
		return this.db
			.prepare("select * from files where audioHash = ?")
			.all(audioHash) as FileRow[];
	}

	filesBySize(size: number): FileRow[] {
		return this.db
			.prepare("select * from files where size = ?")
			.all(size) as FileRow[];
	}

	allFiles(): FileRow[] {
		return this.db.prepare("select * from files").all() as FileRow[];
	}

	setFileState(
		trackId: string,
		state: FileState,
		patch: Partial<
			Pick<
				FileRow,
				"haveRelPath" | "haveFileHash" | "attempts" | "nextAt" | "error"
			>
		> = {},
	): void {
		const cols = ["state = @state", "dirty = 1", "stateAt = @at"];
		for (const key of Object.keys(patch)) cols.push(`${key} = @${key}`);
		this.db
			.prepare(`update files set ${cols.join(", ")} where trackId = @trackId`)
			.run({ trackId, state, at: new Date().toISOString(), ...patch });
	}

	// The next downloads due: pending / failed / missing rows whose backoff has passed.
	dueFiles(limit: number, now = Date.now()): FileRow[] {
		return this.db
			.prepare(
				"select * from files where state in ('pending','failed','missing') and nextAt <= ? order by attempts, relPath limit ?",
			)
			.all(now, limit) as FileRow[];
	}

	nextFileAt(): number | null {
		const row = this.db
			.prepare(
				"select min(nextAt) as at from files where state in ('pending','failed','missing')",
			)
			.get() as { at: number | null };
		return row.at;
	}

	dirtyFiles(limit: number): FileRow[] {
		return this.db
			.prepare("select * from files where dirty = 1 limit ?")
			.all(limit) as FileRow[];
	}

	markReported(trackIds: string[]): void {
		const mark = this.db.prepare(
			"update files set dirty = 0 where trackId = ?",
		);
		const drop = this.db.prepare(
			"delete from files where trackId = ? and state = 'trashed'",
		);
		this.tx(() => {
			for (const id of trackIds) {
				mark.run(id);
				drop.run(id);
			}
		});
	}

	markAllDirty(): void {
		this.db.prepare("update files set dirty = 1").run();
	}

	fileCounts(): {
		pending: number;
		downloading: number;
		failed: number;
		ok: number;
		bytesPending: number;
	} {
		const rows = this.db
			.prepare(
				"select state, count(*) as n, sum(size) as bytes from files group by state",
			)
			.all() as { state: FileState; n: number; bytes: number | null }[];
		const out = {
			pending: 0,
			downloading: 0,
			failed: 0,
			ok: 0,
			bytesPending: 0,
		};
		for (const r of rows) {
			if (r.state === "ok") out.ok += r.n;
			else if (r.state === "downloading") out.downloading += r.n;
			else if (r.state === "failed") out.failed += r.n;
			else if (r.state === "pending" || r.state === "missing")
				out.pending += r.n;
			if (r.state !== "ok" && r.state !== "trashed")
				out.bytesPending += r.bytes ?? 0;
		}
		return out;
	}

	// ---- Rekordbox base ---------------------------------------------------------------

	base(): { ref: SnapshotRef; snapshot: RbSnapshot } | null {
		const row = this.db.prepare("select * from rb_base where id = 1").get() as
			| { refId: string; version: number; data: Buffer }
			| undefined;
		if (!row) return null;
		return {
			ref: { id: row.refId, version: row.version },
			snapshot: JSON.parse(gunzipSync(row.data).toString("utf8")) as RbSnapshot,
		};
	}

	saveBase(ref: SnapshotRef, snapshot: RbSnapshot): void {
		this.db
			.prepare(
				"insert into rb_base(id, refId, version, data) values(1, ?, ?, ?) on conflict(id) do update set refId = excluded.refId, version = excluded.version, data = excluded.data",
			)
			.run(
				ref.id,
				ref.version,
				gzipSync(Buffer.from(JSON.stringify(snapshot))),
			);
	}

	dropBase(): void {
		this.db.prepare("delete from rb_base").run();
	}

	baseRef(): SnapshotRef | null {
		const row = this.db
			.prepare("select refId, version from rb_base where id = 1")
			.get() as { refId: string; version: number } | undefined;
		return row ? { id: row.refId, version: row.version } : null;
	}

	// ---- links ----------------------------------------------------------------------------

	links(): LinkRow[] {
		return this.db.prepare("select * from rb_links").all() as LinkRow[];
	}

	linkByTrack(trackId: string): LinkRow | undefined {
		return this.db
			.prepare("select * from rb_links where trackId = ?")
			.get(trackId) as LinkRow | undefined;
	}

	putLink(link: LinkRow): void {
		this.db
			.prepare(
				"insert into rb_links(contentId, trackId, via, path, managed) values(@contentId, @trackId, @via, @path, @managed) on conflict(contentId) do update set trackId = excluded.trackId, via = excluded.via, path = excluded.path, managed = excluded.managed",
			)
			.run(link);
	}

	dropLink(contentId: string): void {
		this.db.prepare("delete from rb_links where contentId = ?").run(contentId);
	}

	// ---- desired playlists and deferred adds ---------------------------------------------------

	playlists(): DesiredPlaylist[] {
		const rows = this.db.prepare("select * from rb_playlists").all() as {
			hubId: string;
			rbId: string | null;
			json: string;
		}[];
		return rows.map((r) => ({
			hubId: r.hubId,
			rbId: r.rbId,
			change: JSON.parse(r.json) as DesiredPlaylist["change"],
		}));
	}

	putPlaylist(p: DesiredPlaylist): void {
		this.db
			.prepare(
				"insert into rb_playlists(hubId, rbId, json) values(?, ?, ?) on conflict(hubId) do update set rbId = excluded.rbId, json = excluded.json",
			)
			.run(p.hubId, p.rbId, JSON.stringify(p.change));
	}

	dropPlaylist(hubId: string): void {
		this.db.prepare("delete from rb_playlists where hubId = ?").run(hubId);
	}

	deferred(): Extract<ExportChange, { kind: "track.add" }>[] {
		const rows = this.db.prepare("select json from rb_deferred").all() as {
			json: string;
		}[];
		return rows.map((r) => JSON.parse(r.json));
	}

	putDeferred(change: Extract<ExportChange, { kind: "track.add" }>): void {
		this.db
			.prepare(
				"insert into rb_deferred(trackId, json) values(?, ?) on conflict(trackId) do update set json = excluded.json",
			)
			.run(change.trackId, JSON.stringify(change));
	}

	dropDeferred(trackId: string): void {
		this.db.prepare("delete from rb_deferred where trackId = ?").run(trackId);
	}

	// ---- uploads --------------------------------------------------------------------------------

	upload(path: string): UploadRow | undefined {
		return this.db.prepare("select * from uploads where path = ?").get(path) as
			| UploadRow
			| undefined;
	}

	putUpload(row: UploadRow): void {
		this.db
			.prepare(
				`insert into uploads(path, root, size, mtimeMs, audioHash, fileHash, state, uploadId, attempts, nextAt, error)
				values(@path, @root, @size, @mtimeMs, @audioHash, @fileHash, @state, @uploadId, @attempts, @nextAt, @error)
				on conflict(path) do update set root = excluded.root, size = excluded.size, mtimeMs = excluded.mtimeMs,
				audioHash = excluded.audioHash, fileHash = excluded.fileHash, state = excluded.state,
				uploadId = excluded.uploadId, attempts = excluded.attempts, nextAt = excluded.nextAt, error = excluded.error`,
			)
			.run(row);
	}

	dueUploads(limit: number, now = Date.now()): UploadRow[] {
		return this.db
			.prepare(
				"select * from uploads where state in ('new','hashed','failed') and nextAt <= ? order by state desc, path limit ?",
			)
			.all(now, limit) as UploadRow[];
	}

	nextUploadAt(): number | null {
		const row = this.db
			.prepare(
				"select min(nextAt) as at from uploads where state in ('new','hashed','failed')",
			)
			.get() as { at: number | null };
		return row.at;
	}

	uploadCounts(): {
		queued: number;
		uploading: number;
		failed: number;
		done: number;
	} {
		const rows = this.db
			.prepare("select state, count(*) as n from uploads group by state")
			.all() as { state: UploadRow["state"]; n: number }[];
		const out = { queued: 0, uploading: 0, failed: 0, done: 0 };
		for (const r of rows) {
			if (r.state === "uploading") out.uploading += r.n;
			else if (r.state === "failed") out.failed += r.n;
			else if (r.state === "done" || r.state === "known") out.done += r.n;
			else out.queued += r.n;
		}
		return out;
	}
}
