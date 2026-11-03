import { type BpmMatch, bpmMatch } from "./bpm.ts";
import {
	type Camelot,
	type KeyMatch,
	keyRelation,
	parseCamelot,
} from "./camelot.ts";

export { type BpmMatch, bpmMatch } from "./bpm.ts";
export * from "./camelot.ts";

export interface MixTrack {
	id: string | number;
	title?: string | null;
	artist?: string | null;
	bpm?: number | null;
	// Any notation parseKey accepts.
	key?: string | null;
	// 1..10
	energy?: number | null;
	genre?: string | null;
	// Epoch ms of the last play, or null/undefined for never.
	lastPlayedAt?: number | null;
	playCount?: number | null;
}

export interface SuggestOptions {
	// Pitch fader range in percent. Default 8.
	pitchRangePercent?: number;
	// "up" favours the same or higher energy, "down" lower, "flat" (default) similar.
	energyDirection?: "up" | "down" | "flat";
	// Epoch ms "now" for freshness. Default Date.now().
	now?: number;
	// Weights; normalised, so only the ratios matter.
	weights?: Partial<
		Record<"key" | "bpm" | "energy" | "genre" | "freshness", number>
	>;
	// Drop candidates scoring below this. Default 0.
	minScore?: number;
	limit?: number;
}

export interface Suggestion {
	track: MixTrack;
	// 0..1
	score: number;
	parts: {
		key: number;
		bpm: number;
		energy: number;
		genre: number;
		freshness: number;
	};
	keyMatch: KeyMatch | null;
	bpmMatch: BpmMatch | null;
	explanation: string;
}

const DEFAULT_WEIGHTS = {
	key: 0.35,
	bpm: 0.3,
	energy: 0.15,
	genre: 0.1,
	freshness: 0.1,
};
const NEUTRAL = 0.5;

const norm = (s: string | null | undefined): string =>
	(s ?? "").trim().toLowerCase();

function energyScore(
	a: number | null | undefined,
	b: number | null | undefined,
	direction: "up" | "down" | "flat",
): number {
	if (a == null || b == null) return NEUTRAL;
	const delta = b - a;
	const target = direction === "up" ? 1 : direction === "down" ? -1 : 0;
	// A gentle slope toward the target step; two levels either way is the limit.
	return Math.max(0, 1 - Math.abs(delta - target) / 3);
}

function freshnessScore(t: MixTrack, now: number): number {
	if (t.lastPlayedAt == null) return t.playCount ? 0.6 : 1;
	const days = Math.max(0, (now - t.lastPlayedAt) / 86_400_000);
	// Played yesterday ~0.1, six months ago ~0.9.
	return 1 - Math.exp(-days / 60);
}

function genreScore(
	a: string | null | undefined,
	b: string | null | undefined,
): number {
	if (!a || !b) return NEUTRAL;
	const x = norm(a);
	const y = norm(b);
	if (x === y) return 1;
	// Sub-genres share a head word ("Deep House" / "Tech House").
	const xs = new Set(x.split(/[\s/&-]+/));
	return y.split(/[\s/&-]+/).some((w) => xs.has(w) && w.length > 2) ? 0.6 : 0.1;
}

