import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	arr,
	bool,
	type Infer,
	int,
	nullable,
	obj,
	optional,
	parse,
	str,
} from "@trackvault/core/sync";
import { configDir } from "./platform.ts";

export const AGENT_VERSION = "0.1.0";

const ConfigCheck = obj({
	version: int,
	hubUrl: str,
	key: str,
	name: str,
	// The replica root (null: no replica; upload-only agent).
	localRoot: nullable(str),
	replica: bool,
	// Folders whose audio is uploaded to the hub inbox.
	watch: arr(str),
	extensions: arr(str),
	pollSeconds: optional(int),
	downloadConcurrency: optional(int),
	uploadConcurrency: optional(int),
	// Stop downloading below this much free disk.
	minFreeBytes: optional(int),
	// Days a removed file stays in the local trash.
	trashDays: optional(int),
	rekordbox: optional(
		obj({
			enabled: bool,
			// master.db when it is not where Rekordbox keeps it by default.
			dbPath: optional(str),
			// DjmdProperty.DBVersion values the writer may write (overrides core's list).
			allowedDbVersions: optional(arr(str)),
			backupKeep: optional(int),
		}),
	),
});

export type StoredConfig = Infer<typeof ConfigCheck>;

export interface AgentConfig {
	hubUrl: string;
	key: string;
	name: string;
	localRoot: string | null;
	replica: boolean;
	watch: string[];
	extensions: string[];
	pollSeconds: number;
	downloadConcurrency: number;
	uploadConcurrency: number;
	minFreeBytes: number;
	trashDays: number;
	rekordbox: {
		enabled: boolean;
		dbPath: string | null;
		allowedDbVersions: string[] | null;
		backupKeep: number;
	};
}

export interface AgentPaths {
	dir: string;
	config: string;
	state: string;
	log: string;
	anlzCache: string;
}

export function agentPaths(dir = configDir()): AgentPaths {
	return {
		dir,
		config: join(dir, "config.json"),
		state: join(dir, "state.sqlite"),
		log: join(dir, "logs", "agent.log"),
		anlzCache: join(dir, "anlz-cache"),
	};
}

export function withDefaults(stored: StoredConfig): AgentConfig {
	return {
		hubUrl: stored.hubUrl.replace(/\/+$/, ""),
		key: stored.key,
		name: stored.name,
		localRoot: stored.localRoot,
		replica: stored.replica && stored.localRoot !== null,
		watch: stored.watch,
		extensions: stored.extensions.map((e) => e.toLowerCase()),
		pollSeconds: stored.pollSeconds ?? 60,
		downloadConcurrency: stored.downloadConcurrency ?? 3,
		uploadConcurrency: stored.uploadConcurrency ?? 2,
		minFreeBytes: stored.minFreeBytes ?? 1024 ** 3,
		trashDays: stored.trashDays ?? 30,
		rekordbox: {
			enabled: stored.rekordbox?.enabled ?? true,
			dbPath: stored.rekordbox?.dbPath ?? null,
			allowedDbVersions: stored.rekordbox?.allowedDbVersions ?? null,
			backupKeep: stored.rekordbox?.backupKeep ?? 5,
		},
	};
}

export class NotPairedError extends Error {
	constructor() {
		super(
			"this machine is not paired: run `trackvault-agent pair <hubUrl> <key>`",
		);
		this.name = "NotPairedError";
	}
}

export async function readStored(paths: AgentPaths): Promise<StoredConfig> {
	let text: string;
	try {
		text = await readFile(paths.config, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT")
			throw new NotPairedError();
		throw error;
	}
	return parse(ConfigCheck, JSON.parse(text));
}

export async function loadConfig(paths = agentPaths()): Promise<AgentConfig> {
	return withDefaults(await readStored(paths));
}

// Written atomically, readable by its user only (the file holds the device key).
export async function saveStored(
	paths: AgentPaths,
	stored: StoredConfig,
): Promise<void> {
	await mkdir(paths.dir, { recursive: true });
	const tmp = `${paths.config}.tmp`;
	await writeFile(tmp, `${JSON.stringify(stored, null, "\t")}\n`, {
		mode: 0o600,
	});
	await chmod(tmp, 0o600).catch(() => {});
	await rename(tmp, paths.config);
}
