import {
	mkdir,
	readdir,
	rename,
	rm,
	rmdir,
	stat,
	unlink,
} from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { safeJoin } from "@trackvault/core/paths";

// File-system helpers of the replica. Everything the agent owns under the root lives in
// `<root>/.trackvault/`: partial downloads and the trash.

export const WORK_DIR = ".trackvault";

export function localPath(root: string, relPath: string): string {
	return safeJoin(root, ...relPath.split("/"));
}

export function partialPath(
	root: string,
	trackId: string,
	fileHash: string,
): string {
	return join(
		root,
		WORK_DIR,
		"partial",
		`${trackId}.${fileHash.slice(0, 16)}.part`,
	);
}

export async function fileSize(path: string): Promise<number | null> {
	try {
		return (await stat(path)).size;
	} catch {
		return null;
	}
}

// Removes empty folders from `from` upward, never the root itself.
export async function pruneEmptyDirs(
	root: string,
	from: string,
): Promise<void> {
	let dir = from;
	while (dir.length > root.length && dir.startsWith(root + sep)) {
		try {
			if ((await readdir(dir)).length > 0) return;
			await rmdir(dir);
		} catch {
			return;
		}
		dir = dirname(dir);
	}
}

// Moves a file inside the filesystem (atomic rename), making the folders.
export async function moveFile(from: string, to: string): Promise<void> {
	await mkdir(dirname(to), { recursive: true });
	await rename(from, to);
}

function dateStamp(date: Date): string {
	return date.toISOString().slice(0, 10);
}

// Moves a removed file into `<root>/.trackvault/trash/<date>/<relPath>`; returns the new
// path. An existing trash entry of the same name gets a time suffix.
export async function moveToTrash(
	root: string,
	relPath: string,
): Promise<string | null> {
	const source = localPath(root, relPath);
	if ((await fileSize(source)) === null) return null;
	const dir = join(root, WORK_DIR, "trash", dateStamp(new Date()));
	let target = join(dir, ...relPath.split("/"));
	if ((await fileSize(target)) !== null) target = `${target}.${Date.now()}`;
	await moveFile(source, target);
	await pruneEmptyDirs(root, dirname(source));
	return target;
}

// Deletes trash folders older than `days`.
export async function purgeTrash(root: string, days: number): Promise<number> {
	const base = join(root, WORK_DIR, "trash");
	let removed = 0;
	let names: string[];
	try {
		names = await readdir(base);
	} catch {
		return 0;
	}
	const cutoff = Date.now() - days * 86_400_000;
	for (const name of names) {
		const at = Date.parse(name);
		if (Number.isNaN(at) || at >= cutoff) continue;
		await rm(join(base, name), { recursive: true, force: true });
		removed++;
	}
	return removed;
}

export async function removeFile(path: string): Promise<void> {
	await unlink(path).catch(() => {});
}
