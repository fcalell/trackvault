import { type FSWatcher, watch } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { hashFile } from "@trackvault/core/hash";
import { isUnderRoot } from "@trackvault/core/paths";
import type { Context } from "../context.ts";
import { HubError } from "../hub/client.ts";
import type { UploadRow } from "../state.ts";
import { backoffMs, errorMessage, pool, Runner } from "../util.ts";

const STABLE_MS = 3000;
const RESCAN_MS = 10 * 60_000;

// Upload mode: watch folders, hash new audio files, ask the hub whether it already has
// them, and send the rest to the inbox in resumable chunks.
export class UploadEngine {
	private readonly ctx: Context;
	private readonly runner: Runner;
	private watchers: FSWatcher[] = [];
	private readonly pending = new Map<string, NodeJS.Timeout>();
	private rescanTimer: NodeJS.Timeout | null = null;
	private retryTimer: NodeJS.Timeout | null = null;

	constructor(ctx: Context) {
		this.ctx = ctx;
		this.runner = new Runner(
			() => this.cycle(),
			(e) => this.ctx.log.error(`upload cycle failed: ${errorMessage(e)}`),
		);
	}

	async start(): Promise<void> {
		const { config, log } = this.ctx;
		for (const dir of config.watch) {
			if (
				config.localRoot &&
				(isUnderRoot(config.localRoot, dir) ||
					isUnderRoot(dir, config.localRoot))
			) {
				log.error(`watch folder ${dir} overlaps the replica root; skipped`);
				continue;
			}
			this.watchDir(dir);
		}
		await this.rescan();
		this.rescanTimer = setInterval(() => void this.rescan(), RESCAN_MS);
		this.rescanTimer.unref();
	}

	async stop(): Promise<void> {
		if (this.rescanTimer) clearInterval(this.rescanTimer);
		if (this.retryTimer) clearTimeout(this.retryTimer);
		for (const w of this.watchers) w.close();
		for (const t of this.pending.values()) clearTimeout(t);
		this.pending.clear();
		await this.runner.whenIdle();
	}

	kick(): void {
		this.runner.kick();
	}

	status() {
		return this.ctx.state.uploadCounts();
	}

	// ---- watching -------------------------------------------------------------------

	private isAudio(path: string): boolean {
		return this.ctx.config.extensions.includes(extname(path).toLowerCase());
	}

	private rootOf(path: string): string | null {
		return this.ctx.config.watch.find((w) => isUnderRoot(w, path)) ?? null;
	}

	private watchDir(dir: string): void {
		const { log } = this.ctx;
		try {
			const watcher = watch(
				dir,
				{ recursive: true, persistent: true },
				(_event, name) => {
					if (!name) return;
					const path = join(dir, name.toString());
					if (this.isAudio(path)) this.debounce(path);
				},
			);
			watcher.on("error", (e) => log.warn(`watch ${dir}: ${errorMessage(e)}`));
			this.watchers.push(watcher);
			log.info(`watching ${dir}`);
		} catch (error) {
			log.warn(
				`cannot watch ${dir}: ${errorMessage(error)} (the periodic rescan still covers it)`,
			);
		}
	}

	private debounce(path: string): void {
		const old = this.pending.get(path);
		if (old) clearTimeout(old);
		const timer = setTimeout(() => {
			this.pending.delete(path);
			void this.consider(path, true);
		}, STABLE_MS);
		timer.unref();
		this.pending.set(path, timer);
	}

	private async rescan(): Promise<void> {
		const { config, log } = this.ctx;
		let seen = 0;
		const walk = async (dir: string): Promise<void> => {
			let entries: import("node:fs").Dirent[];
			try {
				entries = await readdir(dir, { withFileTypes: true });
			} catch (error) {
				log.warn(`scan ${dir}: ${errorMessage(error)}`);
				return;
			}
			for (const e of entries) {
				if (this.ctx.signal.aborted) return;
				const full = join(dir, e.name);
				if (e.isDirectory()) {
					if (e.name.startsWith(".")) continue;
					await walk(full);
				} else if (e.isFile() && this.isAudio(full)) {
					seen++;
					await this.consider(full, false);
				}
			}
		};
		for (const dir of config.watch) await walk(dir);
		if (seen > 0) log.debug(`upload scan: ${seen} audio files`);
		this.kick();
	}

