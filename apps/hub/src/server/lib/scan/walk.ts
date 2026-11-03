import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { AUDIO_EXTENSIONS } from "@trackvault/core/tags";
import { INBOX_DIR, isInboxPath } from "../inbox/paths.ts";

export interface FoundFile {
	// Relative to the library root, "/" separated.
	path: string;
	size: number;
	mtimeMs: number;
	inode: number;
}

// At most `size` filesystem calls in flight: enough to keep an SSD busy, few
// enough not to starve the rest of the process.
function limiter(size: number) {
	let active = 0;
	const waiting: Array<() => void> = [];
	return async function limit<T>(task: () => Promise<T>): Promise<T> {
		if (active >= size)
			await new Promise<void>((resolve) => waiting.push(resolve));
		active++;
		try {
			return await task();
		} finally {
			active--;
			waiting.shift()?.();
		}
	};
}

const extensionOf = (name: string): string => {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

// Reports every audio file at or under `scope` (a relative path: "" is the
// whole library; a file or a folder). Hidden entries and symlinked folders are
// skipped. Only `readdir` and `stat` run here: nothing is opened.
export async function walk(
	root: string,
	scope: string,
	emit: (file: FoundFile) => void,
	signal?: AbortSignal,
): Promise<void> {
	const limit = limiter(64);

	async function statFile(path: string): Promise<void> {
		const info = await limit(() => stat(join(root, path))).catch(() => null);
		if (!info?.isFile()) return;
		emit({
			path,
			size: info.size,
			mtimeMs: Math.floor(info.mtimeMs),
			inode: info.ino,
		});
	}

	async function visit(directory: string): Promise<void> {
		signal?.throwIfAborted();
		const entries = await limit(() =>
			readdir(join(root, directory), { withFileTypes: true }),
		).catch(() => []);
		const tasks: Array<Promise<void>> = [];
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			// The inbox is not the library: its files wait for approval.
			if (directory === "" && entry.name === INBOX_DIR) continue;
			const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
			if (entry.isDirectory()) tasks.push(visit(path));
			else if (
				(entry.isFile() || entry.isSymbolicLink()) &&
				AUDIO_EXTENSIONS.has(extensionOf(entry.name))
			) {
				tasks.push(statFile(path));
			}
		}
		await Promise.all(tasks);
	}

	if (isInboxPath(scope)) return;
	if (scope === "") return visit("");
	const info = await limit(() => stat(join(root, scope))).catch(() => null);
	if (!info) return;
	if (info.isDirectory()) return visit(scope);
	if (AUDIO_EXTENSIONS.has(extensionOf(scope))) return statFile(scope);
}
