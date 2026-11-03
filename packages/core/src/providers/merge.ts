import { fold } from "../normalize/index.ts";
import type { TrackTags } from "../tags/types.ts";
import type {
	Candidate,
	CandidateField,
	FieldValue,
	ProviderName,
} from "./types.ts";

export interface FieldChoice {
	value: FieldValue;
	// Noisy-or of every claim that agrees (two sources at 0.7 give 0.91).
	confidence: number;
	// The claim that supplied the value as written.
	source: ProviderName;
	sourceUrl: string;
	// Every provider that agrees, strongest first.
	agreeing: ProviderName[];
	// Other values seen, for the review UI.
	alternatives: Array<{
		value: FieldValue;
		source: ProviderName;
		sourceUrl: string;
		confidence: number;
	}>;
}

export type MergedFields = Partial<Record<CandidateField, FieldChoice>>;

// How much each provider is believed for a field, on top of its own confidence.
// Beatport knows dance-music genre/key/BPM best; MusicBrainz/Discogs the
// release facts; Deezer the cover and ISRC but only rough tempos.
const TRUST: Partial<
	Record<CandidateField, Partial<Record<ProviderName, number>>>
> = {
	genre: {
		beatport: 1,
		discogs: 0.85,
		deezer: 0.7,
		musicbrainz: 0.7,
		acoustid: 0.7,
	},
	subGenre: { beatport: 1, discogs: 0.9 },
	bpm: { beatport: 1, deezer: 0.6 },
	key: { beatport: 1 },
	label: {
		beatport: 1,
		discogs: 1,
		musicbrainz: 0.95,
		acoustid: 0.95,
		deezer: 0.8,
	},
	year: {
		musicbrainz: 1,
		acoustid: 1,
		discogs: 0.9,
		beatport: 0.9,
		deezer: 0.85,
	},
	releaseDate: { beatport: 1, musicbrainz: 1, acoustid: 1, deezer: 0.9 },
	isrc: { musicbrainz: 1, acoustid: 1, deezer: 0.95, beatport: 0.95 },
	coverUrl: { deezer: 1, beatport: 0.9, discogs: 0.8 },
};

const keyOf = (field: CandidateField, v: FieldValue): string => {
	if (Array.isArray(v)) return v.map(fold).join("|");
	if (typeof v === "number")
		return field === "bpm" ? String(Math.round(v)) : String(v);
	return field === "coverUrl" || field === "mbid" || field === "isrc"
		? v.toUpperCase()
		: fold(v);
};

export function mergeCandidates(
	candidates: readonly Candidate[],
): MergedFields {
	const byField = new Map<
		CandidateField,
		Array<{ c: Candidate; value: FieldValue; conf: number }>
	>();
	for (const c of candidates) {
		for (const [field, claim] of Object.entries(c.fields) as Array<
			[CandidateField, { value: FieldValue; confidence: number }]
		>) {
			const trust = TRUST[field]?.[c.provider] ?? 0.9;
			const list = byField.get(field) ?? [];
			list.push({
				c,
				value: claim.value,
				conf: Math.min(0.99, claim.confidence * trust),
			});
			byField.set(field, list);
		}
	}
	const out: MergedFields = {};
	for (const [field, claims] of byField) {
		const groups = new Map<string, typeof claims>();
		for (const claim of claims) {
			const k = keyOf(field, claim.value);
			groups.set(k, [...(groups.get(k) ?? []), claim]);
		}
		const scored = [...groups.values()].map((g) => {
			g.sort((a, b) => b.conf - a.conf);
			const providers = new Set(g.map((x) => x.c.provider));
			// One provider repeating itself (several records) is not independent evidence.
			const best = new Map<ProviderName, number>();
			for (const x of g)
				best.set(x.c.provider, Math.max(best.get(x.c.provider) ?? 0, x.conf));
			let miss = 1;
			for (const v of best.values()) miss *= 1 - v;
			return { g, providers, confidence: Math.min(0.99, 1 - miss) };
		});
		scored.sort((a, b) => b.confidence - a.confidence);
		const win = scored[0];
		if (!win) continue;
		const top = win.g[0];
		if (!top) continue;
		out[field] = {
			value: top.value,
			confidence: win.confidence,
			source: top.c.provider,
			sourceUrl: top.c.sourceUrl,
			agreeing: [...win.providers],
			alternatives: scored.slice(1).flatMap((s) => {
				const x = s.g[0];
				return x
					? [
							{
								value: x.value,
								source: x.c.provider,
								sourceUrl: x.c.sourceUrl,
								confidence: s.confidence,
							},
						]
					: [];
			}),
		};
	}
	return out;
}

// ---- plan ------------------------------------------------------------------

export type PlanField = Extract<
	keyof TrackTags,
	| "title"
	| "artist"
	| "albumArtist"
	| "album"
	| "genre"
	| "year"
	| "label"
	| "isrc"
	| "bpm"
	| "key"
	| "remixer"
>;

const PLAN_FIELDS: ReadonlyArray<PlanField> = [
	"title",
	"artist",
	"albumArtist",
	"album",
	"genre",
	"year",
	"label",
	"isrc",
	"bpm",
	"key",
	"remixer",
];

export interface PlanChange {
	field: PlanField;
	before: string | number | null;
	after: string | number;
	source: ProviderName;
	sourceUrl: string;
	confidence: number;
}

export interface AutotagPolicy {
	// "fill-empty": only fields the file leaves empty. "overwrite": replace
	// differing values too, when confident enough.
	mode: "fill-empty" | "overwrite";
	// Minimum merged confidence. Default 0.6 (fill-empty) / 0.85 (overwrite).
	threshold?: number;
	// Restrict to these fields. Default: all.
	fields?: readonly PlanField[];
	// Never touched in overwrite mode (fill-empty still fills them when empty).
	protect?: readonly PlanField[];
}

const isEmpty = (v: unknown): boolean =>
	v === null || v === undefined || v === "" || v === 0;

const asScalar = (v: FieldValue): string | number =>
	Array.isArray(v) ? v.join(", ") : v;

const same = (a: string | number, b: string | number): boolean =>
	typeof a === "number" && typeof b === "number"
		? Math.abs(a - b) < 0.5
		: fold(String(a)) === fold(String(b));

// Field changes worth showing in a before/after review. Nothing is written here.
export function autotagPlan(
	track: Partial<Record<PlanField, string | number | null>>,
	candidates: readonly Candidate[],
	policy: AutotagPolicy,
	merged: MergedFields = mergeCandidates(candidates),
): PlanChange[] {
	const threshold =
		policy.threshold ?? (policy.mode === "overwrite" ? 0.85 : 0.6);
	const out: PlanChange[] = [];
	for (const field of policy.fields ?? PLAN_FIELDS) {
		const choice = merged[field];
		if (!choice || choice.confidence < threshold) continue;
		const before = track[field] ?? null;
		const after = asScalar(choice.value);
		if (field === "bpm" || field === "year") {
			if (typeof after !== "number") continue;
		}
		if (isEmpty(before)) {
			out.push({
				field,
				before: null,
				after,
				source: choice.source,
				sourceUrl: choice.sourceUrl,
				confidence: choice.confidence,
			});
			continue;
		}
		if (policy.mode !== "overwrite" || policy.protect?.includes(field))
			continue;
		if (same(before as string | number, after)) continue;
		out.push({
			field,
			before: before as string | number,
			after,
			source: choice.source,
			sourceUrl: choice.sourceUrl,
			confidence: choice.confidence,
		});
	}
	return out;
}
