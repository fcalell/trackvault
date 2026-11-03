// Restores the hub's database from a local backup.
//
//   DB_FILE=/var/lib/trackvault/trackvault.sqlite \
//     node src/bin/restore.ts /var/lib/trackvault/backups/trackvault-<time>.sqlite.zst
//   node src/bin/restore.ts --list [--dir <backup folder>]
//
// It stops nothing: stop the hub first (systemctl stop trackvault). It refuses if the
// database is open in another process. The backup is unpacked beside the target and
// checked (integrity_check, tables) before anything is replaced; the database it
// replaces is moved to `<db>.pre-restore-<time>`, never deleted. Start the hub
// afterwards: `stack db apply` brings an older backup up to the current schema.
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseBackupName } from "@trackvault/core/backup";
import {
	checkDatabase,
	decompressFile,
	defaultBackupDir,
	installDatabase,
	listLocal,
	removeBackup,
} from "../server/lib/backup/files.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const at = args.indexOf(name);
	return at >= 0 ? args[at + 1] : undefined;
};
const dbFile = flag("--db") ?? process.env.DB_FILE;
if (!dbFile) {
	console.error(
		"Set DB_FILE (or pass --db <path>) to the database to replace.",
	);
	process.exit(2);
}
const dir = flag("--dir") ?? defaultBackupDir(dbFile);

if (args.includes("--list")) {
	for (const item of listLocal(dir))
		console.log(
			`${item.name}  ${(item.size / 1e6).toFixed(1)} MB  ${item.meta ? (item.meta.verified ? "checked" : "FAILED CHECK") : "no sidecar"}`,
		);
	process.exit(0);
}

const target = args.find(
	(a, i) =>
		!a.startsWith("--") && args[i - 1] !== "--db" && args[i - 1] !== "--dir",
);
if (!target) {
	console.error(
		"Usage: node src/bin/restore.ts <backup file> [--db <path>] [--dir <folder>] | --list",
	);
	process.exit(2);
}
const source = existsSync(target)
	? resolve(target)
	: join(dir, basename(target));
const parsed = parseBackupName(basename(source));
if (!existsSync(source) || !parsed || parsed.encrypted) {
	console.error(
		parsed?.encrypted
			? "That file is encrypted: restore it with src/bin/restore-offsite.ts."
			: `Not a backup file: ${source}`,
	);
	process.exit(2);
}

const scratch = join(
	dirname(resolve(dbFile)),
	`.restore-${process.pid}.sqlite`,
);
try {
	console.log(`Unpacking ${basename(source)}`);
	await decompressFile(source, scratch, parsed.compression);
	const check = checkDatabase(scratch);
	if (check.integrity !== "ok" || check.problems.length > 0)
		throw new Error(
			`The backup is damaged: ${[check.integrity, ...check.problems].join("; ")}`,
		);
	const { movedAside } = installDatabase(scratch, dbFile);
	console.log(
		`Restored ${dbFile}: ${check.rows.tracks ?? 0} tracks, ${check.rows.files ?? 0} files, ${check.migrations} migrations.`,
	);
	if (movedAside) console.log(`The previous database is at ${movedAside}`);
	console.log("Start the hub now; it applies any newer migrations on start.");
} catch (error) {
	removeBackup(scratch);
	console.error((error as Error).message);
	process.exit(1);
}
