import { type FSWatcher, watch } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	findRekordboxInstall,
	isRekordboxRunning,
	type RekordboxInstall,
	WriteRefused,
} from "@trackvault/core/rekordbox";
import type { ExportAck, RekordboxStatus } from "@trackvault/core/sync";
import type { Context } from "../context.ts";
import type { ReplicaEngine } from "../replica/engine.ts";
import { errorMessage, isoNow, Runner } from "../util.ts";
import { stageBlobs } from "./anlz.ts";
import {
	applyExport,
	classifyWrite,
	deferredReady,
	emptyPlan,
	foldChanges,
	pendingRelinks,
	playlistDrift,
} from "./exporter.ts";
import { type InstallView, runImport } from "./importer.ts";

const DEBOUNCE_MS = 8000;
const SIGNATURE_POLL_MS = 60_000;
const EXIT_POLL_MS = 15_000;

// Best effort: the Rekordbox application version from the macOS bundle. Windows keeps it
// in the registry, which the agent does not read; null there.
async function detectAppVersion(): Promise<string | null> {
	if (process.platform !== "darwin") return null;
	try {
		for (const name of await readdir("/Applications")) {
			if (!/^rekordbox/i.test(name)) continue;
			for (const plist of [
				join("/Applications", name, "rekordbox.app", "Contents", "Info.plist"),
				join("/Applications", name, "Contents", "Info.plist"),
			]) {
				try {
					const text = await readFile(plist, "utf8");
					const m =
						/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(
							text,
						);
					if (m?.[1]) return m[1];
				} catch {
					// next candidate
				}
			}
		}
	} catch {
		// no /Applications
	}
	return null;
}

// The Rekordbox bridge (plan section 6): on a master.db change or at startup, import what
// changed in Rekordbox; then, when Rekordbox is closed and writes are supported, apply the
// hub's merged changes in one transaction and store the new base.
export class RekordboxBridge {
	private readonly ctx: Context;
	private readonly replica: ReplicaEngine;
	private readonly runner: Runner;
	private install: RekordboxInstall | null = null;
	private view: InstallView | null = null;
	private appVersion: string | null = null;
	private watcher: FSWatcher | null = null;
	private watching: string | null = null;
	private debounceTimer: NodeJS.Timeout | null = null;
	private pollTimer: NodeJS.Timeout | null = null;
	private exitTimer: NodeJS.Timeout | null = null;
	private lastSignature = "";
	private lastReplicaChanges = -1;
	private ignoreUntil = 0;
	private forceImport = false;
	private current: RekordboxStatus = {
		installed: false,
		appVersion: null,
		dbVersion: null,
		running: null,
		writeSupport: "unknown",
		exportState: "idle",
		pendingExport: 0,
		lastImportAt: null,
		lastExportAt: null,
		message: null,
	};

	constructor(ctx: Context, replica: ReplicaEngine) {
		this.ctx = ctx;
		this.replica = replica;
		this.runner = new Runner(
			() => this.cycle(),
			(e) => this.fail(e),
		);
	}

	get status(): RekordboxStatus {
		return this.current;
	}

	async start(): Promise<void> {
		this.appVersion = await detectAppVersion();
		this.current.lastImportAt = this.ctx.state.get<string>("rbLastImportAt");
		this.current.lastExportAt = this.ctx.state.get<string>("rbLastExportAt");
		this.pollTimer = setInterval(
			() => void this.pollSignature(),
			SIGNATURE_POLL_MS,
		);
		this.pollTimer.unref();
		this.kick("start");
	}

	async stop(): Promise<void> {
		for (const t of [this.debounceTimer, this.exitTimer])
			if (t) clearTimeout(t);
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.watcher?.close();
		await this.runner.whenIdle();
	}

	kick(reason: string): void {
		this.ctx.log.debug(`rekordbox kick: ${reason}`);
		this.runner.kick();
	}

