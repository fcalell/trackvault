import type { ImportBatch } from "./types.ts";

// Splits one import into parts of at most `max` entries per list, so a first import of a
// 50k collection is many small requests. Every part repeats the header fields; the hub
// merges parts as they come and records the base when `part === parts - 1`.
export function splitImportBatch(full: ImportBatch, max = 1000): ImportBatch[] {
	type Lists = Pick<
		ImportBatch,
		"links" | "unmatched" | "playlists" | "cues" | "anlz" | "plays"
	> & {
		added: ImportBatch["tracks"]["added"];
		changed: ImportBatch["tracks"]["changed"];
		removed: ImportBatch["tracks"]["removed"];
	};
	const lists: Lists = {
		links: full.links,
		unmatched: full.unmatched,
		playlists: full.playlists,
		cues: full.cues,
		anlz: full.anlz,
		plays: full.plays,
		added: full.tracks.added,
		changed: full.tracks.changed,
		removed: full.tracks.removed,
	};
	const keys = Object.keys(lists) as (keyof Lists)[];
	const count = Math.max(
		1,
		...keys.map((k) => Math.ceil(lists[k].length / max)),
	);
	const slice = <T>(list: T[], i: number): T[] =>
		list.slice(i * max, (i + 1) * max);
	const parts: ImportBatch[] = [];
	for (let i = 0; i < count; i++) {
		parts.push({
			...full,
			part: i,
			parts: count,
			links: slice(lists.links, i),
			unmatched: slice(lists.unmatched, i),
			tracks: {
				added: slice(lists.added, i),
				changed: slice(lists.changed, i),
				removed: slice(lists.removed, i),
			},
			playlists: slice(lists.playlists, i),
			cues: slice(lists.cues, i),
			anlz: slice(lists.anlz, i),
			plays: slice(lists.plays, i),
		});
	}
	return parts;
}
