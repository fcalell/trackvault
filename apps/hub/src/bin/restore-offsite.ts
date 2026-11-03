// Rebuilds a hub from the offsite bucket on a new box: the newest database backup,
// then every music file under its path, each checked against its hash.
//
//   OFFSITE_ENDPOINT=https://<account>.r2.cloudflarestorage.com OFFSITE_BUCKET=trackvault \
//   OFFSITE_REGION=auto OFFSITE_ACCESS_KEY=... OFFSITE_SECRET_KEY=... [OFFSITE_PREFIX=...] \
//   OFFSITE_KEY=<64 hex, if encrypted> \
//   DB_FILE=/var/lib/trackvault/trackvault.sqlite \
//     node src/bin/restore-offsite.ts --library /srv/music [--db-only] [--at <db object name>]
//
// Stop the hub first. Run it again after an interruption: files already in place with
// the right hash are passed over and partial downloads continue. The library folder
// in the restored database is set to --library.
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	audioKey,
	decryptBuffer,
	decryptTo,
	FileSource,
	MANIFEST_KEY,
	type Manifest,
	parseBackupName,
	unpackManifest,
} from "@trackvault/core/backup";
import { hashFile } from "@trackvault/core/hash";
import { safeJoin } from "@trackvault/core/paths";
import { S3Client } from "@trackvault/core/s3";
import {
	checkDatabase,
	decompressFile,
	installDatabase,
} from "../server/lib/backup/files.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const at = args.indexOf(name);
	return at >= 0 ? args[at + 1] : undefined;
};
const need = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		console.error(`Set ${name}.`);
		process.exit(2);
	}
	return value;
};
const dbFile = flag("--db") ?? need("DB_FILE");
const library = flag("--library");
if (!library && !args.includes("--db-only")) {
	console.error("Pass --library <folder> (where the music goes) or --db-only.");
	process.exit(2);
}
const prefix = (process.env.OFFSITE_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
const rk = (name: string): string => (prefix ? `${prefix}/${name}` : name);
const client = new S3Client({
	endpoint: process.env.OFFSITE_ENDPOINT ?? "",
	region: process.env.OFFSITE_REGION ?? "us-east-1",
	bucket: need("OFFSITE_BUCKET"),
	accessKeyId: need("OFFSITE_ACCESS_KEY"),
	secretAccessKey: need("OFFSITE_SECRET_KEY"),
	virtualHosted: process.env.OFFSITE_VIRTUAL_HOSTED === "1",
});
const key = process.env.OFFSITE_KEY;

const isEncrypted = (data: Buffer): boolean =>
	data.subarray(0, 4).toString("ascii") === "TVE1";
const work = join(dirname(resolve(dbFile)), `.restore-offsite-${process.pid}`);
mkdirSync(work, { recursive: true });

async function fetchPlain(objectKey: string, dest: string): Promise<void> {
	const raw = `${dest}.dl`;
	await client.getToFile(objectKey, raw);
	const probe = await FileSource.open(raw);
	const head = await probe.read(0, 4);
	await probe.close();
	if (head.toString("ascii") !== "TVE1") {
		renameSync(raw, dest);
		return;
	}
	if (!key)
		throw new Error("This object is encrypted: set OFFSITE_KEY to the key.");
	const source = await FileSource.open(raw);
	const out = createWriteStream(dest);
	try {
		await decryptTo(
			source,
			key,
			(plain) =>
				new Promise((res, rej) =>
					out.write(plain, (e) => (e ? rej(e) : res())),
				),
		);
	} finally {
		await new Promise<void>((res) => out.end(res));
		await source.close();
	}
	rmSync(raw, { force: true });
}

try {
	// 1. The database.
	const names: { key: string; name: string; at: Date }[] = [];
	for await (const o of client.list(rk("db/"))) {
		const name = o.key.slice(o.key.lastIndexOf("/") + 1);
		const parsed = parseBackupName(name);
		if (parsed) names.push({ key: o.key, name, at: parsed.at });
	}
	names.sort((a, b) => b.at.getTime() - a.at.getTime());
	const chosen = flag("--at")
		? names.find((n) => n.name === flag("--at"))
		: names[0];
	if (!chosen) throw new Error("No database backup in the bucket.");
	console.log(`Database backup ${chosen.name}`);
	const packed = join(work, chosen.name.replace(/\.enc$/, ""));
	await fetchPlain(chosen.key, packed);
	const parsed = parseBackupName(chosen.name.replace(/\.enc$/, ""));
	const unpacked = join(work, "db.sqlite");
	await decompressFile(packed, unpacked, parsed?.compression ?? "none");
	const check = checkDatabase(unpacked);
	if (check.integrity !== "ok" || check.problems.length > 0)
		throw new Error(
			`The backup is damaged: ${[check.integrity, ...check.problems].join("; ")}`,
		);
	// 2. The manifest, to know the files; else the restored database's own list.
	let files: Manifest["files"] = [];
	if (library) {
		try {
			let data = await client.getBuffer(rk(MANIFEST_KEY));
			if (isEncrypted(data)) {
				if (!key)
					throw new Error(
						"The manifest is encrypted: set OFFSITE_KEY to the key.",
					);
				data = await decryptBuffer(data, key);
			}
			files = unpackManifest(data).files;
			console.log(`Manifest lists ${files.length} files`);
		} catch (error) {
			if ((error as Error).message.includes("OFFSITE_KEY")) throw error;
			console.log(
				"No usable manifest; reading the file list from the database",
			);
			const db = new DatabaseSync(unpacked, { readOnly: true });
			files = (
				db
					.prepare(
						`SELECT f.path AS path, t.audio_hash AS audioHash, f.file_hash AS fileHash, f.size AS size
					   FROM files f JOIN tracks t ON t.id = f.track_id
					  WHERE f.state = 'ok' AND f.file_hash IS NOT NULL GROUP BY t.id`,
					)
					.all() as {
					path: string;
					audioHash: string;
					fileHash: string;
					size: number;
				}[]
			).map((r) => ({
				...r,
				ext: r.path.split(".").pop()?.toLowerCase() ?? "bin",
			}));
			db.close();
		}
	}
	if (library) {
		const db = new DatabaseSync(unpacked);
		db.prepare("UPDATE settings SET library_root = ?").run(resolve(library));
		db.close();
	}
	const { movedAside } = installDatabase(unpacked, dbFile);
	console.log(
		`Database restored to ${dbFile}${movedAside ? ` (previous at ${movedAside})` : ""}`,
	);
	// 3. The files.
	if (library) {
		let done = 0;
		let failed = 0;
		const queue = [...files];
		const root = resolve(library);
		const worker = async (): Promise<void> => {
			for (let row = queue.shift(); row; row = queue.shift()) {
				const dest = safeJoin(root, row.path);
				try {
					if (
						existsSync(dest) &&
						statSync(dest).size === row.size &&
						(await hashFile(dest)).fileHash === row.fileHash
					) {
						done++;
						continue;
					}
					mkdirSync(dirname(dest), { recursive: true });
					const part = `${dest}.tvpart`;
					await fetchPlain(rkKey(row), part);
					const got = await hashFile(part);
					if (got.audioHash !== row.audioHash)
						throw new Error("hash mismatch after download");
					renameSync(part, dest);
					done++;
				} catch (error) {
					failed++;
					console.error(`${row.path}: ${(error as Error).message}`);
				}
				if (done % 100 === 0) console.log(`${done}/${files.length} files`);
			}
		};
		await Promise.all(Array.from({ length: 4 }, worker));
		console.log(
			`${done} files in place, ${failed} failed${failed ? " (run again to retry)" : ""}`,
		);
		if (failed) process.exitCode = 1;
	}
	console.log("Start the hub now.");
} catch (error) {
	console.error((error as Error).message);
	process.exitCode = 1;
} finally {
	rmSync(work, { recursive: true, force: true });
}

function rkKey(row: { audioHash: string; ext: string }): string {
	return rk(audioKey(row));
}
