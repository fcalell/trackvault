import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeviceStatus, HelloResponse } from "@trackvault/core/sync";
import type { AgentConfig, AgentPaths } from "./config.ts";
import { type Context, DEFAULT_SETTINGS } from "./context.ts";
import { buildHello, NO_REKORDBOX } from "./hello.ts";
import { connectLive, type Live } from "./hub/channels.ts";
import { HubClient, HubError } from "./hub/client.ts";
import type { Logger } from "./log.ts";
import { diskSpace } from "./platform.ts";
import { RekordboxBridge } from "./rekordbox/bridge.ts";
import { ReplicaEngine } from "./replica/engine.ts";
import { State } from "./state.ts";
import { UploadEngine } from "./upload/engine.ts";
import { backoffMs, errorMessage, isoNow, sleep } from "./util.ts";

const HEARTBEAT_MS = 5 * 60_000;
const REPORT_THROTTLE_MS = 5000;

export function pidFile(paths: AgentPaths): string {
	return join(paths.dir, "agent.pid");
}

export function processAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

export async function runningPid(paths: AgentPaths): Promise<number | null> {
	try {
		const pid = Number((await readFile(pidFile(paths), "utf8")).trim());
		return Number.isInteger(pid) && pid > 0 && processAlive(pid) ? pid : null;
	} catch {
		return null;
	}
}

async function acquireLock(paths: AgentPaths): Promise<void> {
	await mkdir(paths.dir, { recursive: true });
	const pid = await runningPid(paths);
	if (pid !== null && pid !== process.pid)
		throw new Error(`the agent is already running (pid ${pid})`);
	await writeFile(pidFile(paths), String(process.pid));
}

// The agent daemon: says hello to the hub, then runs the replica, the folder upload and
// the Rekordbox bridge until a signal asks it to stop.
export async function runDaemon(
	config: AgentConfig,
	paths: AgentPaths,
	log: Logger,
): Promise<void> {
	await acquireLock(paths);
	const state = new State(paths.state);
	const abort = new AbortController();
	const hub = new HubClient(config.hubUrl, config.key, log.child("hub"));
	let reportTimer: NodeJS.Timeout | null = null;
	let lastReport = 0;
	let replica: ReplicaEngine | null = null;
	let upload: UploadEngine | null = null;
	let bridge: RekordboxBridge | null = null;
	let live: Live | null = null;
	let heartbeat: NodeJS.Timeout | null = null;

	const ctx: Context = {
		config,
		paths,
		state,
		hub,
		log,
		settings: { ...DEFAULT_SETTINGS },
		flags: { rekordbox: true },
		signal: abort.signal,
		reportSoon() {
			if (abort.signal.aborted || reportTimer) return;
			const wait = Math.max(0, lastReport + REPORT_THROTTLE_MS - Date.now());
			reportTimer = setTimeout(() => {
				reportTimer = null;
				lastReport = Date.now();
				void report();
			}, wait);
			reportTimer.unref();
		},
		async collectStatus(): Promise<DeviceStatus> {
			const probe = config.localRoot ?? config.watch[0] ?? paths.dir;
			const disk = await diskSpace(probe);
			return {
				at: isoNow(),
				freeDiskBytes: disk ? Math.floor(disk.free) : null,
				replica: replica ? replica.status() : null,
				upload: upload ? upload.status() : null,
				rekordbox: bridge ? bridge.status : null,
			};
		},
	};

	async function report(): Promise<void> {
		try {
			if (replica) await replica.reportFiles();
			else await hub.putState({ files: [], status: await ctx.collectStatus() });
		} catch (error) {
			log.debug(`state report failed: ${errorMessage(error)}`);
		}
	}

	hub.setUnauthorizedHandler(() =>
		log.error(
			"the hub refused the device key (revoked or expired?). Pair again: trackvault-agent pair <hubUrl> <key>",
		),
	);

	async function hello(): Promise<HelloResponse> {
		const response = await hub.hello(
			await buildHello(config, state, bridge?.status ?? NO_REKORDBOX),
		);
		ctx.settings = response.settings;
		ctx.flags.rekordbox = response.rekordboxEnabled;
		return response;
	}

	let stopping: Promise<void> | null = null;
	const stop = (signal: string): Promise<void> => {
		if (stopping) return stopping;
		log.info(`${signal}: shutting down`);
		abort.abort();
		stopping = (async () => {
			if (heartbeat) clearInterval(heartbeat);
			if (reportTimer) clearTimeout(reportTimer);
			live?.close();
			await Promise.allSettled([
				replica?.stop(),
				upload?.stop(),
				bridge?.stop(),
			]);
			await report().catch(() => {});
			state.close();
			await rm(pidFile(paths), { force: true });
			log.info("stopped");
			clearInterval(keepAlive);
			await log.close();
		})();
		return stopping;
	};
	// Timers elsewhere are unref'd; this one keeps the process alive until a signal.
	const keepAlive = setInterval(() => {}, 2 ** 30);
	const done = new Promise<void>((resolve) => {
		for (const sig of ["SIGINT", "SIGTERM"] as const) {
			process.once(sig, () => void stop(sig).then(resolve));
		}
		if (process.platform === "win32")
			process.once("SIGBREAK", () => void stop("SIGBREAK").then(resolve));
	});

	log.info(
		`agent starting: hub ${config.hubUrl}, device "${config.name}", replica ${config.replica ? config.localRoot : "off"}, watching ${config.watch.length} folders`,
	);

	// Hello first: it validates the key and gives the hub's settings. Retry until it works.
	for (let attempt = 1; !abort.signal.aborted; attempt++) {
		try {
			const response = await hello();
			log.info(
				`registered with the hub as device ${response.deviceId} (library v${response.libraryVersion})`,
			);
			break;
		} catch (error) {
			const wait =
				error instanceof HubError && error.code === "unauthorized"
					? 5 * 60_000
					: backoffMs(attempt, 3000, 5 * 60_000);
			log.error(
				`hello failed: ${errorMessage(error)}; retry in ${Math.round(wait / 1000)}s`,
			);
			await sleep(wait, abort.signal);
		}
	}
	if (abort.signal.aborted) {
		await done;
		return;
	}

	if (config.replica) {
		replica = new ReplicaEngine(ctx);
		bridge = new RekordboxBridge(ctx, replica);
		const b = bridge;
		replica.onCycle(() => b.kick("replica cycle"));
	}
	if (config.watch.length > 0) upload = new UploadEngine(ctx);

	live = connectLive(config.hubUrl, config.key, log.child("live"), {
		onReplica: (reason) => {
			replica?.kick(`live: ${reason}`);
			upload?.kick();
		},
		onRekordbox: (reason) => bridge?.kick(`live: ${reason}`),
		onConflict: (summary) =>
			log.warn(`conflict recorded on the hub: ${summary}`),
	});

	await replica?.start();
	await upload?.start();
	await bridge?.start();

	heartbeat = setInterval(() => {
		hello().then(
			() => ctx.reportSoon(),
			(error) => log.warn(`heartbeat failed: ${errorMessage(error)}`),
		);
	}, HEARTBEAT_MS);
	heartbeat.unref();

	await done;
}
