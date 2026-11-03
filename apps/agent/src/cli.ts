#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import { parseArgs } from "node:util";
import { findRekordboxInstall } from "@trackvault/core/rekordbox";
import { KEY_PREFIX } from "@trackvault/core/sync";
import {
	AGENT_VERSION,
	agentPaths,
	loadConfig,
	NotPairedError,
	readStored,
	type StoredConfig,
	saveStored,
	withDefaults,
} from "./config.ts";
import { runDaemon, runningPid } from "./daemon.ts";
import { buildHello, NO_REKORDBOX } from "./hello.ts";
import { HubClient, HubError } from "./hub/client.ts";
import { createLogger, type Level } from "./log.ts";
import { defaultRoot, hostName } from "./platform.ts";
import { State } from "./state.ts";
import { errorMessage, formatBytes } from "./util.ts";

const USAGE = `trackvault-agent ${AGENT_VERSION}

Usage:
  trackvault-agent pair <hubUrl> <key> [options]   pair this machine with the hub
  trackvault-agent run [--debug]                   run the daemon
  trackvault-agent status                          show config, sync and Rekordbox state
  trackvault-agent unpair [--keep-state]           forget the hub (files stay on disk)

pair options:
  --name <name>       device name shown in the hub (default: this machine's name)
  --root <dir>        replica folder (default ~/Music/TrackVault)
  --watch <dir>       upload audio from this folder to the hub inbox (repeatable)
  --no-replica        do not mirror the library (upload-only machine)
  --no-rekordbox      do not run the Rekordbox bridge
  --force             replace an existing pairing

The device key is made in the hub (Devices) and looks like ${KEY_PREFIX}...
Config lives in: macOS ~/Library/Application Support/TrackVault, Windows %APPDATA%\\TrackVault,
Linux $XDG_CONFIG_HOME/trackvault (override with TRACKVAULT_AGENT_HOME).
`;

function fail(message: string, code = 1): never {
	process.stderr.write(`${message}\n`);
	process.exit(code);
}

async function pair(argv: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			name: { type: "string" },
			root: { type: "string" },
			watch: { type: "string", multiple: true },
			"no-replica": { type: "boolean" },
			"no-rekordbox": { type: "boolean" },
			force: { type: "boolean" },
		},
	});
	const [hubUrl, key] = positionals;
	if (!hubUrl || !key) fail(`pair needs <hubUrl> and <key>\n\n${USAGE}`);
	if (!key.startsWith(KEY_PREFIX))
		fail(`the key should start with ${KEY_PREFIX}`);
	let url: URL;
	try {
		url = new URL(hubUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:")
			throw new Error("scheme");
	} catch {
		fail(`not a http(s) URL: ${hubUrl}`);
	}
	if (
		url.protocol === "http:" &&
		!/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/.test(
			url.hostname,
		) &&
		!url.hostname.endsWith(".local") &&
		!url.hostname.endsWith(".ts.net")
	) {
		process.stderr.write(
			"warning: the device key travels in clear over http outside a private network\n",
		);
	}

	const paths = agentPaths();
	const existing = await readStored(paths).then(
		() => true,
		() => false,
	);
	if (existing && !values.force)
		fail("this machine is already paired; pass --force to replace it");
	if (await runningPid(paths))
		fail("the agent is running; stop it before pairing again");

	const rekordbox = values["no-rekordbox"]
		? null
		: await findRekordboxInstall().catch(() => null);
	const watch = values.watch ?? [];
	const rootGiven = values.root !== undefined;
	const replica =
		!values["no-replica"] &&
		(rootGiven || rekordbox !== null || watch.length === 0);
	const stored: StoredConfig = {
		version: 1,
		hubUrl: url.origin + url.pathname.replace(/\/+$/, ""),
		key,
		name: values.name ?? hostName,
		localRoot: replica ? (values.root ?? defaultRoot()) : null,
		replica,
		watch,
		extensions: [".mp3"],
		rekordbox: { enabled: !values["no-rekordbox"] },
	};

	// Prove the key and the hub before saving anything.
	const log = await createLogger(null, "warn");
	const config = withDefaults(stored);
	const hub = new HubClient(config.hubUrl, config.key, log);
	try {
		const response = await hub.hello(
			await buildHello(
				config,
				null,
				rekordbox ? { ...NO_REKORDBOX, installed: true } : NO_REKORDBOX,
			),
		);
		await saveStored(paths, stored);
		if (config.localRoot) await mkdir(config.localRoot, { recursive: true });
		// A new pairing starts from nothing: an old cursor or base would be wrong for it.
		if (existing) await rm(paths.state, { force: true });
		process.stdout.write(
			`Paired as "${config.name}" (device ${response.deviceId}).\n` +
				`  hub:       ${config.hubUrl}\n` +
				`  replica:   ${config.replica ? config.localRoot : "off"}\n` +
				`  upload:    ${config.watch.length > 0 ? config.watch.join(", ") : "off"}\n` +
				`  rekordbox: ${rekordbox ? `found (${rekordbox.dbPath})` : "not found"}\n` +
				`Start it with: trackvault-agent run\n`,
		);
	} catch (error) {
		if (error instanceof HubError && error.code === "unauthorized")
			fail("the hub refused this key (revoked, expired or mistyped)");
		fail(`could not reach the hub: ${errorMessage(error)}`);
	}
}