	// Queues a file when it is new or changed. `fresh` (from an fs event) waits until the
	// file stopped growing; a scan trusts files older than a few seconds.
	private async consider(path: string, fresh: boolean): Promise<void> {
		const { state } = this.ctx;
		const root = this.rootOf(path);
		if (!root) return;
		let first: Awaited<ReturnType<typeof stat>>;
		try {
			first = await stat(path);
		} catch {
			return;
		}
		if (!first.isFile()) return;
		if (Date.now() - first.mtimeMs < STABLE_MS) {
			this.debounce(path);
			return;
		}
		if (fresh) {
			await new Promise((r) => setTimeout(r, 500));
			const second = await stat(path).catch(() => null);
			if (
				!second ||
				second.size !== first.size ||
				second.mtimeMs !== first.mtimeMs
			) {
				this.debounce(path);
				return;
			}
		}
		const row = state.upload(path);
		if (
			row &&
			row.size === first.size &&
			row.mtimeMs === Math.floor(first.mtimeMs)
		)
			return;
		state.putUpload({
			path,
			root,
			size: first.size,
			mtimeMs: Math.floor(first.mtimeMs),
			audioHash: null,
			fileHash: null,
			state: "new",
			uploadId: null,
			attempts: 0,
			nextAt: 0,
			error: null,
		});
		this.kick();
	}

	// ---- pipeline -------------------------------------------------------------------------

	private async cycle(): Promise<void> {
		const { state, hub, log, config, signal } = this.ctx;
		for (let rounds = 0; rounds < 10_000 && !signal.aborted; rounds++) {
			const rows = state.dueUploads(200);
			if (rows.length === 0) break;

			// 1. hash what is new
			const fresh = rows.filter(
				(r) => r.state === "new" || (r.state === "failed" && !r.audioHash),
			);
			const hashing = fresh.length;
			await pool(2, async () => {
				for (;;) {
					const row = fresh.pop();
					if (!row) return;
					await this.hash(row);
				}
			});

			// 2. ask the hub which audio it already holds
			const hashed = state
				.dueUploads(200)
				.filter((r) => r.state === "hashed" && r.audioHash && r.fileHash);
			if (hashed.length > 0) {
				try {
					const { known } = await hub.inboxCheck({
						items: hashed.map((r) => ({
							audioHash: r.audioHash as string,
							fileHash: r.fileHash as string,
						})),
					});
					const set = new Set(known);
					for (const r of hashed)
						if (set.has(r.audioHash as string))
							state.putUpload({ ...r, state: "known" });
					if (set.size > 0)
						log.info(`upload: ${set.size} files already in the library`);
				} catch (error) {
					this.retryLater(errorMessage(error));
					return;
				}
			}

			// 3. send the rest
			const queue = state
				.dueUploads(200)
				.filter(
					(r) =>
						(r.state === "hashed" || r.state === "failed") &&
						r.audioHash &&
						r.fileHash,
				);
			if (queue.length === 0 && hashing === 0 && hashed.length === 0) break;
			await pool(config.uploadConcurrency, async () => {
				for (;;) {
					const row = queue.pop();
					if (!row || signal.aborted) return;
					await this.send(row);
				}
			});
		}
		const next = state.nextUploadAt();
		if (next !== null && next > Date.now())
			this.scheduleRetry(next - Date.now());
		this.ctx.reportSoon();
	}

	private retryLater(why: string): void {
		this.ctx.log.warn(`upload paused: ${why}`);
		this.scheduleRetry(30_000);
	}

	private scheduleRetry(ms: number): void {
		if (this.ctx.signal.aborted) return;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = setTimeout(() => this.kick(), Math.max(1000, ms));
		this.retryTimer.unref();
	}

