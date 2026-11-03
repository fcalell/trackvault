import { run } from "../exec/index.ts";
import { createHttp, type Http, TokenBucket } from "./http.ts";
import type { MusicBrainz } from "./musicbrainz.ts";
import type {
	Candidate,
	LookupContext,
	Provider,
	ProviderOptions,
	TrackFacts,
} from "./types.ts";

export interface AcoustIdOptions extends ProviderOptions {
	// An application API key (free: https://acoustid.org/new-application).
	clientKey: string;
	// When set, each recording id is expanded through MusicBrainz for the full
	// field set (label, ISRC, genres...). Otherwise only title, artist and mbid.
	musicBrainz?: MusicBrainz;
	// Results below this fingerprint score are dropped. Default 0.6.
	minScore?: number;
}

interface AcoustIdResponse {
	status: string;
	error?: { message: string };
	results?: Array<{
		id: string;
		score: number;
		recordings?: Array<{
			id: string;
			title?: string;
			duration?: number;
			artists?: Array<{ name: string; joinphrase?: string }>;
		}>;
	}>;
}

// `fpcalc -json` (compressed form, not -raw): what the AcoustID API takes.
export async function chromaprintOf(
	path: string,
	options: { fpcalcPath?: string; lengthSec?: number } = {},
): Promise<{ fingerprint: string; durationSec: number } | null> {
	const r = await run(
		options.fpcalcPath ?? "fpcalc",
		["-json", "-length", String(options.lengthSec ?? 120), path],
		{ timeoutMs: 60_000, maxStdoutBytes: 1024 * 1024 },
	);
	if (r.missing || r.timedOut || r.code !== 0) return null;
	try {
		const j = JSON.parse(r.stdout.toString("utf8")) as {
			fingerprint?: string;
			duration?: number;
		};
		return j.fingerprint && j.duration
			? { fingerprint: j.fingerprint, durationSec: Math.round(j.duration) }
			: null;
	} catch {
		return null;
	}
}

export class AcoustId implements Provider {
	readonly name = "acoustid" as const;
	private readonly http: Http;
	private readonly key: string;
	private readonly mb?: MusicBrainz;
	private readonly minScore: number;
	private readonly limit: number;

	constructor(options: AcoustIdOptions) {
		this.key = options.clientKey;
		this.mb = options.musicBrainz;
		this.minScore = options.minScore ?? 0.6;
		this.limit = options.limit ?? 3;
		// AcoustID allows 3 requests per second.
		this.http = createHttp({
			fetch: options.fetch,
			cache: options.cache,
			limiter: options.limiter ?? new TokenBucket(3, 3),
		});
	}

	async lookup(
		facts: TrackFacts,
		context?: LookupContext,
	): Promise<Candidate[]> {
		if (!facts.fingerprint || !facts.durationSec) return [];
		// POST: a fingerprint is far longer than a safe URL.
		const body = new URLSearchParams({
			client: this.key,
			format: "json",
			meta: "recordings+releasegroups",
			duration: String(Math.round(facts.durationSec)),
			fingerprint: facts.fingerprint,
		}).toString();
		const res = await this.http.json<AcoustIdResponse>(
			"https://api.acoustid.org/v2/lookup",
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body,
				signal: context?.signal,
			},
		);
		if (res.status !== "ok")
			throw new Error(`AcoustID: ${res.error?.message ?? res.status}`);
		const out: Candidate[] = [];
		const seen = new Set<string>();
		for (const hit of (res.results ?? []).filter(
			(r) => r.score >= this.minScore,
		)) {
			for (const rec of hit.recordings ?? []) {
				if (seen.has(rec.id) || out.length >= this.limit) continue;
				seen.add(rec.id);
				if (this.mb) {
					const full = await this.mb.byId(rec.id, facts, context);
					if (full) {
						// A fingerprint match is stronger evidence than text similarity.
						out.push({
							...full,
							provider: "acoustid",
							matchConfidence: Math.max(full.matchConfidence, hit.score * 0.95),
						});
						continue;
					}
				}
				const artist = (rec.artists ?? [])
					.map((a) => a.name + (a.joinphrase ?? ""))
					.join("")
					.trim();
				const c = hit.score * 0.95;
				out.push({
					provider: this.name,
					id: rec.id,
					sourceUrl: `https://musicbrainz.org/recording/${rec.id}`,
					matchConfidence: c,
					fields: {
						mbid: { value: rec.id, confidence: 1 },
						...(rec.title
							? { title: { value: rec.title, confidence: c } }
							: {}),
						...(artist ? { artist: { value: artist, confidence: c } } : {}),
					},
				});
			}
		}
		return out;
	}
}
