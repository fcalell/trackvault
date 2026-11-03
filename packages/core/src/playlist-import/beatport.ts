import type { Want } from "../wishlist/types.ts";
import {
	decodeEntities,
	dedupeWants,
	makeWant,
	type ParseResult,
} from "./common.ts";

// Beatport's public pages are a Next.js app that embeds the page's data as
// `<script id="__NEXT_DATA__">` JSON; charts, playlists and release pages all
// carry track objects { name, mix_name, artists:[{name}], label:{name}, length_ms }.
// The official API (api.beatport.com/v4) needs OAuth credentials, so it is not
// used. FRAGILE: the embedded JSON's nesting changes, hence the shape-based
// walk below instead of a fixed path; the field names are what must hold.

interface BeatportTrack {
	name?: unknown;
	mix_name?: unknown;
	artists?: unknown;
	label?: unknown;
	length_ms?: unknown;
	isrc?: unknown;
}

const isTrack = (v: unknown): v is BeatportTrack => {
	if (typeof v !== "object" || v === null) return false;
	const t = v as BeatportTrack;
	return (
		typeof t.name === "string" &&
		Array.isArray(t.artists) &&
		t.artists.length > 0 &&
		"mix_name" in t
	);
};

function walk(node: unknown, out: BeatportTrack[], depth = 0): void {
	if (depth > 40 || typeof node !== "object" || node === null) return;
	if (isTrack(node)) {
		out.push(node);
		return;
	}
	for (const v of Array.isArray(node) ? node : Object.values(node))
		walk(v, out, depth + 1);
}

// For JSON the hub already holds (a __NEXT_DATA__ payload or an API response).
export function parseBeatportJson(
	data: unknown,
	ref = "beatport",
): ParseResult {
	const found: BeatportTrack[] = [];
	walk(data, found);
	const wants: Want[] = [];
	for (const t of found) {
		const artists = (t.artists as Array<{ name?: unknown }>)
			.map((a) => (typeof a.name === "string" ? a.name : ""))
			.filter(Boolean)
			.join(", ");
		const label = (t.label as { name?: unknown } | null)?.name;
		const want = makeWant("beatport", ref, artists, t.name as string, {
			mix: typeof t.mix_name === "string" ? t.mix_name : null,
			durationSec: typeof t.length_ms === "number" ? t.length_ms / 1000 : null,
			isrc: typeof t.isrc === "string" ? t.isrc : null,
			label: typeof label === "string" ? label : null,
		});
		if (want) wants.push(want);
	}
	return {
		name: null,
		wants: dedupeWants(wants),
		warnings:
			found.length === 0 ? ["no track objects found in the Beatport data"] : [],
	};
}

export function parseBeatportPage(html: string, ref = "beatport"): ParseResult {
	const raw = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(
		html,
	)?.[1];
	const name = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(
		html,
	)?.[1];
	if (!raw)
		return {
			name: null,
			wants: [],
			warnings: ["no __NEXT_DATA__ in page: layout changed or bot-check page"],
		};
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return {
			name: null,
			wants: [],
			warnings: ["__NEXT_DATA__ is not valid JSON"],
		};
	}
	const r = parseBeatportJson(data, ref);
	return { ...r, name: name ? decodeEntities(name) : null };
}
