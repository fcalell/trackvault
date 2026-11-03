import { binaryAvailable } from "@trackvault/core/exec";
import { camelotString, parseCamelot } from "@trackvault/core/harmonic";
import {
	AcoustId,
	type AutotagPolicy,
	autotagPlan,
	Beatport,
	type Candidate,
	chromaprintOf,
	Deezer,
	Discogs,
	lookupAll,
	type MergedFields,
	MusicBrainz,
	mergeCandidates,
	type PlanField,
	type Provider,
	type ProviderCache,
	type ProviderName,
	type TrackFacts,
} from "@trackvault/core/providers";
import { resolveName } from "@trackvault/core/taxonomy";
import { statement } from "./raw.ts";
import type { SettingsRow } from "./settings.ts";
import type { Taxonomies } from "./taxonomy.ts";

const DAY = 86_400_000;

// Provider responses live in `provider_cache` until their time is up: a re-run of
// the same track (or the art job after the auto-tag) asks nobody twice.
export function providerCache(days: number): ProviderCache | undefined {
	if (days <= 0) return undefined;
	return {
		get(key) {
			const row = statement(
				"SELECT value FROM provider_cache WHERE key = @key AND expires_at > @now",
			).get({ key, now: Date.now() }) as { value: string } | undefined;
			return row ? JSON.parse(row.value) : undefined;
		},
		set(key, value, ttlMs) {
			statement(
				"INSERT OR REPLACE INTO provider_cache (key, value, expires_at) VALUES (@key, @value, @at)",
			).run({
				key,
				value: JSON.stringify(value),
				at: Date.now() + Math.min(ttlMs, days * DAY),
			});
		},
	};
}

export function purgeProviderCache(): void {
	statement("DELETE FROM provider_cache WHERE expires_at <= @now").run({
		now: Date.now(),
	});
}

export const PROVIDER_LABELS: Record<ProviderName, string> = {
	musicbrainz: "MusicBrainz",
	acoustid: "AcoustID",
	discogs: "Discogs",
	beatport: "Beatport",
	deezer: "Deezer",
};

export interface ProviderSet {
	providers: Provider[];
	// Switched on but missing what it needs (a user agent, a key, a token).
	unconfigured: ProviderName[];
	// The agent the cover fetch and the providers identify themselves by.
	userAgent: string;
	acoustid: boolean;
}

const nonEmpty = (v: string | null): string | null =>
	v?.trim() ? v.trim() : null;

// The providers the settings switch on and have what they need. The limiters live in
// the instances, so a job builds the set once and every track shares them.
export function buildProviders(
	settings: SettingsRow,
	options: { fetch?: typeof fetch } = {},
): ProviderSet {
	const cache = providerCache(settings.autotagCacheDays);
	const common = { fetch: options.fetch, cache };
	const agent = nonEmpty(settings.autotagMusicbrainzAgent);
	const userAgent = agent ?? "TrackVault/1.0";
	const providers: Provider[] = [];
	const unconfigured: ProviderName[] = [];
	let musicBrainz: MusicBrainz | undefined;
	if (settings.autotagMusicbrainz) {
		if (agent) {
			musicBrainz = new MusicBrainz({ ...common, userAgent: agent });
			providers.push(musicBrainz);
		} else unconfigured.push("musicbrainz");
	}
	const acoustKey = nonEmpty(settings.autotagAcoustidKey);
	let acoustid = false;
	if (settings.autotagAcoustid) {
		if (acoustKey) {
			providers.push(
				new AcoustId({ ...common, clientKey: acoustKey, musicBrainz }),
			);
			acoustid = true;
		} else unconfigured.push("acoustid");
	}
	const discogs = nonEmpty(settings.autotagDiscogsToken);
	if (settings.autotagDiscogs) {
		if (discogs)
			providers.push(new Discogs({ ...common, token: discogs, userAgent }));
		else unconfigured.push("discogs");
	}
	const beatport = nonEmpty(settings.autotagBeatportToken);
	if (settings.autotagBeatport) {
		if (beatport)
			providers.push(
				new Beatport({ ...common, accessToken: async () => beatport }),
			);
		else unconfigured.push("beatport");
	}
	if (settings.autotagDeezer) providers.push(new Deezer(common));
	return { providers, unconfigured, userAgent, acoustid };
}

export interface FactsSource {
	title: string | null;
	artist: string | null;
	album?: string | null;
	durationMs?: number | null;
	isrc?: string | null;
	label?: string | null;
	year?: number | null;
	bpm?: number | null;
}

