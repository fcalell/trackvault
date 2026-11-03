import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface RekordboxInstall {
	// Where the library lives (contains master.db, share/, masterPlaylists6.xml).
	dbDir: string;
	dbPath: string;
	// `<dbDir>/share`: the ANLZ files live under it (`AnalysisDataPath` is relative to it).
	shareDir: string;
	// How the directory was found.
	source: "options.json" | "default";
	dbExists: boolean;
	// The Pioneer app-data directory the options file was read from, if any.
	optionsPath: string | null;
}

// Rekordbox 6/7 keep the library under `Pioneer/rekordbox`, and the agent's
// options under `<app data>/Pioneer/rekordboxAgent/storage/options.json`:
//   macOS:   ~/Library/Pioneer/rekordbox            (library)
//            ~/Library/Application Support/Pioneer/rekordboxAgent/storage/options.json
//   Windows: %APPDATA%\Pioneer\rekordbox            (library)
//            %APPDATA%\Pioneer\rekordboxAgent\storage\options.json
// The two macOS roots differ; both are tried. Sources: the task brief and
// pyrekordbox (config.py `get_pioneer_app_dir`, `read_rekordbox6_options`).
export function defaultRoots(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	home = homedir(),
): { libraryDirs: string[]; optionsFiles: string[] } {
	if (platform === "win32") {
		const appData = env.APPDATA ?? join(home, "AppData", "Roaming");
		return {
			libraryDirs: [join(appData, "Pioneer", "rekordbox")],
			optionsFiles: [
				join(appData, "Pioneer", "rekordboxAgent", "storage", "options.json"),
			],
		};
	}
	return {
		libraryDirs: [join(home, "Library", "Pioneer", "rekordbox")],
		optionsFiles: [
			join(
				home,
				"Library",
				"Application Support",
				"Pioneer",
				"rekordboxAgent",
				"storage",
				"options.json",
			),
			join(
				home,
				"Library",
				"Pioneer",
				"rekordboxAgent",
				"storage",
				"options.json",
			),
		],
	};
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

// options.json is `{"options": [["key", value], ...]}`; this returns it as a map.
// The database path is the `db-path` option. Null when the file is absent or
// unreadable.
export async function readRekordboxOptions(
	optionsPath: string,
): Promise<Record<string, unknown> | null> {
	try {
		const data = JSON.parse(await readFile(optionsPath, "utf8")) as {
			options?: [string, unknown][];
		};
		const out: Record<string, unknown> = {};
		for (const entry of data.options ?? []) {
			if (Array.isArray(entry) && typeof entry[0] === "string")
				out[entry[0]] = entry[1];
		}
		return out;
	} catch {
		return null;
	}
}

function install(
	dbPath: string,
	source: RekordboxInstall["source"],
	optionsPath: string | null,
	dbExists: boolean,
): RekordboxInstall {
	const dbDir = dirname(dbPath);
	return {
		dbDir,
		dbPath,
		shareDir: join(dbDir, "share"),
		source,
		dbExists,
		optionsPath,
	};
}

// The Rekordbox library of this machine: the `db-path` of options.json when set,
// else the default directory. Null when neither has a master.db.
export async function findRekordboxInstall(
	roots = defaultRoots(),
): Promise<RekordboxInstall | null> {
	for (const optionsPath of roots.optionsFiles) {
		const options = await readRekordboxOptions(optionsPath);
		const dbPath = options?.["db-path"];
		if (typeof dbPath === "string" && dbPath !== "") {
			const found = await exists(dbPath);
			if (found) return install(dbPath, "options.json", optionsPath, true);
		}
	}
	for (const dir of roots.libraryDirs) {
		const dbPath = join(dir, "master.db");
		if (await exists(dbPath)) return install(dbPath, "default", null, true);
	}
	return null;
}

// Absolute path of a track's ANLZ file of one kind ("DAT" | "EXT" | "2EX"), from
// `AnalysisDataPath` (".../ANLZ0000.DAT", relative to `share`, with a leading "/").
export function anlzPathFor(
	shareDir: string,
	analysisDataPath: string,
	kind: "DAT" | "EXT" | "2EX" = "DAT",
): string {
	const rel = analysisDataPath
		.replace(/^[\\/]+/, "")
		.replace(/\.[A-Za-z0-9]+$/, `.${kind}`);
	return join(shareDir, ...rel.split(/[\\/]+/));
}
