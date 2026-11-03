import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { safeJoin } from "@trackvault/core/paths";

export const QUARANTINE_DIR = ".quarantine";

// "a/b.mp3" -> ".quarantine/<batch>/a/b.mp3"
export const quarantinePath = (batch: string, path: string): string =>
	`${QUARANTINE_DIR}/${batch}/${path}`;

export async function pathExists(absolute: string): Promise<boolean> {
	const { access } = await import("node:fs/promises");
	return access(absolute).then(
		() => true,
		() => false,
	);
}

// Renames a file inside the library, making its folders; refuses to land on a file.
export async function moveFile(
	root: string,
	from: string,
	to: string,
): Promise<void> {
	const source = safeJoin(root, from);
	const target = safeJoin(root, to);
	if (source === target) return;
	if (
		(await pathExists(target)) &&
		source.toLowerCase() !== target.toLowerCase()
	)
		throw new Error(`${to} already exists`);
	await mkdir(dirname(target), { recursive: true });
	await rename(source, target);
}

// Removes a file for good; a file already gone is fine.
export async function removeFile(root: string, path: string): Promise<void> {
	await rm(safeJoin(root, path), { force: true });
}

// "a/b.mp3" -> "a/b (2).mp3" until `taken` says it is free.
export async function freeName(
	root: string,
	path: string,
	taken: (path: string) => boolean,
): Promise<string> {
	let candidate = path;
	for (let n = 2; ; n++) {
		if (
			!taken(candidate.toLowerCase()) &&
			!(await pathExists(safeJoin(root, candidate)))
		)
			return candidate;
		const dot = path.lastIndexOf(".");
		const slash = path.lastIndexOf("/");
		candidate =
			dot > slash
				? `${path.slice(0, dot)} (${n})${path.slice(dot)}`
				: `${path} (${n})`;
	}
}
