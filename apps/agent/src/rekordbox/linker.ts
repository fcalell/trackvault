import { stat } from "node:fs/promises";
import { hashFile } from "@trackvault/core/hash";
import { isUnderRoot } from "@trackvault/core/paths";
import { type RbTrack, toRekordboxPath } from "@trackvault/core/rekordbox";
import type { Context } from "../context.ts";
import { pathKey } from "../platform.ts";
import { localPath } from "../replica/files.ts";
import type { FileRow, LinkRow } from "../state.ts";
import { errorMessage, pool } from "../util.ts";

export interface LinkResult {
	// contentId -> link, for every linked track of the collection.
	byContent: Map<string, LinkRow>;
	// Links created or re-pointed this run.
	created: LinkRow[];
	unmatched: RbTrack[];
}

// The path a replica file is (or will be) at, in Rekordbox's form.
export function replicaPath(root: string, file: FileRow): string {
	return toRekordboxPath(localPath(root, file.haveRelPath ?? file.relPath));
}

// Maps the Rekordbox collection to hub tracks: by local path first (the content points
// at a replica file), by audio hash second (the content is a copy elsewhere). Hash
// matching only reads files whose size equals a hub file's size, and caches results by
// (path, size, mtime).
export async function refreshLinks(
	ctx: Context,
	collection: readonly RbTrack[],
): Promise<LinkResult> {
	const { state, config, log } = ctx;
	const root = config.localRoot as string;
	const files = state.allFiles().filter((f) => f.state !== "trashed");
	const byTrack = new Map(files.map((f) => [f.trackId, f]));
	const byPath = new Map<string, string>();
	const bySize = new Map<number, FileRow[]>();
	for (const f of files) {
		byPath.set(pathKey(replicaPath(root, f)), f.trackId);
		const list = bySize.get(f.size);
		if (list) list.push(f);
		else bySize.set(f.size, [f]);
	}
	const existing = new Map(state.links().map((l) => [l.contentId, l]));
	const present = new Set(collection.map((t) => t.id));
	const linkedTracks = new Set<string>();
	const byContent = new Map<string, LinkRow>();
	const created: LinkRow[] = [];
	const todo: RbTrack[] = [];
	const unmatched: RbTrack[] = [];

	state.tx(() => {
		for (const l of existing.values())
			if (!present.has(l.contentId)) state.dropLink(l.contentId);
	});

	for (const t of collection) {
		const ex = existing.get(t.id);
		if (ex && byTrack.has(ex.trackId) && !linkedTracks.has(ex.trackId)) {
			linkedTracks.add(ex.trackId);
			const managed = isUnderRoot(root, t.path) ? 1 : 0;
			const link = { ...ex, path: t.path, managed };
			if (ex.path !== t.path || ex.managed !== managed) state.putLink(link);
			byContent.set(t.id, link);
			continue;
		}
		const trackId = byPath.get(pathKey(t.path));
		if (trackId && !linkedTracks.has(trackId)) {
			linkedTracks.add(trackId);
			const link: LinkRow = {
				contentId: t.id,
				trackId,
				via: "path",
				path: t.path,
				managed: 1,
			};
			state.putLink(link);
			byContent.set(t.id, link);
			created.push(link);
			continue;
		}
		todo.push(t);
	}

	// Hash matching for what path matching missed.
	const candidates = todo.filter((t) =>
		t.fileSize === null ? true : bySize.has(t.fileSize),
	);
	for (const t of todo) if (!candidates.includes(t)) unmatched.push(t);
	let hashed = 0;
	await pool(2, async () => {
		for (;;) {
			const t = candidates.pop();
			if (!t || ctx.signal.aborted) return;
			try {
				const info = await stat(t.path);
				const options = bySize.get(info.size);
				if (!options) {
					unmatched.push(t);
					continue;
				}
				const audioHash = await cachedAudioHash(
					ctx,
					t.path,
					info.size,
					Math.floor(info.mtimeMs),
				);
				hashed++;
				const match = options.find(
					(f) => f.audioHash === audioHash && !linkedTracks.has(f.trackId),
				);
				if (!match) {
					unmatched.push(t);
					continue;
				}
				linkedTracks.add(match.trackId);
				const link: LinkRow = {
					contentId: t.id,
					trackId: match.trackId,
					via: "hash",
					path: t.path,
					managed: isUnderRoot(root, t.path) ? 1 : 0,
				};
				state.putLink(link);
				byContent.set(t.id, link);
				created.push(link);
			} catch (error) {
				// A missing file or an unreadable one stays unmatched.
				log.debug(`link: ${t.path}: ${errorMessage(error)}`);
				unmatched.push(t);
			}
		}
	});
	if (hashed > 0) log.info(`rekordbox: hashed ${hashed} files to match tracks`);
	return { byContent, created, unmatched };
}

async function cachedAudioHash(
	ctx: Context,
	path: string,
	size: number,
	mtimeMs: number,
): Promise<string> {
	const row = ctx.state.db
		.prepare("select * from rb_hashes where path = ?")
		.get(path) as
		| { size: number; mtimeMs: number; audioHash: string }
		| undefined;
	if (row && row.size === size && row.mtimeMs === mtimeMs) return row.audioHash;
	const id = await hashFile(path);
	ctx.state.db
		.prepare(
			"insert into rb_hashes(path, size, mtimeMs, audioHash, fileHash) values(?, ?, ?, ?, ?) on conflict(path) do update set size = excluded.size, mtimeMs = excluded.mtimeMs, audioHash = excluded.audioHash, fileHash = excluded.fileHash",
		)
		.run(path, size, mtimeMs, id.audioHash, id.fileHash);
	return id.audioHash;
}
