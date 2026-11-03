import type { Want } from "../wishlist/types.ts";
import {
	decodeEntities,
	dedupeWants,
	makeWant,
	type ParseResult,
} from "./common.ts";

// Best effort, FRAGILE. oEmbed answers for one video (title + channel) but not
// for a playlist, and there is no key-less playlist API. The playlist page embeds
// `ytInitialData` JSON; its first ~100 rows are readable without a key
// (continuation pages are not followed). YouTube titles are free text, so the
// artist/title split is a guess: the user reviews wants before searching.
// Using the YouTube Data API v3 (playlistItems, API key) would be sturdier and
// is the upgrade path if this proves too lossy.

const NOISE =
	/\s*[([](?:official\s*)?(?:music\s*)?(?:video|audio|lyrics?(?:\s*video)?|visuali[sz]er|hd|hq|4k|explicit|free download|out now|premiere)[)\]]\s*/gi;

export function parseYoutubeTitle(
	rawTitle: string,
	channel?: string | null,
	ref = "youtube",
): Want | null {
	const title = decodeEntities(rawTitle)
		.replace(NOISE, " ")
		.replace(/\s+/g, " ")
		.trim();
	const parts = title.split(/\s+[-–—|]\s+/);
	if (parts.length >= 2)
		return makeWant(
			"youtube",
			ref,
			parts[0] as string,
			parts.slice(1).join(" - "),
		);
	// "Title" alone: the channel is the artist when it is an artist channel.
	const artist = (channel ?? "")
		.replace(/\s*-\s*Topic$/i, "")
		.replace(/VEVO$/i, "")
		.trim();
	return artist ? makeWant("youtube", ref, artist, title) : null;
}

interface Renderer {
	title?: { runs?: Array<{ text?: string }> };
	shortBylineText?: { runs?: Array<{ text?: string }> };
}

function collect(node: unknown, out: Renderer[], depth = 0): void {
	if (depth > 60 || typeof node !== "object" || node === null) return;
	for (const [k, v] of Object.entries(node)) {
		if (k === "playlistVideoRenderer" && typeof v === "object" && v !== null)
			out.push(v as Renderer);
		else collect(v, out, depth + 1);
	}
}

export function parseYoutubePlaylistPage(
	html: string,
	ref = "youtube",
): ParseResult {
	const warnings: string[] = [];
	const json = /ytInitialData\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/.exec(
		html,
	)?.[1];
	if (!json)
		return {
			name: null,
			wants: [],
			warnings: ["no ytInitialData in page (consent wall or layout change)"],
		};
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		return {
			name: null,
			wants: [],
			warnings: ["ytInitialData is not valid JSON"],
		};
	}
	const rows: Renderer[] = [];
	collect(data, rows);
	const wants: Want[] = [];
	for (const r of rows) {
		const t = r.title?.runs?.map((x) => x.text ?? "").join("") ?? "";
		const c = r.shortBylineText?.runs?.[0]?.text ?? null;
		const w = t ? parseYoutubeTitle(t, c, ref) : null;
		if (w) wants.push(w);
		else warnings.push(`could not read artist/title from "${t.slice(0, 60)}"`);
	}
	const name = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(
		html,
	)?.[1];
	return {
		name: name ? decodeEntities(name) : null,
		wants: dedupeWants(wants),
		warnings,
	};
}

// One video: title and channel from oEmbed (no key needed).
export async function fetchYoutubeVideoWant(
	videoUrl: string,
	f: typeof fetch = fetch,
): Promise<Want | null> {
	const res = await f(
		`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`,
		{ signal: AbortSignal.timeout(15_000) },
	);
	if (!res.ok) return null;
	const j = (await res.json()) as { title?: string; author_name?: string };
	return j.title ? parseYoutubeTitle(j.title, j.author_name, videoUrl) : null;
}