export function scoreTransition(
	from: MixTrack,
	to: MixTrack,
	options: SuggestOptions = {},
): Suggestion {
	const w = { ...DEFAULT_WEIGHTS, ...options.weights };
	const now = options.now ?? Date.now();
	const ka = parseCamelot(from.key);
	const kb = parseCamelot(to.key);
	const keyM = ka && kb ? keyRelation(ka, kb) : null;
	const bpmM =
		from.bpm && to.bpm
			? bpmMatch(from.bpm, to.bpm, options.pitchRangePercent ?? 8)
			: null;
	const parts = {
		key: keyM ? keyM.score : NEUTRAL,
		bpm: bpmM ? bpmM.score : NEUTRAL,
		energy: energyScore(
			from.energy,
			to.energy,
			options.energyDirection ?? "flat",
		),
		genre: genreScore(from.genre, to.genre),
		freshness: freshnessScore(to, now),
	};
	const total = w.key + w.bpm + w.energy + w.genre + w.freshness;
	let score =
		(parts.key * w.key +
			parts.bpm * w.bpm +
			parts.energy * w.energy +
			parts.genre * w.genre +
			parts.freshness * w.freshness) /
		total;
	// A key clash or an out-of-range tempo caps the whole transition.
	if (keyM?.relation === "clash") score = Math.min(score, 0.45);
	if (bpmM && bpmM.score === 0) score = Math.min(score, 0.35);

	const why: string[] = [];
	if (keyM && ka && kb)
		why.push(`${fmt(ka)} to ${fmt(kb)}: ${keyM.relation.replace("-", " ")}`);
	else why.push("key unknown");
	if (bpmM && from.bpm && to.bpm) {
		why.push(
			bpmM.score === 0
				? `${from.bpm} to ${to.bpm} bpm: out of range (${bpmM.pitchPercent.toFixed(1)}%)`
				: `${from.bpm} to ${to.bpm} bpm${bpmM.multiplier !== 1 ? (bpmM.multiplier === 0.5 ? " (half-time)" : " (double-time)") : ""}, ${bpmM.pitchPercent >= 0 ? "+" : ""}${bpmM.pitchPercent.toFixed(1)}% pitch`,
		);
	} else why.push("bpm unknown");
	if (from.energy != null && to.energy != null)
		why.push(`energy ${from.energy} to ${to.energy}`);
	if (to.lastPlayedAt == null) why.push("never played");
	return {
		track: to,
		score,
		parts,
		keyMatch: keyM,
		bpmMatch: bpmM,
		explanation: why.join("; "),
	};
}

const fmt = (c: Camelot): string => `${c.number}${c.letter}`;

// Candidates ranked as the next track after `current`.
export function nextTrackSuggestions(
	current: MixTrack,
	candidates: readonly MixTrack[],
	options: SuggestOptions = {},
): Suggestion[] {
	const out: Suggestion[] = [];
	for (const c of candidates) {
		if (c.id === current.id) continue;
		const s = scoreTransition(current, c, options);
		if (s.score >= (options.minScore ?? 0)) out.push(s);
	}
	out.sort((a, b) => b.score - a.score);
	return options.limit ? out.slice(0, options.limit) : out;
}

export interface SetFlow {
	transitions: Array<Suggestion & { from: MixTrack; index: number }>;
	// Mean transition score, 0..1 (1 for a set of one track).
	average: number;
	// Indices (into transitions) scoring below 0.5.
	weak: number[];
	// For plotting: one point per track.
	curve: Array<{
		id: MixTrack["id"];
		bpm: number | null;
		camelot: string | null;
		energy: number | null;
	}>;
}

export function setFlow(
	tracks: readonly MixTrack[],
	options: SuggestOptions = {},
): SetFlow {
	const transitions: SetFlow["transitions"] = [];
	for (let i = 1; i < tracks.length; i++) {
		const from = tracks[i - 1] as MixTrack;
		const s = scoreTransition(from, tracks[i] as MixTrack, {
			...options,
			// Freshness is about the library, not the order of a set.
			weights: {
				...options.weights,
				freshness: options.weights?.freshness ?? 0,
			},
		});
		transitions.push({ ...s, from, index: i - 1 });
	}
	const average = transitions.length
		? transitions.reduce((n, t) => n + t.score, 0) / transitions.length
		: 1;
	return {
		transitions,
		average,
		weak: transitions.filter((t) => t.score < 0.5).map((t) => t.index),
		curve: tracks.map((t) => {
			const c = parseCamelot(t.key);
			return {
				id: t.id,
				bpm: t.bpm ?? null,
				camelot: c ? fmt(c) : null,
				energy: t.energy ?? null,
			};
		}),
	};
}
