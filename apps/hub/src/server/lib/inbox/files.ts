import {
	copyFile,
	mkdir,
	readdir,
	rename,
	rm,
	rmdir,
	stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { safeJoin } from "@trackvault/core/paths";
import { AUDIO_EXTENSIONS as SLSKD_AUDIO } from "@trackvault/core/slskd";
import { AUDIO_EXTENSIONS as TAG_AUDIO } from "@trackvault/core/tags";
import { QUARANTINE_DIR } from "../quarantine.ts";
import { INBOX_DIR } from "./paths.ts";

export interface InboxFile {
	// Relative to the library root, "/" separated.
	path: string;
	size: number;
	mtimeMs: number;
}

export const extensionOf = (name: string): string => {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};

// What counts as audio in the inbox: whatever the tag layer reads, and the formats
// Soulseek hands out (those fail with a clear reason until the tag layer takes them).
export const isInboxAudio = (name: string): boolean => {
	const extension = extensionOf(name);
	return TAG_AUDIO.has(`.${extension}`) || SLSKD_AUDIO.has(extension);
};

// Every audio file under `Inbox/`. Hidden entries (partial copies) are skipped.
export async function walkInbox(
	root: string,
	signal?: AbortSignal,
): Promise<InboxFile[]> {
	const out: InboxFile[] = [];
	async function visit(directory: string): Promise<void> {
		signal?.throwIfAborted();
		const entries = await readdir(join(root, directory), {
			withFileTypes: true,
		}).catch(() => []);
		await Promise.all(
			entries.map(async (entry) => {
				if (entry.name.startsWith(".")) return;
				const path = `${directory}/${entry.name}`;
				if (entry.isDirectory()) return visit(path);
				if (!entry.isFile() || !isInboxAudio(entry.name)) return;
				const info = await stat(join(root, path)).catch(() => null);
				if (info?.isFile())
					out.push({
						path,
						size: info.size,
						mtimeMs: Math.floor(info.mtimeMs),
					});
			}),
		);
	}
	await visit(INBOX_DIR);
	return out;
}

// Moves a file across file systems when a plain rename cannot.
export async function moveAcross(from: string, to: string): Promise<void> {
	await mkdir(dirname(to), { recursive: true });
	try {
		await rename(from, to);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
		await copyFile(from, to);
		await rm(from, { force: true });
	}
}

// Folders a move emptied under the inbox, deepest first (`Inbox` itself stays).
export async function pruneInboxFolders(
	root: string,
	paths: readonly string[],
): Promise<void> {
	const folders = new Set<string>();
	for (const path of paths) {
		let folder = dirname(path);
		while (folder !== INBOX_DIR && folder.startsWith(`${INBOX_DIR}/`)) {
			folders.add(folder);
			folder = dirname(folder);
		}
	}
	for (const folder of [...folders].sort((a, b) => b.length - a.length)) {
		try {
			await rmdir(safeJoin(root, folder));
		} catch {}
	}
}

// Rejected inbox files wait here for the quarantine's days, then go for good.
export const REJECTED_DIR = `${QUARANTINE_DIR}/_inbox`;

export async function purgeRejected(
	root: string,
	olderThanDays: number | undefined,
): Promise<number> {
	const base = safeJoin(root, REJECTED_DIR);
	const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
	let removed = 0;
	for (const entry of entries) {
		const path = join(base, entry.name);
		const info = await stat(path).catch(() => null);
		if (!info) continue;
		if (
			olderThanDays !== undefined &&
			Date.now() - info.mtimeMs < olderThanDays * 24 * 3600 * 1000
		)
			continue;
		await rm(path, { recursive: true, force: true });
		removed++;
	}
	return removed;
}
