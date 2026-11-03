import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readEmbeddedCover, resizeCover } from "@trackvault/core/art";
import { safeJoin } from "@trackvault/core/paths";
import { statement } from "./raw.ts";
import { readSettings } from "./settings.ts";

// The sizes a cover is served at (the short side's longest edge, in pixels); a
// request for another snaps to the next one up.
export const ART_SIZES = [128, 320, 640, 1000] as const;

export const artSize = (wanted: number): number =>
	ART_SIZES.find((size) => size >= wanted) ?? 1000;

const safeName = (id: string): string => id.replace(/[^\w-]/g, "_");

function artDir(trackId: string): string {
	const file = process.env.DB_FILE;
	if (!file) throw new Error("DB_FILE is not set");
	return join(dirname(file), "art", safeName(trackId).slice(0, 2));
}

// Named by the file's hash: embedding a new cover changes it, and the old
// thumbnails are no longer asked for (and are removed when the next is made).
export const thumbPath = (
	trackId: string,
	fileHash: string,
	size: number,
): string =>
	join(
		artDir(trackId),
		`${safeName(trackId)}-${fileHash.slice(0, 12)}-${size}.jpg`,
	);

const making = new Map<string, Promise<string | null>>();

// The cached thumbnail of a track's embedded cover, made once with ffmpeg
// (core/art resizeCover) on first request. Null when the track has no cover.
export function thumbnail(
	trackId: string,
	size: number,
): Promise<string | null> {
	const row = statement(
		`SELECT f.path AS path, f.file_hash AS hash, t.has_art AS hasArt
		 FROM tracks t JOIN files f ON f.track_id = t.id AND f.state = 'ok'
		 WHERE t.id = @id ORDER BY f.id LIMIT 1`,
	).get({ id: trackId }) as
		| { path: string; hash: string | null; hasArt: number }
		| undefined;
	const root = readSettings().libraryRoot;
	if (!row?.hasArt || !root) return Promise.resolve(null);
	const target = thumbPath(trackId, row.hash ?? "nohash", size);
	if (existsSync(target)) return Promise.resolve(target);
	const key = target;
	let pending = making.get(key);
	if (!pending) {
		pending = (async () => {
			const cover = await readEmbeddedCover(safeJoin(root, row.path));
			if (!cover) return null;
			const small = await resizeCover(cover, size);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(`${target}.tmp`, small.data);
			await rename(`${target}.tmp`, target);
			// Thumbnails of an older cover go.
			const prefix = `${safeName(trackId)}-`;
			for (const name of await readdir(dirname(target)).catch(() => []))
				if (
					name.startsWith(prefix) &&
					!name.startsWith(`${prefix}${(row.hash ?? "nohash").slice(0, 12)}-`)
				)
					await rm(join(dirname(target), name), { force: true });
			return target;
		})().finally(() => making.delete(key));
		making.set(key, pending);
	}
	return pending;
}
