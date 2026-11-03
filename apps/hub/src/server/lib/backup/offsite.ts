import { statSync } from "node:fs";
import { eq } from "@fcalell/plugin-db/orm";
import {
	audioKey,
	BufferSource,
	EncryptedSource,
	expired,
	FileSource,
	keyCheck,
	MANIFEST_KEY,
	type Manifest,
	type ManifestFile,
	packManifest,
	parseBackupName,
} from "@trackvault/core/backup";
import {
	RateLimiter,
	S3Client,
	type UploadStore,
	upload,
} from "@trackvault/core/s3";
import { offsiteObjects, offsiteUploads } from "../../../schema/index.ts";
import { db } from "../db.ts";
import { statement } from "../raw.ts";
import type { SettingsRow } from "../settings.ts";
import {
	type BackupMeta,
	type LocalBackup,
	readMeta,
	writeMeta,
} from "./files.ts";
import { policyOf } from "./make.ts";

// The offsite side: a client built from the settings, uploads of database backups
// and of library files, the manifest, and the remote retention.

export function offsiteConfigured(s: SettingsRow): boolean {
	return Boolean(
		s.offsiteBucket &&
			s.offsiteAccessKey &&
			s.offsiteSecretKey &&
			s.offsiteRegion,
	);
}

export interface Remote {
	client: S3Client;
	limiter: RateLimiter;
	prefix: string;
	encrypt: boolean;
	key: string | null;
}

export function connect(s: SettingsRow): Remote {
	if (!offsiteConfigured(s))
		throw new Error(
			"Offsite storage is not set up: the bucket and both keys are needed",
		);
	if (s.offsiteEncrypt && !s.offsiteKey)
		throw new Error("Encryption is on but there is no encryption key");
	const limiter = new RateLimiter(s.offsiteBandwidthKbps * 1024);
	return {
		client: new S3Client(
			{
				endpoint: s.offsiteEndpoint ?? "",
				region: s.offsiteRegion,
				bucket: s.offsiteBucket as string,
				accessKeyId: s.offsiteAccessKey as string,
				secretAccessKey: s.offsiteSecretKey as string,
				virtualHosted: s.offsiteVirtualHosted,
			},
			limiter,
		),
		limiter,
		prefix: (s.offsitePrefix ?? "").replace(/^\/+|\/+$/g, ""),
		encrypt: s.offsiteEncrypt,
		key: s.offsiteEncrypt ? s.offsiteKey : null,
	};
}

export const rk = (remote: Remote, name: string): string =>
	remote.prefix ? `${remote.prefix}/${name}` : name;

// Stores the state of a multipart upload in the database, so a restart continues it.
function storeFor(key: string): UploadStore {
	return {
		load() {
			const row = db()
				.select()
				.from(offsiteUploads)
				.where(eq(offsiteUploads.key, key))
				.get();
			return row
				? {
						uploadId: row.uploadId,
						partSize: row.partSize,
						size: row.size,
						version: row.version,
						salt: row.salt ?? undefined,
					}
				: undefined;
		},
		save(state) {
			db()
				.insert(offsiteUploads)
				.values({
					key,
					...state,
					salt: state.salt ?? null,
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: offsiteUploads.key,
					set: { ...state, salt: state.salt ?? null, updatedAt: new Date() },
				})
				.run();
		},
		clear() {
			db().delete(offsiteUploads).where(eq(offsiteUploads.key, key)).run();
		},
	};
}

interface PutOptions {
	signal: AbortSignal;
	meta: Record<string, string>;
	version: string;
	onBytes?: (sent: number) => void;
}

// One object from a file: encrypted when the remote says so, a single PUT or a
// multipart upload that continues where a stopped one left off.
async function putFile(
	remote: Remote,
	key: string,
	path: string,
	options: PutOptions,
): Promise<number> {
	const store = storeFor(key);
	const file = await FileSource.open(path);
	try {
		const saved = store.load();
		const source = remote.key
			? new EncryptedSource(file, remote.key, saved?.salt)
			: file;
		await upload(remote.client, key, source, {
			meta: { ...options.meta, encrypted: remote.key ? "1" : "0" },
			version: options.version,
			store,
			signal: options.signal,
			onBytes: options.onBytes,
		});
		return source.size;
	} finally {
		await file.close();
	}
}

// -- database backups -------------------------------------------------------

export const dbKey = (remote: Remote, name: string): string =>
	rk(remote, `db/${name}${remote.key ? ".enc" : ""}`);

// Sends a local backup that is not offsite yet (or was sent under the other
// encryption choice); records it in the backup's sidecar.
export async function uploadBackup(
	remote: Remote,
	backup: LocalBackup,
	signal: AbortSignal,
): Promise<boolean> {
	const meta: BackupMeta | null = backup.meta ?? readMeta(backup.path);
	if (meta?.offsite && meta.offsite.encrypted === Boolean(remote.key))
		return false;
	const key = dbKey(remote, backup.name);
	await putFile(remote, key, backup.path, {
		signal,
		version: meta?.sha256 ?? String(backup.size),
		meta: {
			takenat: backup.at.toISOString(),
			...(meta ? { sha256: meta.sha256 } : {}),
		},
	});
	if (meta) {
		writeMeta(backup.path, {
			...meta,
			offsite: {
				key,
				uploadedAt: new Date().toISOString(),
				encrypted: Boolean(remote.key),
			},
		});
	}
	return true;
}

