import { player, windowQueue } from "@fcalell/plugin-native-ui/lib/player";
import type { Track } from "@fcalell/ui-core/descriptors";
import { client, hubUrl } from "./api";

// The player streams from the hub with no headers, so the file and its cover carry their
// own access: a signed token per track (`media.urls`), good for a few hours, opens
// `/media/<id>` and `/media/<id>/art`. A queue signs a page of rows at a time, before the
// rows become tracks, so a track is always made with its token in hand.
const MARGIN_MS = 10 * 60 * 1000;
const signed = new Map<string, { token: string; expiresAt: number }>();

async function sign(ids: readonly string[]): Promise<void> {
	const base = hubUrl();
	const now = Date.now();
	const wanted = ids.filter((id) => {
		const held = signed.get(`${base}\0${id}`);
		return !held || held.expiresAt - now < MARGIN_MS;
	});
	if (wanted.length === 0) return;
	const { tokens, expiresAt } = await client.media.urls({ ids: wanted });
	for (const [id, token] of Object.entries(tokens))
		signed.set(`${base}\0${id}`, { token, expiresAt });
}

/** What a track row needs to be played. */
export interface Playable {
	id: string;
	title: string | null;
	artist: string | null;
	durationMs: number | null;
}

function toTrack(row: Playable): Track {
	const base = hubUrl();
	const token = signed.get(`${base}\0${row.id}`)?.token;
	if (!token) throw new Error("The track is not signed.");
	const at = `${base}/media/${encodeURIComponent(row.id)}`;
	return {
		src: `${at}?t=${token}`,
		key: row.id,
		title: row.title ?? "Untitled",
		meta: row.artist ?? undefined,
		artwork: `${at}/art?size=128&t=${token}`,
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
	const page = read.page;
	await sign([row.id]);
	player.play(
		toTrack(row),
		windowQueue<Playable>(
			{
				page: async (offset) => {
					const answer = await page(offset);
					await sign((answer.data as Playable[]).map((r) => r.id));
					return answer;
				},
			},
			{ track: toTrack, at },
		),
	);
}

/** Plays one track (the record's), with no queue. */
export async function playOne(row: Playable) {
	await sign([row.id]);
	player.play(toTrack(row));
}
