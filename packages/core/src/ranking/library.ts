import { classifyMix, type MixClass } from "../dedupe/versions.ts";
import {
	fold,
	type NormalizedTrack,
	normalizeTrack,
} from "../normalize/index.ts";
import { ratio, tokenSetSimilarity } from "../similarity/index.ts";

export type LibraryTrackId = string | number;

export interface LibraryEntry {
	id: LibraryTrackId;
	artist: string | null;
	title: string | null;
	durationMs?: number | null;
}

export interface WantLike {
	artist: string;
	title: string;
	mix?: string | null;
	durationSec?: number | null;
}

export interface LookupKeys {
	// Folded main artists and base title (see normalize blockKey).
	blockKey: string;
	// Folded base title alone: catches artist spelled differently or swapped.
	titleKey: string;
}

// The hub implements this over its FTS index; createMemoryLibraryIndex is the
// in-memory one for tests and small libraries. `lookup` may over-return: the
// matcher verifies every entry.
export interface LibraryIndex {
	lookup(keys: LookupKeys): LibraryEntry[] | Promise<LibraryEntry[]>;
}

export function createMemoryLibraryIndex(
	entries: Iterable<LibraryEntry>,
): LibraryIndex {
	const byBlock = new Map<string, LibraryEntry[]>();
	const byTitle = new Map<string, LibraryEntry[]>();
	const push = (m: Map<string, LibraryEntry[]>, k: string, e: LibraryEntry) => {
		const list = m.get(k);
		if (list) list.push(e);
		else m.set(k, [e]);
	};
	for (const e of entries) {
		const n = normalizeTrack(e);
		push(byBlock, n.blockKey, e);
		const t = fold(n.titleBase);
		if (t !== "") push(byTitle, t, e);
	}
	return {
		lookup(keys) {
			const out = new Map<LibraryTrackId, LibraryEntry>();
			for (const e of byBlock.get(keys.blockKey) ?? []) out.set(e.id, e);
			for (const e of (byTitle.get(keys.titleKey) ?? []).slice(0, 50))
				out.set(e.id, e);
			return [...out.values()];
		},
	};
}

export type HaveStatus =
	// Same song and version.
	| "have"
	// Same song, another version (remix, instrumental ...).
	| "other-version"
	// Probably, but below the confident threshold.
	| "maybe"
	| "none";

export interface LibraryMatch {
	status: HaveStatus;
	// 0..1, of the best entry.
	confidence: number;
	entries: Array<{
		id: LibraryTrackId;
		confidence: number;
		sameVersion: boolean;
	}>;
}

export interface MatchOptions {
	// Default 0.9.
	haveAt?: number;
	// Default 0.78.
	maybeAt?: number;
}

export function wantKeys(want: WantLike): {
	norm: NormalizedTrack;
	keys: LookupKeys;
	mix: MixClass;
} {
	const withMix =
		want.mix && want.mix.trim() !== ""
			? `${want.title} (${want.mix})`
			: want.title;
	const norm = normalizeTrack({ title: withMix, artist: want.artist });
	return {
		norm,
		keys: { blockKey: norm.blockKey, titleKey: fold(norm.titleBase) },
		mix: classifyMix(norm.mixName, norm.remixer),
	};
}

// A plain want is satisfied by any non-remix cut of the song; a specific mix
// only by the same mix.
const PLAIN_KINDS = new Set([
	"original",
	"extended",
	"radio",
	"club",
	"remaster",
]);
function sameVersion(want: MixClass, have: MixClass): boolean {
	if (want.key === have.key) return true;
	return want.kind === "original" && PLAIN_KINDS.has(have.kind);
}

export function scoreEntry(
	want: { norm: NormalizedTrack; mix: MixClass; durationSec?: number | null },
	entry: LibraryEntry,
): { confidence: number; sameVersion: boolean } {
	const n = normalizeTrack(entry);
	const title = ratio(fold(want.norm.titleBase), fold(n.titleBase));
	const wa = want.norm.artists.map(fold).join(" ");
	const ea = n.artists.map(fold).join(" ");
	const wTokens = new Set(wa.split(" "));
	const subset =
		wa !== "" && ea.split(" ").every((t) => wTokens.has(t) || wa.includes(t));
	const artist =
		subset || [...wTokens].every((t) => ea.includes(t))
			? 1
			: tokenSetSimilarity(wa, ea);
	let confidence = 0.6 * title + 0.4 * artist;
	if (want.durationSec && entry.durationMs) {
		const diff = Math.abs(want.durationSec - entry.durationMs / 1000);
		if (diff > 15 && diff / want.durationSec > 0.15) confidence *= 0.9;
	}
	return {
		confidence,
		sameVersion: sameVersion(want.mix, classifyMix(n.mixName, n.remixer)),
	};
}

// "Already have it": looks the want up by blocking keys, verifies each entry,
// and reports whether the library has this song in this version.
export async function alreadyInLibrary(
	want: WantLike,
	index: LibraryIndex,
	options: MatchOptions = {},
): Promise<LibraryMatch> {
	const haveAt = options.haveAt ?? 0.9;
	const maybeAt = options.maybeAt ?? 0.78;
	const w = wantKeys(want);
	const found = await index.lookup(w.keys);
	const scored = found
		.map((e) => ({
			id: e.id,
			...scoreEntry({ ...w, durationSec: want.durationSec }, e),
		}))
		.filter((s) => s.confidence >= maybeAt)
		.sort((a, b) => b.confidence - a.confidence);
	const sameVer = scored.filter((s) => s.sameVersion);
	const best = sameVer[0];
	if (best && best.confidence >= haveAt)
		return { status: "have", confidence: best.confidence, entries: sameVer };
	if (best)
		return { status: "maybe", confidence: best.confidence, entries: sameVer };
	const other = scored.find((s) => s.confidence >= haveAt);
	if (other)
		return {
			status: "other-version",
			confidence: other.confidence,
			entries: scored,
		};
	return { status: "none", confidence: 0, entries: [] };
}
