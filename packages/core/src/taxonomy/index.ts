import { fold } from "../normalize/index.ts";
import { levenshtein } from "../similarity/index.ts";
import { SEED_GENRES } from "./seed.ts";

export { SEED_GENRES };

// A canonical name and the other spellings that mean it. Genres, artists and
// labels all use this shape: build one taxonomy per kind.
export interface TaxonomyEntry {
	name: string;
	aliases?: readonly string[];
}

interface Candidate {
	key: string;
	name: string;
	alias: boolean;
}

export interface Taxonomy {
	readonly entries: readonly TaxonomyEntry[];
	// Folded canonical name or alias, then the same without spaces.
	readonly byKey: Map<string, Candidate>;
	readonly byCompact: Map<string, Candidate>;
	// Candidates by key length, for the fuzzy scan.
	readonly byLength: Map<number, Candidate[]>;
	readonly cache: Map<string, Resolution>;
}

export type MatchKind = "canonical" | "alias" | "fuzzy" | "none";

export interface Suggestion {
	name: string;
	score: number;
}

export interface Resolution {
	input: string;
	// The canonical name, or null when nothing matched.
	name: string | null;
	match: MatchKind;
	confidence: number;
	// Closest canonical names below the threshold (or beside a fuzzy hit).
	suggestions: Suggestion[];
}

export interface ResolveOptions {
	// Minimum similarity for a fuzzy match (0..1). Default 0.84.
	threshold?: number;
	// Whether to try the fuzzy match at all. Default true.
	fuzzy?: boolean;
	maxSuggestions?: number;
}

const compactOf = (key: string) => key.replace(/ /g, "");

export function buildTaxonomy(entries: readonly TaxonomyEntry[]): Taxonomy {
	const byKey = new Map<string, Candidate>();
	const byCompact = new Map<string, Candidate>();
	const byLength = new Map<number, Candidate[]>();
	const add = (name: string, raw: string, alias: boolean) => {
		const key = fold(raw);
		if (key === "") return;
		const existing = byKey.get(key);
		if (existing && !existing.alias) return;
		const candidate = { key, name, alias };
		byKey.set(key, candidate);
		const compact = compactOf(key);
		const sameCompact = byCompact.get(compact);
		if (!sameCompact || (sameCompact.alias && !alias))
			byCompact.set(compact, candidate);
		if (!existing) {
			const bucket = byLength.get(key.length) ?? [];
			bucket.push(candidate);
			byLength.set(key.length, bucket);
		}
	};
	for (const entry of entries) {
		add(entry.name, entry.name, false);
		for (const alias of entry.aliases ?? []) add(entry.name, alias, true);
	}
	return { entries, byKey, byCompact, byLength, cache: new Map() };
}

// Resolves a raw value to its canonical name: canonical or alias by folded
// text first (also ignoring spaces: "Hip Hop" = "HipHop"), then the closest
// spelling above the threshold. Unknown values carry suggestions.
export function resolveName(
	raw: string | null | undefined,
	taxonomy: Taxonomy,
	options: ResolveOptions = {},
): Resolution {
	const input = raw ?? "";
	const key = fold(input);
	const threshold = options.threshold ?? 0.84;
	const fuzzy = options.fuzzy ?? true;
	const max = options.maxSuggestions ?? 3;
	if (key === "")
		return { input, name: null, match: "none", confidence: 0, suggestions: [] };

	const cacheKey = `${threshold}|${fuzzy}|${max}|${key}`;
	const cached = taxonomy.cache.get(cacheKey);
	if (cached) return { ...cached, input };

	const exact =
		taxonomy.byKey.get(key) ?? taxonomy.byCompact.get(compactOf(key));
	if (exact) {
		const res: Resolution = {
			input,
			name: exact.name,
			match: exact.alias ? "alias" : "canonical",
			confidence: 1,
			suggestions: [],
		};
		taxonomy.cache.set(cacheKey, res);
		return res;
	}

	const best = new Map<string, number>();
	if (fuzzy || max > 0) {
		const maxEdits = Math.ceil(key.length * (1 - Math.min(threshold, 0.6)));
		for (
			let len = Math.max(1, key.length - maxEdits);
			len <= key.length + maxEdits;
			len++
		) {
			const bucket = taxonomy.byLength.get(len);
			if (!bucket) continue;
			for (const c of bucket) {
				const longest = Math.max(c.key.length, key.length);
				const d = levenshtein(key, c.key, Math.floor(longest * 0.4));
				const score = 1 - d / longest;
				if (score < 0.6) continue;
				if (score > (best.get(c.name) ?? 0)) best.set(c.name, score);
			}
		}
	}
	const ranked = [...best.entries()]
		.map(([name, score]) => ({ name, score }))
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
	const top = ranked[0];
	let res: Resolution;
	if (fuzzy && top && top.score >= threshold) {
		res = {
			input,
			name: top.name,
			match: "fuzzy",
			confidence: top.score,
			suggestions: ranked.slice(1, max),
		};
	} else {
		res = {
			input,
			name: null,
			match: "none",
			confidence: 0,
			suggestions: ranked.slice(0, max),
		};
	}
	if (taxonomy.cache.size > 50_000) taxonomy.cache.clear();
	taxonomy.cache.set(cacheKey, res);
	return res;
}

export const resolveGenre = resolveName;
export const resolveArtist = resolveName;
export const resolveLabel = resolveName;

let seeded: Taxonomy | undefined;
// The taxonomy built from the seed genres, built once.
export function seedGenreTaxonomy(): Taxonomy {
	seeded ??= buildTaxonomy(SEED_GENRES);
	return seeded;
}

// The distinct unknown values of a library with how often each occurs and the
// closest known names: the list a user works through to extend the taxonomy.
export function unknownValues(
	values: Iterable<string | null | undefined>,
	taxonomy: Taxonomy,
	options: ResolveOptions = {},
): Array<{ value: string; count: number; suggestions: Suggestion[] }> {
	const counts = new Map<string, { value: string; count: number }>();
	for (const v of values) {
		const key = fold(v);
		if (key === "") continue;
		const entry = counts.get(key);
		if (entry) entry.count++;
		else counts.set(key, { value: v as string, count: 1 });
	}
	const out = [];
	for (const { value, count } of counts.values()) {
		const res = resolveName(value, taxonomy, { ...options, fuzzy: false });
		if (res.name !== null) continue;
		out.push({ value, count, suggestions: res.suggestions });
	}
	return out.sort((a, b) => b.count - a.count);
}
