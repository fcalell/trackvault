import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { ManifestEntry, ManifestPage } from "@trackvault/core/sync";
import type { Context } from "../context.ts";
import { HubError } from "../hub/client.ts";
import { diskSpace, ensureDir } from "../platform.ts";
import type { FileRow } from "../state.ts";
import {
	backoffMs,
	errorMessage,
	formatBytes,
	pool,
	Runner,
	sleep,
} from "../util.ts";
import { downloadFile, StaleManifest } from "./download.ts";
import {
	localPath,
	moveFile,
	moveToTrash,
	pruneEmptyDirs,
	purgeTrash,
} from "./files.ts";

// The replica: mirrors the hub library under `localRoot`. A cycle pulls the manifest
// pages into the state (cursor advances with each page, so a restart resumes), applies
// moves and deletes, downloads what is missing, and reports file states. Cycles run
// when kicked (live channel, poll timer, a Rekordbox wake) and one after another.
export class ReplicaEngine {
	private readonly ctx: Context;
	private readonly root: string;
	private readonly runner: Runner;
	private timer: NodeJS.Timeout | null = null;
	private failures = 0;
	private lastVerify = 0;
	private lastPurge = 0;
	private pausedReason: string | null = null;
	private needManifest = false;
	private listeners = new Set<() => void>();
	// Counts changes to the files on disk (a download, a move, a trash), so the Rekordbox
	// bridge links again only when something moved.
	changes = 0;

	constructor(ctx: Context) {
		this.ctx = ctx;
		if (!ctx.config.localRoot) throw new Error("replica needs a localRoot");
		this.root = ctx.config.localRoot;
		this.runner = new Runner(
			() => this.cycle(),
			(e) => this.fail(e),
		);
	}

	get firstSyncDone(): boolean {
		return this.ctx.state.get<boolean>("manifestDone") === true;
	}

	get paused(): string | null {
		return this.pausedReason;
	}

	// Called after each cycle (the bridge listens: new files may unblock deferred adds).
	onCycle(listener: () => void): void {
		this.listeners.add(listener);
	}

	async start(): Promise<void> {
		await ensureDir(this.root);
		this.kick("start");
	}

	kick(reason: string): void {
		this.ctx.log.debug(`replica kick: ${reason}`);
		this.runner.kick();
	}

	async stop(): Promise<void> {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		await this.runner.whenIdle();
	}

