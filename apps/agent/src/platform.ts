import { mkdir, statfs } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";

export const platform: "darwin" | "win32" | "linux" =
	process.platform === "darwin" || process.platform === "win32"
		? process.platform
		: "linux";

export const hostName = hostname();

// Where the agent keeps config.json, state.sqlite, logs and caches:
//   macOS   ~/Library/Application Support/TrackVault
//   Windows %APPDATA%\TrackVault
//   Linux   $XDG_CONFIG_HOME/trackvault, else ~/.config/trackvault
// `TRACKVAULT_AGENT_HOME` overrides it (a second agent on one machine, tests).
export function configDir(
	env: NodeJS.ProcessEnv = process.env,
	home = homedir(),
): string {
	if (env.TRACKVAULT_AGENT_HOME) return env.TRACKVAULT_AGENT_HOME;
	if (platform === "darwin")
		return join(home, "Library", "Application Support", "TrackVault");
	if (platform === "win32")
		return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "TrackVault");
	return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "trackvault");
}

export function defaultRoot(home = homedir()): string {
	return join(home, "Music", "TrackVault");
}

export interface Disk {
	free: number;
	total: number;
}

// Free and total bytes of the filesystem holding `path` (the nearest existing parent).
export async function diskSpace(path: string): Promise<Disk | null> {
	let dir = path;
	for (let i = 0; i < 64; i++) {
		try {
			const s = await statfs(dir);
			return {
				free: Number(s.bavail) * s.bsize,
				total: Number(s.blocks) * s.bsize,
			};
		} catch {
			const parent = dirname(dir);
			if (parent === dir) return null;
			dir = parent;
		}
	}
	return null;
}

export async function ensureDir(path: string): Promise<void> {
	await mkdir(path, { recursive: true });
}

// Case-insensitive filesystems (macOS and Windows defaults) compare paths folded.
export function pathKey(path: string): string {
	const slashed = path.replace(/\\/g, "/");
	return platform === "linux" ? slashed : slashed.toLowerCase();
}
