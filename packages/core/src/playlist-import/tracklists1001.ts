import type { Want } from "../wishlist/types.ts";
import {
	decodeEntities,
	dedupeWants,
	makeWant,
	type ParseResult,
} from "./common.ts";

// FRAGILE. 1001tracklists has no API and its pages sit behind bot protection:
// a plain fetch is often refused, so the hub should also accept pasted/saved
// HTML. The parser relies on markup seen on tracklist pages: one `tlpItem`
// element per row holding `<meta itemprop="name" content="Artist - Title">`
// (fallback: the `trackValue` span text). If the site changes those names the
// result is empty and a warning says so; nothing here guesses beyond that.

const UNKNOWN = /^(?:id|id\s*-\s*id|unknown|\?+)(?:\s|$)/i;
const stripTags = (s: string) =>
	decodeEntities(s.replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ")
		.trim();

export function parse1001Tracklist(
	html: string,
	ref = "1001tracklists",
): ParseResult {
	const warnings: string[] = [];
	const wants: Want[] = [];
	const name =
		/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i.exec(html)?.[1] ??
		/<title>([^<]*)<\/title>/i.exec(html)?.[1] ??
		null;
	const chunks = html.split(/<div[^>]+class="[^"]*\btlpItem\b[^"]*"/i).slice(1);
	if (chunks.length === 0)
		warnings.push(
			"no tlpItem rows found: page layout changed or HTML is a bot-check page",
		);
	let unidentified = 0;
	for (const chunk of chunks) {
		// A row ends where the next begins (split above), so this stays in the row.
		const meta = /<meta[^>]+itemprop="name"[^>]+content="([^"]*)"/i.exec(
			chunk,
		)?.[1];
		const span =
			/class="[^"]*\btrackValue\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(
				chunk,
			)?.[1];
		let label = meta ? decodeEntities(meta) : span ? stripTags(span) : "";
		label = label.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
		if (label === "") continue;
		if (UNKNOWN.test(label)) {
			unidentified++;
			continue;
		}
		const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(label);
		const want = m
			? makeWant("1001tracklists", ref, m[1] as string, m[2] as string)
			: null;
		if (want) wants.push(want);
		else warnings.push(`unparsed row: ${label.slice(0, 60)}`);
	}
	if (unidentified > 0)
		warnings.push(`${unidentified} unidentified (ID) tracks skipped`);
	return {
		name: name
			? decodeEntities(name)
					.replace(/\s*\|\s*1001Tracklists.*$/i, "")
					.trim()
			: null,
		wants: dedupeWants(wants),
		warnings,
	};
}
