import type {
	Candidate,
	LookupContext,
	Provider,
	TrackFacts,
} from "./types.ts";

export { AcoustId, type AcoustIdOptions, chromaprintOf } from "./acoustid.ts";
export {
	Beatport,
	type BeatportLogin,
	type BeatportOptions,
	beatportPasswordLogin,
} from "./beatport.ts";
export { Deezer } from "./deezer.ts";
export { Discogs, type DiscogsOptions } from "./discogs.ts";
export { createHttp, HttpError, TokenBucket } from "./http.ts";
export { matchScore } from "./match.ts";
export {
	type AutotagPolicy,
	autotagPlan,
	type FieldChoice,
	type MergedFields,
	mergeCandidates,
	type PlanChange,
	type PlanField,
} from "./merge.ts";
export { MusicBrainz, type MusicBrainzOptions } from "./musicbrainz.ts";
export type * from "./types.ts";

// Asks every provider in parallel (each has its own rate limit); one failing
// provider is reported, not fatal.
export async function lookupAll(
	providers: readonly Provider[],
	facts: TrackFacts,
	context?: LookupContext,
): Promise<{
	candidates: Candidate[];
	errors: Array<{ provider: Provider["name"]; error: string }>;
}> {
	const settled = await Promise.allSettled(
		providers.map((p) => p.lookup(facts, context)),
	);
	const candidates: Candidate[] = [];
	const errors: Array<{ provider: Provider["name"]; error: string }> = [];
	settled.forEach((r, i) => {
		const name = (providers[i] as Provider).name;
		if (r.status === "fulfilled") candidates.push(...r.value);
		else
			errors.push({
				provider: name,
				error: r.reason instanceof Error ? r.reason.message : String(r.reason),
			});
	});
	return { candidates, errors };
}