	private fail(error: unknown): void {
		if (this.ctx.signal.aborted) return;
		this.current.exportState = "error";
		this.current.message = errorMessage(error);
		this.ctx.log.error(`rekordbox cycle failed: ${errorMessage(error)}`);
		this.ctx.reportSoon();
		// Try again in a while; a broken master.db or a hub outage should not spin.
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.kick("retry"), 2 * 60_000);
		this.debounceTimer.unref();
	}

	// ---- change detection ----------------------------------------------------------------------

	private async locate(): Promise<RekordboxInstall | null> {
		const found = await findRekordboxInstall();
		const custom = this.ctx.config.rekordbox.dbPath;
		if (!custom) return found?.dbExists ? found : null;
		const dbDir = dirname(custom);
		return {
			dbDir,
			dbPath: custom,
			shareDir: join(dbDir, "share"),
			source: "options.json",
			dbExists: await stat(custom).then(
				() => true,
				() => false,
			),
			optionsPath: found?.optionsPath ?? null,
		};
	}

	private async signature(install: RekordboxInstall): Promise<string> {
		const parts: string[] = [];
		for (const p of [install.dbPath, `${install.dbPath}-wal`]) {
			try {
				const s = await stat(p);
				parts.push(`${s.size}:${Math.floor(s.mtimeMs)}`);
			} catch {
				parts.push("-");
			}
		}
		return parts.join("|");
	}

	private watchInstall(install: RekordboxInstall): void {
		if (this.watching === install.dbDir) return;
		this.watcher?.close();
		this.watching = install.dbDir;
		try {
			this.watcher = watch(install.dbDir, (_event, name) => {
				if (!name || !/^master\.db(-wal)?$/.test(name.toString())) return;
				if (Date.now() < this.ignoreUntil) return;
				this.debounce();
			});
			this.watcher.on("error", (e) =>
				this.ctx.log.warn(`rekordbox watch: ${errorMessage(e)}`),
			);
			this.ctx.log.info(`watching ${install.dbDir}`);
		} catch (error) {
			this.ctx.log.warn(
				`cannot watch ${install.dbDir}: ${errorMessage(error)}; polling instead`,
			);
		}
	}

	private debounce(): void {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(
			() => this.kick("master.db changed"),
			DEBOUNCE_MS,
		);
		this.debounceTimer.unref();
	}

	// The fs watch can miss events (network volumes, sleeping laptops); a signature check
	// once a minute backs it up. It also notices Rekordbox being installed later.
	private async pollSignature(): Promise<void> {
		try {
			const install = this.install ?? (await this.locate());
			if (!install) return;
			if (!this.install) return this.kick("install appeared");
			if (Date.now() < this.ignoreUntil) return;
			if ((await this.signature(install)) !== this.lastSignature)
				this.debounce();
		} catch (error) {
			this.ctx.log.debug(`rekordbox poll: ${errorMessage(error)}`);
		}
	}

	// While Rekordbox runs, export waits: poll for its exit and then apply.
	private pollForExit(): void {
		if (this.exitTimer) return;
		const tick = async () => {
			this.exitTimer = null;
			if (this.ctx.signal.aborted) return;
			let running: boolean | null = null;
			try {
				running = await isRekordboxRunning();
			} catch {
				running = null;
			}
			if (running === false) {
				this.ctx.log.info("rekordbox closed; applying pending changes");
				this.kick("rekordbox exited");
				return;
			}
			this.exitTimer = setTimeout(tick, EXIT_POLL_MS);
			this.exitTimer.unref();
		};
		this.exitTimer = setTimeout(tick, EXIT_POLL_MS);
		this.exitTimer.unref();
	}

	// ---- the cycle --------------------------------------------------------------------------------

	private async cycle(): Promise<void> {
		const { ctx } = this;
		const { config, state, log } = ctx;
		if (!config.rekordbox.enabled || !ctx.flags.rekordbox) return;
		if (!this.replica.firstSyncDone) {
			log.debug("rekordbox: waiting for the first manifest sync");
			return;
		}
		const install = await this.locate();
		if (!install?.dbExists) {
			if (this.current.installed) log.warn("rekordbox: master.db is gone");
			this.install = null;
			this.current = {
				...this.current,
				installed: false,
				message: "Rekordbox library not found",
			};
			return;
		}
		this.install = install;
		this.current.installed = true;
		this.current.appVersion = this.appVersion;
		this.watchInstall(install);

		let running: boolean | null = null;
		try {
			running = await isRekordboxRunning();
		} catch (error) {
			log.warn(`cannot tell whether Rekordbox runs: ${errorMessage(error)}`);
		}
		this.current.running = running;

		await this.flushAck();

		// 1. import
		let signature = await this.signature(install);
		const replicaChanges = this.replica.changes;
		if (
			this.view === null ||
			this.forceImport ||
			signature !== this.view.signature ||
			replicaChanges !== this.lastReplicaChanges
		) {
			this.forceImport = false;
			this.lastReplicaChanges = replicaChanges;
			const outcome = await runImport(ctx, install, signature, this.appVersion);
			this.view = outcome.view;
			this.lastSignature = signature;
			log.info(outcome.summary);
			if (outcome.sent) {
				this.current.lastImportAt = isoNow();
				state.set("rbLastImportAt", this.current.lastImportAt);
			}
		}
		const view = this.view as InstallView;
		this.current.dbVersion = view.schema.dbVersion;
		this.current.writeSupport = classifyWrite(ctx, view);

		// 2. export
		await this.exportStep(install, view, running);
		// A write of ours must not wake us again.
		signature = await this.signature(install);
		this.lastSignature = signature;
		ctx.reportSoon();
	}

	private blockedMessage(): string | null {
		switch (this.current.writeSupport) {
			case "pending-verification":
				return "write pending verification: no Rekordbox database version is on the write allowlist yet";
			case "unsupported-schema":
				return `master.db version ${this.current.dbVersion ?? "unknown"} is not supported for writing`;
			case "cloud-sync":
				return "Rekordbox Cloud Library Sync looks enabled; turn it off to let TrackVault write";
			case "unknown":
				return "write support unknown";
			default:
				return null;
		}
	}

	private async pendingCount(): Promise<number> {
		try {
			const page = await this.ctx.hub.rekordboxExport({
				cursor: this.ctx.state.get<string>("rbExportCursor"),
				limit: 0,
				base: this.ctx.state.baseRef(),
			});
			return page.pending;
		} catch (error) {
			this.ctx.log.debug(`export pending count: ${errorMessage(error)}`);
			return this.current.pendingExport;
		}
	}

	private async exportStep(
		install: RekordboxInstall,
		view: InstallView,
		running: boolean | null,
	): Promise<void> {
		const { ctx } = this;
		const { state, hub, log } = ctx;

		const blocked = this.blockedMessage();
		if (blocked || running !== false) {
			this.current.pendingExport = await this.pendingCount();
			if (blocked) {
				this.current.exportState = "blocked";
				this.current.message = blocked;
			} else if (running === null) {
				this.current.exportState = "blocked";
				this.current.message =
					"cannot tell whether Rekordbox is running; not writing";
				this.exitTimer ??= setTimeout(() => {
					this.exitTimer = null;
					this.kick("retry process check");
				}, 60_000);
			} else {
				this.current.exportState = "waiting-for-rekordbox";
				this.current.message =
					this.current.pendingExport > 0
						? `${this.current.pendingExport} changes waiting for Rekordbox to close`
						: null;
				this.pollForExit();
			}
			if (this.current.pendingExport > 0 || blocked)
				log.info(
					`rekordbox export not applied: ${this.current.message ?? "waiting"}`,
				);
			return;
		}

		// Rekordbox is closed and the writer is allowed: fold the hub's pages into a plan.
		let cursor = state.get<string>("rbExportCursor");
		const plan = emptyPlan();
		for (const d of state.deferred()) plan.adds.set(d.trackId, d);
		let pageCursor = cursor;
		for (;;) {
			const page = await hub.rekordboxExport({
				cursor: pageCursor,
				limit: 1000,
				base: state.baseRef(),
			});
			foldChanges(ctx, plan, page.changes);
			pageCursor = page.cursor;
			if (!page.hasMore) break;
		}

		const contentByTrack = new Map(
			state.links().map((l) => [l.trackId, l.contentId]),
		);
		const needs =
			plan.count > 0 ||
			deferredReady(ctx).length > 0 ||
			pendingRelinks(ctx, view.collection).length > 0 ||
			playlistDrift(ctx, view.playlists, contentByTrack);
		this.current.pendingExport = 0;
		if (!needs) {
			if (pageCursor !== cursor) state.set("rbExportCursor", pageCursor);
			this.current.exportState = "idle";
			this.current.message = null;
			return;
		}

		// Rekordbox was closed all along, but the import saw master.db earlier: if it moved
		// since, import again first so the hub merges before we write.
		if ((await this.signature(install)) !== view.signature) {
			log.info(
				"master.db changed since the import; importing again before writing",
			);
			this.forceImport = true;
			this.runner.kick();
			return;
		}

		this.current.exportState = "applying";
		ctx.reportSoon();
		let run: Awaited<ReturnType<typeof applyExport>>;
		try {
			run = await applyExport(ctx, install, plan);
		} catch (error) {
			if (error instanceof WriteRefused) {
				this.refused(error);
				return;
			}
			throw error;
		}
		cursor = pageCursor;
		this.ignoreUntil = Date.now() + 15_000;
		state.set("rbExportCursor", cursor);
		this.view = null;
		this.current.exportState = "idle";
		this.current.message =
			run.skipped.length > 0 ? `${run.skipped.length} changes skipped` : null;
		this.current.lastExportAt = isoNow();
		state.set("rbLastExportAt", this.current.lastExportAt);
		log.info(
			`rekordbox export: ${run.applied} changes applied, ${run.deferred} waiting for files, ${run.skipped.length} skipped, base v${run.base.version}`,
		);
		for (const s of run.skipped.slice(0, 10))
			log.warn(`rekordbox export skipped: ${s}`);

		const ack: ExportAck = {
			cursor: cursor as string,
			base: run.base,
			applied: run.applied,
			deferred: run.deferred,
			links: run.ack,
			rekordbox: this.current,
		};
		state.set("rbPendingAck", ack);
		await this.flushAck();
		// ANLZ blobs: staged for the day copying them is verified (VERIFY.md).
		void stageBlobs(ctx, plan.anlz).then((n) => {
			if (n > 0)
				log.info(
					`rekordbox: staged ${n} analysis files (not written into Rekordbox)`,
				);
		});
	}

	private refused(error: WriteRefused): void {
		const { log } = this.ctx;
		switch (error.code) {
			case "running":
				this.current.running = true;
				this.current.exportState = "waiting-for-rekordbox";
				this.pollForExit();
				break;
			case "cloud-sync":
				this.current.writeSupport = "cloud-sync";
				this.current.exportState = "blocked";
				break;
			case "schema":
				this.current.writeSupport =
					this.current.writeSupport === "supported"
						? "unsupported-schema"
						: this.current.writeSupport;
				this.current.exportState = "blocked";
				break;
			default:
				this.current.exportState = "blocked";
		}
		this.current.message = error.message;
		log.warn(`rekordbox write refused (${error.code}): ${error.message}`);
	}

	// Tells the hub what was applied. Kept until it is accepted, so a failed ack is retried
	// on the next cycle instead of being lost.
	private async flushAck(): Promise<boolean> {
		const { state, hub, log } = this.ctx;
		const ack = state.get<ExportAck>("rbPendingAck");
		if (!ack) return true;
		try {
			await hub.rekordboxAck({ ...ack, rekordbox: this.current });
			state.set("rbPendingAck", null);
			return true;
		} catch (error) {
			log.warn(
				`rekordbox ack not delivered, will retry: ${errorMessage(error)}`,
			);
			return false;
		}
	}
}
