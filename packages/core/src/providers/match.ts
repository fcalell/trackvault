import { fold, mixKey, parseTitle, splitArtists } from "../normalize/index.ts";
import { ratio, tokenSetSimilarity } from "../similarity/index.ts";
import type { TrackFacts } from "./types.ts";

export interface RecordFacts {
	title: string | null | undefined;
	artist: string | null | undefined;
	durationSec?: number | null;
}

// How well a provider's record matches the track, 0..1: title (mix-aware),
// artist (any shared credited artist counts) and duration (full marks within
// 3 s, nothing past 15 s). Missing sides are left out and the rest re-weighted.
export function matchScore(facts: TrackFacts, record: RecordFacts): number {
	const parts: Array<[weight: number, score: number]> = [];
	if (facts.title && record.title) {
		const a = parseTitle(facts.title);
		const b = parseTitle(record.title);
		let s = ratio(fold(a.base), fold(b.base));
		if (mixKey(a.mixName) !== mixKey(b.mixName)) s *= 0.85;
		parts.push([0.5, s]);
	}
	if (facts.artist && record.artist) {
		const mine = splitArtists(facts.artist).map(fold);
		const theirs = splitArtists(record.artist).map(fold);
		let best = tokenSetSimilarity(fold(facts.artist), fold(record.artist));
		for (const x of mine)
			for (const y of theirs) best = Math.max(best, ratio(x, y));
		parts.push([0.35, best]);
	}
	if (facts.durationSec && record.durationSec) {
		const d = Math.abs(facts.durationSec - record.durationSec);
		parts.push([0.15, d <= 3 ? 1 : d >= 15 ? 0 : 1 - (d - 3) / 12]);
	}
	const total = parts.reduce((n, [w]) => n + w, 0);
	if (total === 0) return 0;
	return parts.reduce((n, [w, s]) => n + w * s, 0) / total;
}

export const yearOf = (date: string | null | undefined): number | null => {
	const m = /^(\d{4})/.exec(date ?? "");
	return m ? Number(m[1]) : null;
};