	private schedule(ms: number): void {
		if (this.ctx.signal.aborted) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => this.kick("timer"), ms);
		this.timer.unref();
	}

	private fail(error: unknown): void {
		if (this.ctx.signal.aborted) return;
		this.failures++;
		const wait =
			error instanceof HubError && error.code === "unauthorized"
				? 5 * 60_000
				: backoffMs(this.failures, 5000, 5 * 60_000);
		this.ctx.log.error(
			`replica cycle failed (${this.failures}): ${errorMessage(error)}; retry in ${Math.round(wait / 1000)}s`,
		);
		this.schedule(wait);
	}

	private async cycle(): Promise<void> {
		const { state, log } = this.ctx;
		for (let round = 0; round < 3; round++) {
			this.needManifest = false;
			await this.pullManifest();
			await this.applyLocal();
			await this.maintenance();
			await this.downloadAll();
			if (!this.needManifest) break;
			log.info("hub changed a file under us; pulling the manifest again");
		}
		await this.reportFiles();
		this.failures = 0;
		const counts = state.fileCounts();
		log.info(
			`replica: ${counts.ok} ok, ${counts.pending} pending, ${counts.failed} failed${this.pausedReason ? ` (paused: ${this.pausedReason})` : ""}`,
		);
		const next = state.nextFileAt();
		const poll = this.ctx.settings.pollSeconds * 1000;
		this.schedule(
			next === null || counts.pending + counts.failed === 0
				? poll
				: Math.max(2000, Math.min(poll, next - Date.now())),
		);
		for (const l of this.listeners) l();
	}

	// ---- manifest ---------------------------------------------------------------------

	private async pullManifest(): Promise<void> {
		const { state, hub, log, settings } = this.ctx;
		let cursor = state.cursor;
		let seen: Set<string> | null = cursor === null ? new Set() : null;
		let pages = 0;
		for (;;) {
			let page: ManifestPage;
			try {
				page = await hub.manifest({ cursor, limit: settings.manifestPageSize });
			} catch (error) {
				if (
					error instanceof HubError &&
					error.code === "cursor-expired" &&
					cursor !== null
				) {
					log.warn("manifest cursor expired; starting over");
					state.cursor = null;
					cursor = null;
					seen = new Set();
					continue;
				}
				throw error;
			}
			state.tx(() => {
				this.applyPage(page);
				state.cursor = page.cursor;
			});
			if (seen) for (const e of page.upserts) seen.add(e.trackId);
			cursor = page.cursor;
			pages++;
			if (!page.hasMore) break;
		}
		if (seen) {
			// A full listing: whatever it did not list is gone from the library.
			const gone = state
				.allFiles()
				.filter((f) => f.state !== "trashed" && !seen.has(f.trackId));
			if (gone.length > 0)
				log.info(`manifest: ${gone.length} tracks no longer in the library`);
			state.tx(() => {
				for (const f of gone) this.markGone(f);
			});
		}
		state.set("manifestDone", true);
		if (pages > 1 || state.fileCounts().pending > 0)
			log.debug(`manifest: ${pages} pages`);
	}

	private applyPage(page: ManifestPage): void {
		const { state } = this.ctx;
		const now = new Date().toISOString();
		if (page.upserts.length + page.deletes.length > 0) this.changes++;
		const insert = state.db.prepare(
			`insert into files(trackId, audioHash, fileHash, size, relPath, state, dirty, stateAt)
			values(?, ?, ?, ?, ?, 'pending', 1, ?)`,
		);
		for (const entry of page.upserts) {
			const row = state.file(entry.trackId);
			if (!row) {
				insert.run(
					entry.trackId,
					entry.audioHash,
					entry.fileHash,
					entry.size,
					entry.relPath,
					now,
				);
				continue;
			}
			this.updateRow(row, entry);
		}
		for (const trackId of page.deletes) {
			const row = state.file(trackId);
			if (row && row.state !== "trashed") this.markGone(row);
		}
	}

	private updateRow(row: FileRow, entry: ManifestEntry): void {
		const { state } = this.ctx;
		const sameContent =
			row.haveFileHash === entry.fileHash && row.state !== "trashed";
		const patch = state.db.prepare(
			"update files set audioHash = ?, fileHash = ?, size = ?, relPath = ?, attempts = 0, nextAt = 0, error = null where trackId = ?",
		);
		patch.run(
			entry.audioHash,
			entry.fileHash,
			entry.size,
			entry.relPath,
			entry.trackId,
		);
		// Same content: a move (or nothing). The file on disk is right; `applyLocal` moves it.
		if (sameContent) return;
		if (
			row.state === "ok" ||
			row.state === "trashed" ||
			row.state === "failed"
		) {
			state.setFileState(entry.trackId, "pending");
		}
	}

	// A hub delete: the local file goes to the trash on the next `applyLocal`.
	private markGone(row: FileRow): void {
		this.ctx.state.db
			.prepare(
				"update files set state = 'trashed', dirty = 1, stateAt = ?, nextAt = 0 where trackId = ?",
			)
			.run(new Date().toISOString(), row.trackId);
	}

	// ---- local effects ------------------------------------------------------------------

	private async applyLocal(): Promise<void> {
		const { state, log } = this.ctx;
		const rows = state.allFiles();
		let moved = 0;
		let trashed = 0;
		for (const row of rows) {
			if (this.ctx.signal.aborted) return;
			try {
				if (row.state === "trashed") {
					if (row.haveRelPath) {
						await moveToTrash(this.root, row.haveRelPath);
						state.db
							.prepare(
								"update files set haveRelPath = null, haveFileHash = null where trackId = ?",
							)
							.run(row.trackId);
						trashed++;
					}
					continue;
				}
				if (
					row.haveRelPath &&
					row.haveRelPath !== row.relPath &&
					row.haveFileHash === row.fileHash
				) {
					const from = localPath(this.root, row.haveRelPath);
					const to = localPath(this.root, row.relPath);
					await moveFile(from, to);
					await pruneEmptyDirs(this.root, dirname(from));
					state.db
						.prepare("update files set haveRelPath = ? where trackId = ?")
						.run(row.relPath, row.trackId);
					moved++;
				}
			} catch (error) {
				log.warn(
					`local change for ${row.relPath} failed: ${errorMessage(error)}`,
				);
				state.setFileState(row.trackId, "failed", {
					error: errorMessage(error),
					attempts: row.attempts + 1,
					nextAt: Date.now() + backoffMs(row.attempts + 1),
				});
			}
		}
		this.changes += moved + trashed;
		if (moved + trashed > 0)
			log.info(`replica: moved ${moved}, trashed ${trashed}`);
	}

	// Startup and periodic: files that vanished or changed on disk are fetched again, and
	// old trash is purged.
	private async maintenance(): Promise<void> {
		const { state, log, config } = this.ctx;
		const now = Date.now();
		if (now - this.lastVerify > 6 * 3_600_000) {
			this.lastVerify = now;
			let missing = 0;
			for (const row of state.allFiles()) {
				if (row.state !== "ok" || !row.haveRelPath) continue;
				let ok = false;
				try {
					ok =
						(await stat(localPath(this.root, row.haveRelPath))).size ===
						row.size;
				} catch {
					ok = false;
				}
				if (!ok) {
					state.setFileState(row.trackId, "missing", {
						nextAt: 0,
						error: null,
					});
					missing++;
				}
			}
			if (missing > 0)
				log.warn(
					`replica: ${missing} files missing or changed on disk; fetching again`,
				);
		}
		if (now - this.lastPurge > 24 * 3_600_000) {
			this.lastPurge = now;
			const purged = await purgeTrash(this.root, config.trashDays);
			if (purged > 0) log.info(`replica: purged ${purged} old trash folders`);
		}
	}

	// ---- downloads ----------------------------------------------------------------------

	private claim(): FileRow | undefined {
		const [row] = this.ctx.state.dueFiles(1);
		if (row) {
			this.ctx.state.setFileState(row.trackId, "downloading");
			return row;
		}
		return undefined;
	}

	private async downloadAll(): Promise<void> {
		const { state, log, config, signal, settings } = this.ctx;
		this.pausedReason = null;
		if (state.dueFiles(1).length === 0) return;
		const concurrency = Math.max(
			1,
			Math.min(config.downloadConcurrency, settings.maxDownloads),
		);
		let done = 0;
		let bytes = 0;
		let lastLog = Date.now();
		let fatal: unknown = null;
		const startedAt = Date.now();

		await pool(concurrency, async () => {
			while (!signal.aborted && !fatal) {
				const disk = await diskSpace(this.root);
				if (disk && disk.free < config.minFreeBytes) {
					this.pausedReason = `low disk (${formatBytes(disk.free)} free)`;
					log.warn(`replica paused: ${this.pausedReason}`);
					return;
				}
				const row = this.claim();
				if (!row) return;
				try {
					await downloadFile(this.ctx.hub, this.root, row, signal);
					state.setFileState(row.trackId, "ok", {
						haveRelPath: row.relPath,
						haveFileHash: row.fileHash,
						attempts: 0,
						nextAt: 0,
						error: null,
					});
					done++;
					this.changes++;
					bytes += row.size;
					this.ctx.reportSoon();
					if (Date.now() - lastLog > 10_000) {
						lastLog = Date.now();
						const rate = bytes / Math.max(1, (Date.now() - startedAt) / 1000);
						log.info(
							`replica: downloaded ${done} files, ${formatBytes(bytes)} (${formatBytes(rate)}/s)`,
						);
					}
				} catch (error) {
					if (signal.aborted) {
						state.setFileState(row.trackId, "pending");
						return;
					}
					if (error instanceof HubError) {
						if (error.code === "network" || error.code === "unauthorized") {
							state.setFileState(row.trackId, "pending");
							fatal = error;
							return;
						}
						if (error.code === "file-changed") {
							state.setFileState(row.trackId, "pending", { nextAt: 0 });
							this.needManifest = true;
							continue;
						}
					}
					if (error instanceof StaleManifest) {
						state.setFileState(row.trackId, "pending", { nextAt: 0 });
						this.needManifest = true;
						continue;
					}
					const attempts = row.attempts + 1;
					log.warn(
						`download ${row.relPath} failed (attempt ${attempts}): ${errorMessage(error)}`,
					);
					state.setFileState(row.trackId, "failed", {
						attempts,
						nextAt: Date.now() + backoffMs(attempts),
						error: errorMessage(error),
					});
				}
			}
		});
		if (done > 0)
			log.info(`replica: downloaded ${done} files, ${formatBytes(bytes)}`);
		if (fatal) throw fatal;
		// Stall guard: a manifest-triggered re-pull must not spin.
		if (this.needManifest) await sleep(1000, signal);
	}

	// ---- reporting -----------------------------------------------------------------------

	// Sends every dirty file state (in pages), then marks them reported.
	async reportFiles(): Promise<void> {
		const { state, hub } = this.ctx;
		for (;;) {
			const rows = state.dirtyFiles(500);
			if (rows.length === 0) return;
			await hub.putState({
				files: rows.map((r) => ({
					trackId: r.trackId,
					state: r.state,
					fileHash: r.haveFileHash ?? r.fileHash,
					...(r.error ? { error: r.error } : {}),
					at: r.stateAt,
				})),
				status: await this.ctx.collectStatus(),
			});
			state.markReported(rows.map((r) => r.trackId));
		}
	}

	status() {
		return {
			...this.ctx.state.fileCounts(),
			paused: this.pausedReason,
		};
	}
}