export interface RemoteBackup {
	key: string;
	name: string;
	at: Date;
	size: number;
	encrypted: boolean;
}

export async function listRemoteBackups(
	remote: Remote,
	signal?: AbortSignal,
): Promise<RemoteBackup[]> {
	const out: RemoteBackup[] = [];
	for await (const object of remote.client.list(rk(remote, "db/"), signal)) {
		const name = object.key.slice(object.key.lastIndexOf("/") + 1);
		const parsed = parseBackupName(name);
		if (!parsed) continue;
		out.push({
			key: object.key,
			name,
			at: parsed.at,
			size: object.size,
			encrypted: parsed.encrypted,
		});
	}
	return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

// Deletes the remote database backups the keep policy lets go of.
export async function pruneRemote(
	remote: Remote,
	s: SettingsRow,
	signal: AbortSignal,
): Promise<number> {
	const items = await listRemoteBackups(remote, signal);
	if (items.length === 0) return 0;
	const gone = expired(
		items.map((item) => ({ id: item.key, at: item.at })),
		policyOf(s),
	);
	for (const item of gone) await remote.client.delete(item.id, signal);
	return gone.length;
}

// -- the library ------------------------------------------------------------

export interface LibraryRow {
	audioHash: string;
	path: string;
	size: number;
	mtimeMs: number;
	fileHash: string;
}

const extOf = (path: string): string => {
	const dot = path.lastIndexOf(".");
	return dot < 0 ? "bin" : path.slice(dot + 1).toLowerCase();
};

// One file per track that is on disk and has been hashed.
export function libraryRows(): LibraryRow[] {
	return statement(
		`SELECT t.audio_hash AS audioHash, f.path AS path, f.size AS size,
		        f.mtime_ms AS mtimeMs, f.file_hash AS fileHash
		   FROM files f JOIN tracks t ON t.id = f.track_id
		  WHERE f.state = 'ok' AND f.file_hash IS NOT NULL
		  GROUP BY t.id HAVING f.id = MIN(f.id)
		  ORDER BY f.path`,
	).all() as LibraryRow[];
}

export const objectKeyOf = (row: LibraryRow): string =>
	audioKey({ audioHash: row.audioHash, ext: extOf(row.path) });

export interface SyncResult {
	uploaded: number;
	skipped: number;
	changed: number;
	failed: number;
	bytes: number;
	firstError: string | null;
	// Rows whose object is in the bucket after the pass.
	present: LibraryRow[];
}

interface SyncOptions {
	root: string;
	signal: AbortSignal;
	progress: (done: number, total: number, message: string) => void;
	refreshLimit: () => void;
}

const CONCURRENCY = 3;

const mb = (bytes: number): string =>
	bytes >= 1e9
		? `${(bytes / 1e9).toFixed(1)} GB`
		: `${Math.round(bytes / 1e6)} MB`;

// Brings the bucket's audio up to the library: for each track an object
// `audio/<audio hash>.<ext>` holding the file as it is now. The local table of what
// was sent answers most files without a request; the first run after the table was
// lost lists the bucket and reads the metadata of those present, so only files that
// differ travel. Nothing in the bucket is ever deleted by this.
export async function syncLibrary(
	remote: Remote,
	options: SyncOptions,
): Promise<SyncResult> {
	const { signal } = options;
	const rows = libraryRows();
	const encrypted = Boolean(remote.key);
	const known = new Map(
		db()
			.select()
			.from(offsiteObjects)
			.all()
			.map((row) => [row.key, row] as const),
	);
	const result: SyncResult = {
		uploaded: 0,
		skipped: 0,
		changed: 0,
		failed: 0,
		bytes: 0,
		firstError: null,
		present: [],
	};
	const record = (key: string, row: LibraryRow, size: number): void => {
		db()
			.insert(offsiteObjects)
			.values({
				key,
				fileHash: row.fileHash,
				size,
				encrypted,
				uploadedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: offsiteObjects.key,
				set: {
					fileHash: row.fileHash,
					size,
					encrypted,
					uploadedAt: new Date(),
				},
			})
			.run();
	};
	let todo: LibraryRow[] = [];
	for (const row of rows) {
		const have = known.get(rk(remote, objectKeyOf(row)));
		if (have && have.fileHash === row.fileHash && have.encrypted === encrypted)
			result.present.push(row);
		else todo.push(row);
	}
	result.skipped = result.present.length;
	// Without a record, what the bucket already holds is found by listing it.
	if (todo.length > 0 && known.size < rows.length / 2) {
		options.progress(0, todo.length, "Looking at what the bucket holds");
		const held = new Map<string, number>();
		for await (const object of remote.client.list(rk(remote, "audio/"), signal))
			held.set(object.key, object.size);
		const rest: LibraryRow[] = [];
		for (const row of todo) {
			signal.throwIfAborted();
			const key = rk(remote, objectKeyOf(row));
			const size = held.get(key);
			const expected = encrypted ? encryptedLength(row.size) : row.size;
			if (size === expected) {
				const head = await remote.client.head(key, signal);
				if (
					head?.meta.filehash === row.fileHash &&
					(head.meta.encrypted === "1") === encrypted
				) {
					record(key, row, size);
					result.present.push(row);
					result.skipped++;
					continue;
				}
			}
			rest.push(row);
		}
		todo = rest;
	}
	const total = todo.length;
	let done = 0;
	let left = todo.reduce((sum, row) => sum + row.size, 0);
	const window: { at: number; bytes: number }[] = [];
	const speed = (): string => {
		const now = Date.now();
		while (window.length > 0 && now - (window[0]?.at ?? now) > 15_000)
			window.shift();
		const first = window[0];
		if (!first || now - first.at < 1000) return "";
		const sum = window.reduce((n, w) => n + w.bytes, 0);
		return ` · ${(sum / ((now - first.at) / 1000) / 1e6).toFixed(1)} MB/s`;
	};
	const report = (): void =>
		options.progress(
			done,
			total,
			`${done} of ${total} files · ${mb(Math.max(0, left))} left${speed()}`,
		);
	if (total > 0) report();
	let consecutive = 0;
	const queue = [...todo];
	const worker = async (): Promise<void> => {
		for (;;) {
			signal.throwIfAborted();
			const row = queue.shift();
			if (!row) return;
			options.refreshLimit();
			const path = `${options.root}/${row.path}`;
			try {
				const stat = statSync(path);
				if (
					stat.size !== row.size ||
					Math.abs(stat.mtimeMs - row.mtimeMs) >= 1
				) {
					// Changed since the last scan: its hash is stale. The next scan fixes it.
					result.changed++;
					left -= row.size;
					done++;
					continue;
				}
				const key = rk(remote, objectKeyOf(row));
				let last = 0;
				const sent = await putFile(remote, key, path, {
					signal,
					version: row.fileHash,
					meta: { filehash: row.fileHash, audiohash: row.audioHash },
					onBytes: (n) => {
						window.push({ at: Date.now(), bytes: n - last });
						left -= n - last;
						last = n;
					},
				});
				record(key, row, sent);
				result.present.push(row);
				result.uploaded++;
				result.bytes += row.size;
				consecutive = 0;
			} catch (error) {
				if (signal.aborted) throw error;
				result.failed++;
				result.firstError ??= `${row.path}: ${(error as Error).message}`;
				// Every file refused in a row is the storage, not the files.
				if (++consecutive >= 5)
					throw new Error(`Uploads keep failing (${(error as Error).message})`);
			}
			done++;
			report();
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	return result;
}

// The ciphertext size of a file (core/backup/crypto), without importing the layout here.
const encryptedLength = (plain: number): number =>
	24 + plain + 16 * Math.max(1, Math.ceil(plain / (1024 * 1024)));

// -- the manifest -----------------------------------------------------------

export async function writeManifest(
	remote: Remote,
	present: LibraryRow[],
	signal: AbortSignal,
): Promise<number> {
	const databases = (await listRemoteBackups(remote, signal)).map((item) => ({
		key: item.key.slice(remote.prefix ? remote.prefix.length + 1 : 0),
		size: item.size,
		takenAt: item.at.toISOString(),
		compression: parseBackupName(item.name)?.compression ?? "none",
		encrypted: item.encrypted,
	}));
	const files: ManifestFile[] = present.map((row) => ({
		path: row.path,
		audioHash: row.audioHash,
		fileHash: row.fileHash,
		ext: extOf(row.path),
		size: row.size,
	}));
	const manifest: Manifest = {
		format: 1,
		createdAt: new Date().toISOString(),
		encrypted: Boolean(remote.key),
		keyCheck: remote.key ? keyCheck(remote.key) : undefined,
		databases,
		files,
	};
	const packed = packManifest(manifest);
	const source = remote.key
		? new EncryptedSource(new BufferSource(packed), remote.key)
		: new BufferSource(packed);
	await remote.client.put(
		rk(remote, MANIFEST_KEY),
		await source.read(0, source.size),
		{
			signal,
			meta: {
				encrypted: remote.key ? "1" : "0",
				keycheck: manifest.keyCheck ?? "",
				files: String(files.length),
			},
		},
	);
	return files.length;
}

// What the bucket's tables say is offsite, for the Backups place.
export function offsiteTotals(): { files: number; bytes: number } {
	const row = statement(
		"SELECT count(*) AS files, coalesce(sum(size), 0) AS bytes FROM offsite_objects",
	).get() as { files: number; bytes: number };
	return row;
}
