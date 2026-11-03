import { fold, parseTitle } from "../normalize/index.ts";
import type { Want, WantSource } from "../wishlist/types.ts";

export interface ParseResult {
	// Playlist/page name when the source has one.
	name: string | null;
	wants: Want[];
	// Things skipped or guessed; shown to the user, never fatal.
	warnings: string[];
}

export function decodeEntities(s: string): string {
	return s
		.replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
			String.fromCodePoint(Number.parseInt(h, 16)),
		)
		.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
		.replace(/&quot;/g, '"')
		.replace(/&apos;|&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&");
}

// A want from "Title (Mix)" and an artist; the mix moves out of the title.
export function makeWant(
	source: WantSource,
	sourceRef: string,
	artist: string,
	title: string,
	extra: {
		mix?: string | null;
		durationSec?: number | null;
		isrc?: string | null;
		label?: string | null;
	} = {},
): Want | null {
	const a = artist.replace(/\s+/g, " ").trim();
	const parsed = parseTitle(title);
	const t = (parsed.base || title).replace(/\s+/g, " ").trim();
	if (fold(a) === "" || fold(t) === "") return null;
	const mix = extra.mix?.trim() || parsed.mixName;
	return {
		artist: a,
		title: t,
		mix: mix && fold(mix) !== "" ? mix : null,
		source,
		sourceRef,
		status: "wanted",
		durationSec: extra.durationSec ?? null,
		isrc: extra.isrc ?? null,
		label: extra.label ?? null,
	};
}

// Same artist+title+mix twice in one import is one want.
export function dedupeWants(wants: readonly Want[]): Want[] {
	const seen = new Set<string>();
	return wants.filter((w) => {
		const k = `${fold(w.artist)}|${fold(w.title)}|${fold(w.mix)}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

export interface FetchTextOptions {
	timeoutMs?: number;
	headers?: Record<string, string>;
	fetch?: typeof fetch;
}

// For the HTML-based sources. Several of them sit behind bot protection and
// answer 403 to a plain request: the hub can then take pasted HTML instead.
export async function fetchText(
	url: string,
	o: FetchTextOptions = {},
): Promise<string> {
	const res = await (o.fetch ?? fetch)(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (compatible; TrackVault)",
			"Accept-Language": "en",
			...o.headers,
		},
		signal: AbortSignal.timeout(o.timeoutMs ?? 20_000),
	});
	if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
	return res.text();
}