async function run(argv: string[]): Promise<void> {
	const { values } = parseArgs({
		args: argv,
		options: { debug: { type: "boolean" } },
	});
	const paths = agentPaths();
	const config = await loadConfig(paths);
	const level: Level = values.debug ? "debug" : "info";
	const log = await createLogger(paths.log, level);
	process.on("unhandledRejection", (reason) =>
		log.error(`unhandled rejection: ${errorMessage(reason)}`),
	);
	process.on("uncaughtException", (error) => {
		log.error(`uncaught exception: ${error.stack ?? error.message}`);
		process.exit(1);
	});
	await runDaemon(config, paths, log);
}

async function status(): Promise<void> {
	const paths = agentPaths();
	const config = await loadConfig(paths);
	const pid = await runningPid(paths);
	const out: string[] = [
		`agent ${AGENT_VERSION} for "${config.name}"`,
		`  hub:        ${config.hubUrl}`,
		`  daemon:     ${pid ? `running (pid ${pid})` : "not running"}`,
		`  config:     ${paths.config}`,
		`  log:        ${paths.log}`,
	];
	const state = await Promise.resolve()
		.then(() => new State(paths.state))
		.catch(() => null);
	if (state) {
		if (config.replica) {
			const c = state.fileCounts();
			out.push(
				`  replica:    ${config.localRoot}`,
				`              ${c.ok} ok, ${c.pending} pending (${formatBytes(c.bytesPending)}), ${c.downloading} downloading, ${c.failed} failed`,
				`              manifest cursor ${state.cursor ?? "none yet"}`,
			);
			const failed = state.db
				.prepare(
					"select relPath, error from files where state = 'failed' limit 5",
				)
				.all() as { relPath: string; error: string | null }[];
			for (const f of failed)
				out.push(`              failed: ${f.relPath}: ${f.error ?? ""}`);
		} else out.push("  replica:    off");
		if (config.watch.length > 0) {
			const u = state.uploadCounts();
			out.push(
				`  upload:     ${config.watch.join(", ")}`,
				`              ${u.queued} queued, ${u.uploading} uploading, ${u.failed} failed, ${u.done} done`,
			);
		}
		if (config.replica && config.rekordbox.enabled) {
			const base = state.baseRef();
			const install = await findRekordboxInstall().catch(() => null);
			out.push(
				`  rekordbox:  ${install ? install.dbPath : "not found"}`,
				`              base v${base?.version ?? 0}, last import ${state.get<string>("rbLastImportAt") ?? "never"}, last export ${state.get<string>("rbLastExportAt") ?? "never"}`,
				`              ${state.links().length} linked tracks, ${state.deferred().length} adds waiting for files`,
			);
		}
		state.close();
	} else out.push("  state:      none yet (the agent has not run)");
	process.stdout.write(`${out.join("\n")}\n`);
}

async function unpair(argv: string[]): Promise<void> {
	const { values } = parseArgs({
		args: argv,
		options: { "keep-state": { type: "boolean" } },
	});
	const paths = agentPaths();
	if (await runningPid(paths)) fail("the agent is running; stop it first");
	await readStored(paths);
	await rm(paths.config, { force: true });
	if (!values["keep-state"]) {
		for (const f of [paths.state, `${paths.state}-wal`, `${paths.state}-shm`])
			await rm(f, { force: true });
	}
	process.stdout.write(
		"Unpaired. Synced files and Rekordbox are untouched.\nRevoke this device's key in the hub (Devices) so it cannot be used again.\n",
	);
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);
	switch (command) {
		case "pair":
			return pair(rest);
		case "run":
			return run(rest);
		case "status":
			return status();
		case "unpair":
			return unpair(rest);
		case undefined:
		case "help":
		case "--help":
		case "-h":
			process.stdout.write(USAGE);
			return;
		default:
			fail(`unknown command: ${command}\n\n${USAGE}`);
	}
}

main().catch((error) => {
	if (error instanceof NotPairedError) fail(error.message);
	fail(errorMessage(error));
});