	private async hash(row: UploadRow): Promise<void> {
		const { state, log } = this.ctx;
		try {
			const now = await stat(row.path);
			if (now.size !== row.size || Math.floor(now.mtimeMs) !== row.mtimeMs) {
				// Changed since queued: requeue with the new stat.
				state.putUpload({
					...row,
					size: now.size,
					mtimeMs: Math.floor(now.mtimeMs),
				});
				return;
			}
			const id = await hashFile(row.path);
			if (!id.framesFound)
				throw new Error("no audio frames found (not a decodable MP3)");
			state.putUpload({
				...row,
				audioHash: id.audioHash,
				fileHash: id.fileHash,
				state: "hashed",
				error: null,
			});
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				state.db.prepare("delete from uploads where path = ?").run(row.path);
				return;
			}
			log.warn(`cannot hash ${row.path}: ${errorMessage(error)}`);
			state.putUpload({
				...row,
				state: "failed",
				attempts: row.attempts + 1,
				nextAt: Date.now() + backoffMs(row.attempts + 1, 5000, 3_600_000),
				error: errorMessage(error),
			});
		}
	}

	private async send(row: UploadRow): Promise<void> {
		const { state, hub, log, settings, signal } = this.ctx;
		const audioHash = row.audioHash as string;
		const fileHash = row.fileHash as string;
		let uploadId: string | null = null;
		try {
			const init = await hub.uploadInit({
				audioHash,
				fileHash,
				size: row.size,
				name: basename(row.path),
				sourceRelPath: relative(row.root, row.path).split(sep).join("/"),
				mtimeMs: row.mtimeMs,
			});
			if (init.status === "exists") {
				state.putUpload({ ...row, state: "done", uploadId: null, error: null });
				return;
			}
			uploadId = init.uploadId;
			state.putUpload({ ...row, state: "uploading", uploadId });
			const chunkSize = Math.min(
				init.chunkSize || settings.chunkSize,
				32 * 1024 * 1024,
			);
			const fh = await open(row.path, "r");
			try {
				const now = await fh.stat();
				if (now.size !== row.size || Math.floor(now.mtimeMs) !== row.mtimeMs) {
					state.putUpload({
						...row,
						state: "new",
						size: now.size,
						mtimeMs: Math.floor(now.mtimeMs),
					});
					await hub.uploadAbort(uploadId).catch(() => {});
					return;
				}
				let offset = init.received;
				const buffer = Buffer.allocUnsafe(
					Math.min(chunkSize, Math.max(1, row.size)),
				);
				while (offset < row.size) {
					if (signal.aborted) {
						state.putUpload({ ...row, state: "hashed", uploadId });
						return;
					}
					const want = Math.min(buffer.length, row.size - offset);
					const { bytesRead } = await fh.read(buffer, 0, want, offset);
					if (bytesRead === 0) throw new Error("file shrank while uploading");
					try {
						const res = await hub.uploadChunk(
							uploadId,
							offset,
							buffer.subarray(0, bytesRead),
							signal,
						);
						offset = res.received;
					} catch (error) {
						if (error instanceof HubError && error.code === "offset-mismatch") {
							const received = Number(error.detail.received);
							if (
								Number.isInteger(received) &&
								received >= 0 &&
								received <= row.size
							) {
								offset = received;
								continue;
							}
						}
						throw error;
					}
				}
			} finally {
				await fh.close();
			}
			const done = await hub.uploadComplete(uploadId, { fileHash, audioHash });
			log.info(`uploaded ${basename(row.path)} (${done.status})`);
			state.putUpload({ ...row, state: "done", uploadId: null, error: null });
		} catch (error) {
			if (signal.aborted) return;
			if (
				error instanceof HubError &&
				error.code === "hash-mismatch" &&
				uploadId
			) {
				await hub.uploadAbort(uploadId).catch(() => {});
				uploadId = null;
			}
			const attempts = row.attempts + 1;
			log.warn(
				`upload ${basename(row.path)} failed (attempt ${attempts}): ${errorMessage(error)}`,
			);
			state.putUpload({
				...row,
				state: "failed",
				uploadId,
				attempts,
				nextAt: Date.now() + backoffMs(attempts, 5000, 3_600_000),
				error: errorMessage(error),
			});
		}
	}
}
