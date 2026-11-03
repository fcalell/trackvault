import { fold, parseTitle, splitArtists } from "../normalize/index.ts";
import type { Want } from "./types.ts";

export interface QueryOptions {
	// Variants returned at most. Default 6.
	maxVariants?: number;
	// Soulseek "-term" exclusions appended to every query.
	exclude?: readonly string[];
}

// Soulseek matches every word, in any order, against the whole path. Punctuation
// only hurts, so a query is plain words.
function words(text: string): string {
	return text
		.replace(/[([][^()[\]]*[)\]]/g, " ")
		.replace(/\b(?:feat\.?|ft\.?|featuring)\b.*$/i, " ")
		.replace(/&/g, " ")
		.replace(/[^\p{L}\p{N}']+/gu, " ")
		.replace(/'/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

const noAccents = (s: string) => s.normalize("NFKD").replace(/\p{M}+/gu, "");

// Queries to try in order, most specific first; later ones are looser. The
// search helper stops at the first that yields acceptable candidates, and the
// retry policy rotates through them.
export function buildQueries(
	want: Pick<Want, "artist" | "title" | "mix">,
	options: QueryOptions = {},
): string[] {
	const parsed = parseTitle(want.title);
	const base = words(parsed.base || want.title);
	const artists = splitArtists(
		want.artist.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, ""),
	)
		.map(words)
		.filter(Boolean);
	const main = artists[0] ?? "";
	const allArtists = words(artists.join(" "));
	const mixText = words(want.mix ?? parsed.mixName ?? "");
	const hasMix =
		fold(mixText) !== "" && !/^original( mix| version)?$/i.test(mixText);

	const variants: string[] = [];
	if (hasMix) variants.push(`${allArtists} ${base} ${mixText}`);
	variants.push(`${allArtists} ${base}`);
	if (main && main !== allArtists) variants.push(`${main} ${base}`);
	if (hasMix) variants.push(`${base} ${mixText}`);
	variants.push(base);
	// Last resort: the longest title words only (filenames often drop the small ones).
	const longest = base
		.split(" ")
		.filter((w) => w.length > 2)
		.sort((a, b) => b.length - a.length)
		.slice(0, 3);
	if (longest.length >= 2 && main)
		variants.push(`${main} ${longest.join(" ")}`);
	const folded = noAccents(variants[1] ?? "");
	if (folded && folded !== variants[1]) variants.push(folded);

	const seen = new Set<string>();
	const out: string[] = [];
	const suffix = (options.exclude ?? []).map((t) => `-${t}`).join(" ");
	for (const v of variants) {
		const q = v.replace(/\s+/g, " ").trim();
		const key = fold(q);
		if (key === "" || seen.has(key)) continue;
		seen.add(key);
		out.push(suffix ? `${q} ${suffix}` : q);
		if (out.length >= (options.maxVariants ?? 6)) break;
	}
	return out;
}
