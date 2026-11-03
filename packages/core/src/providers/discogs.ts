import { fold, parseTitle } from "../normalize/index.ts";
import { ratio, tokenSetSimilarity } from "../similarity/index.ts";
import { createHttp, type Http, TokenBucket } from "./http.ts";
import type {
	Candidate,
	CandidateField,
	FieldClaim,
	LookupContext,
	Provider,
	ProviderOptions,
	TrackFacts,
} from "./types.ts";

export interface DiscogsOptions extends ProviderOptions {
	// Personal access token (https://www.discogs.com/settings/developers).
	token: string;
	// e.g. "TrackVault/1.0 (+you@example.com)"; Discogs rejects anonymous agents.
	userAgent: string;
}

interface DiscogsResult {
	id: number;
	title: string; // "Artist - Release title"
	year?: string;
	label?: string[];
	catno?: string;
	genre?: string[];
	style?: string[];
	country?: string;
	cover_image?: string;
	uri?: string;
}

// Discogs searches releases, not recordings: the `track` filter keeps releases
// that list the title, so the match confidence is capped below the others'.
export class Discogs implements Provider {
	readonly name = "discogs" as const;
	private readonly http: Http;
	private readonly limit: number;

	constructor(options: DiscogsOptions) {
		this.limit = options.limit ?? 3;
		this.http = createHttp({
			fetch: options.fetch,
			cache: options.cache,
			// 60 authenticated requests per minute.
			limiter: options.limiter ?? new TokenBucket(1, 5),
			headers: {
				"user-agent": options.userAgent,
				authorization: `Discogs token=${options.token}`,
			},
		});
	}

	async lookup(
		facts: TrackFacts,
		context?: LookupContext,
	): Promise<Candidate[]> {
		if (!facts.title) return [];
		const params = new URLSearchParams({
			type: "release",
			track: parseTitle(facts.title).base,
			per_page: String(this.limit + 3),
		});
		if (facts.artist) params.set("artist", facts.artist);
		const res = await this.http.json<{ results?: DiscogsResult[] }>(
			`https://api.discogs.com/database/search?${params}`,
			{ signal: context?.signal },
		);
		const out: Candidate[] = [];
		for (const r of res.results ?? []) {
			const sep = r.title.indexOf(" - ");
			const artist = sep > 0 ? r.title.slice(0, sep) : "";
			const album = sep > 0 ? r.title.slice(sep + 3) : r.title;
			const artistScore = facts.artist
				? Math.max(
						tokenSetSimilarity(fold(facts.artist), fold(artist)),
						ratio(fold(facts.artist), fold(artist)),
					)
				: 0.5;
			// A single named after the track is the best evidence the release is the one.
			const titleHint =
				ratio(fold(parseTitle(facts.title).base), fold(album)) > 0.8 ? 0.1 : 0;
			const m = Math.min(0.85, artistScore * 0.75 + titleHint);
			const f: Partial<Record<CandidateField, FieldClaim>> = {};
			const claim = (
				field: CandidateField,
				value: FieldClaim["value"] | null | undefined,
				c = m,
			) => {
				if (value === null || value === undefined || value === "") return;
				f[field] = { value, confidence: c };
			};
			claim("album", album);
			claim("albumArtist", artist);
			claim("label", r.label?.[0]?.replace(/ \(\d+\)$/, ""));
			claim("catalogNumber", r.catno && r.catno !== "none" ? r.catno : null);
			claim("year", r.year ? Number(r.year) : null);
			claim("genre", r.genre?.[0], m * 0.8);
			claim("subGenre", r.style?.[0], m * 0.8);
			if (r.style?.length) claim("tags", r.style, m * 0.6);
			if (r.cover_image && !r.cover_image.includes("spacer.gif"))
				claim("coverUrl", r.cover_image);
			out.push({
				provider: this.name,
				id: String(r.id),
				sourceUrl: r.uri
					? `https://www.discogs.com${r.uri}`
					: `https://www.discogs.com/release/${r.id}`,
				matchConfidence: m,
				fields: f,
			});
		}
		return out
			.sort((a, b) => b.matchConfidence - a.matchConfidence)
			.slice(0, this.limit);
	}
}
