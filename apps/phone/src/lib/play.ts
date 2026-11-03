import { player, windowQueue } from "@fcalell/plugin-native-ui/lib/player";
import type { Track } from "@fcalell/ui-core/descriptors";
import { client, hubUrl } from "./api";

// The player streams from the hub, and the system fetches the lock screen's cover from the
// address alone, so the file and its cover carry their own access: a signed token per track
// (`media.urls`), good for a few hours, opens `/media/<id>` and `/media/<id>/art`. The queue
// makes a track asynchronously, so a track signs itself as the page of rows loads; the calls
// of one page share a single request.
const MARGIN_MS = 10 * 60 * 1000;
const held = new Map<string, { token: string; expiresAt: number }>();
let batch: {
	ids: Set<string>;
	done: Promise<void>;
} | null = null;

async function flush(ids: readonly string[], base: string): Promise<void> {
	const { tokens, expiresAt } = await client.media.urls({ ids: [...ids] });
	for (const [id, token] of Object.entries(tokens))
		held.set(`${base}\0${id}`, { token, expiresAt });
}

async function signed(id: string): Promise<string> {
	const base = hubUrl();
	const kept = held.get(`${base}\0${id}`);
	if (kept && kept.expiresAt - Date.now() >= MARGIN_MS) return kept.token;
	if (!batch) {
		const ids = new Set<string>();
		// The microtask lets every row of the page add its id before the one request.
		batch = {
			ids,
			done: Promise.resolve().then(() => {
				batch = null;
				return flush([...ids], base);
			}),
		};
	}
	batch.ids.add(id);
	await batch.done;
	const token = held.get(`${base}\0${id}`)?.token;
	if (!token) throw new Error("The track could not be signed.");
	return token;
}

/** What a track row needs to be played. */
export interface Playable {
	id: string;
	title: string | null;
	artist: string | null;
	durationMs: number | null;
}

async function toTrack(row: Playable): Promise<Track> {
	const at = `${hubUrl()}/media/${encodeURIComponent(row.id)}`;
	const token = await signed(row.id);
	return {
		src: `${at}?t=${token}`,
		key: row.id,
		title: row.title ?? "Untitled",
		line: row.artist ?? undefined,
		image: `${at}/art?size=128&t=${token}`,
		duration: row.durationMs ? row.durationMs / 1000 : undefined,
	};
}

/** The shape of a window read the queue walks (`orpc.x.window(input)`). */
interface Window {
	readonly page?: (
		offset: number,
	) => Promise<{ data: readonly unknown[]; total: number }>;
}

/**
 * Plays the row at `at` of a window read of tracks, Next and Previous walking the read's
 * own order and filter. `rows` is the rows loaded so far, `at` the playing one's index.
 */
export async function playFrom(
	read: Window,
	rows: readonly Playable[],
	at: number,
) {
	const row = rows[at];
	if (!row || !read.page) return;
	player.play(
		await toTrack(row),
		windowQueue<Playable>(read, { track: toTrack, at }),
	);
}

/** Plays one track (the record's), with no queue. */
export async function playOne(row: Playable) {
	player.play(await toTrack(row));
}