// What is asked of the providers about a track; with AcoustID on and fpcalc there,
// the file's Chromaprint goes along (and may identify a track with no tags at all).
export async function factsOf(
	source: FactsSource,
	set: ProviderSet,
	file?: string,
): Promise<TrackFacts> {
	const facts: TrackFacts = {
		title: source.title,
		artist: source.artist,
		album: source.album ?? null,
		durationSec: source.durationMs ? source.durationMs / 1000 : null,
		isrc: source.isrc ?? null,
		label: source.label ?? null,
		year: source.year ?? null,
		bpm: source.bpm ?? null,
	};
	if (set.acoustid && file && (await binaryAvailable("fpcalc", "-version"))) {
		const print = await chromaprintOf(file).catch(() => null);
		if (print) {
			facts.fingerprint = print.fingerprint;
			facts.durationSec ??= print.durationSec;
		}
	}
	return facts;
}

// A key as Camelot ("8A"), whatever notation the provider uses; null when it is none.
export function camelotOf(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const c = parseCamelot(value);
	return c ? camelotString(c) : null;
}

// Candidates in the library's own words before they are merged: keys as Camelot, genres
// as the taxonomy names them. A genre the taxonomy does not know is left out (and
// counted), so a provider's spelling never grows the library's list unasked.
export function normaliseCandidates(
	candidates: readonly Candidate[],
	taxonomies: Taxonomies,
): { candidates: Candidate[]; unknownGenres: string[] } {
	const unknown = new Set<string>();
	const out = candidates.map((candidate) => {
		const fields = { ...candidate.fields };
		const key = fields.key;
		if (key) {
			const camelot = camelotOf(key.value);
			if (camelot) fields.key = { ...key, value: camelot };
			else delete fields.key;
		}
		const genre = fields.genre;
		if (genre) {
			const value = Array.isArray(genre.value) ? genre.value[0] : genre.value;
			const resolved =
				typeof value === "string"
					? resolveName(value, taxonomies.genre)
					: undefined;
			if (resolved?.name)
				fields.genre = {
					...genre,
					value: resolved.name,
					confidence: genre.confidence * (resolved.confidence || 1),
				};
			else {
				delete fields.genre;
				if (typeof value === "string") unknown.add(value);
			}
		}
		return { ...candidate, fields };
	});
	return { candidates: out, unknownGenres: [...unknown] };
}

export function policyOf(settings: SettingsRow): AutotagPolicy {
	return {
		mode: settings.autotagPolicy,
		threshold: settings.autotagMinConfidence / 100,
		// A wrong match must not rename the track it was searched by.
		protect: settings.autotagPolicy === "overwrite" ? ["title", "artist"] : [],
	};
}

export interface ProposalDraft {
	field: PlanField;
	before: string | null;
	after: string;
	source: ProviderName;
	sourceUrl: string;
	confidence: number;
	alternatives: Array<{
		value: string;
		source: ProviderName;
		confidence: number;
	}>;
}

export interface TrackPlan {
	changes: ProposalDraft[];
	unknownGenres: string[];
	errors: Array<{ provider: ProviderName; error: string }>;
	candidates: Candidate[];
	merged: MergedFields;
}

// Asks the providers, merges what they say and plans the changes the policy allows.
// Nothing is written here.
export async function planTrack(
	set: ProviderSet,
	facts: TrackFacts,
	current: Partial<Record<PlanField, string | number | null>>,
	policy: AutotagPolicy,
	taxonomies: Taxonomies,
	signal?: AbortSignal,
): Promise<TrackPlan> {
	const found = await lookupAll(set.providers, facts, { signal });
	const normal = normaliseCandidates(found.candidates, taxonomies);
	const merged = mergeCandidates(normal.candidates);
	const changes = autotagPlan(current, normal.candidates, policy, merged).map(
		(change) => ({
			field: change.field,
			before: change.before === null ? null : String(change.before),
			after: String(change.after),
			source: change.source,
			sourceUrl: change.sourceUrl,
			confidence: change.confidence,
			alternatives: (merged[change.field]?.alternatives ?? [])
				.slice(0, 3)
				.map((each) => ({
					value: Array.isArray(each.value)
						? each.value.join(", ")
						: String(each.value),
					source: each.source,
					confidence: each.confidence,
				})),
		}),
	);
	return {
		changes,
		unknownGenres: normal.unknownGenres,
		errors: found.errors,
		candidates: normal.candidates,
		merged,
	};
}
