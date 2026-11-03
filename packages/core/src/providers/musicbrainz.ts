import { createHttp, type Http, TokenBucket } from "./http.ts";
import { matchScore, yearOf } from "./match.ts";
import type {
	Candidate,
	CandidateField,
	FieldClaim,
	LookupContext,
	Provider,
	ProviderOptions,
	TrackFacts,
} from "./types.ts";

const BASE = "https://musicbrainz.org/ws/2";

export interface MusicBrainzOptions extends ProviderOptions {
	// Required by MusicBrainz: an identifying contact, e.g.
	// "TrackVault/1.0 (you@example.com)". Anonymous agents get blocked.
	userAgent: string;
	// Search hits that get a full lookup (recording + release). Default 2.
	enrich?: number;
}

interface MbArtistCredit {
	name: string;
	joinphrase?: string;
	artist?: { id: string; name: string };
}
interface MbRelease {
	id: string;
	title: string;
	date?: string;
	status?: string;
	"label-info"?: Array<{
		"catalog-number"?: string | null;
		label?: { name: string } | null;
	}>;
}
interface MbRecording {
	id: string;
	score?: number;
	title: string;
	length?: number | null;
	"artist-credit"?: MbArtistCredit[];
	releases?: MbRelease[];
	isrcs?: Array<string | { id: string }>;
	genres?: Array<{ name: string; count: number }>;
	tags?: Array<{ name: string; count: number }>;
}

const lucene = (s: string): string => `"${s.replace(/(["\\])/g, "\\$1")}"`;
const credit = (r: MbRecording): string =>
	(r["artist-credit"] ?? [])
		.map((c) => c.name + (c.joinphrase ?? ""))
		.join("")
		.trim();

// Earliest dated official release is the "original" one.
function pickRelease(releases: MbRelease[] | undefined): MbRelease | null {
	const list = (releases ?? []).filter((r) => r.date);
	const official = list.filter((r) => r.status === "Official");
	const pool = official.length
		? official
		: list.length
			? list
			: (releases ?? []);
	return (
		[...pool].sort((a, b) =>
			(a.date ?? "9999").localeCompare(b.date ?? "9999"),
		)[0] ?? null
	);
}

export class MusicBrainz implements Provider {
	readonly name = "musicbrainz" as const;
	private readonly http: Http;
	private readonly limit: number;
	private readonly enrich: number;

	constructor(options: MusicBrainzOptions) {
		this.http = createHttp({
			fetch: options.fetch,
			cache: options.cache,
			// MusicBrainz: an average of one request per second.
			limiter: options.limiter ?? new TokenBucket(1, 1),
			headers: { "user-agent": options.userAgent },
		});
		this.limit = options.limit ?? 3;
		this.enrich = options.enrich ?? 2;
	}

	async lookup(
		facts: TrackFacts,
		context?: LookupContext,
	): Promise<Candidate[]> {
		if (facts.mbid) {
			const one = await this.byId(facts.mbid, facts, context);
			return one ? [one] : [];
		}
		if (!facts.title) return [];
		const q = [`recording:${lucene(facts.title)}`];
		if (facts.artist) q.push(`artist:${lucene(facts.artist)}`);
		if (facts.durationSec) {
			const ms = Math.round(facts.durationSec * 1000);
			q.push(`dur:[${ms - 5000} TO ${ms + 5000}]`);
		}
		const url = `${BASE}/recording?query=${encodeURIComponent(q.join(" AND "))}&fmt=json&limit=${this.limit + 2}`;
		const found = await this.http.json<{ recordings?: MbRecording[] }>(url, {
			signal: context?.signal,
		});
		const out: Candidate[] = [];
		const hits = (found.recordings ?? []).slice(0, this.limit);
		for (const [i, hit] of hits.entries()) {
			const detail = i < this.enrich ? await this.detail(hit.id, context) : hit;
			out.push(
				await this.toCandidate(detail ?? hit, facts, i < this.enrich, context),
			);
		}
		return out.sort((a, b) => b.matchConfidence - a.matchConfidence);
	}

	// A known recording id (from AcoustID, or stored earlier).
	async byId(
		mbid: string,
		facts: TrackFacts,
		context?: LookupContext,
	): Promise<Candidate | null> {
		const detail = await this.detail(mbid, context);
		return detail ? this.toCandidate(detail, facts, true, context) : null;
	}

	private detail(
		id: string,
		context?: LookupContext,
	): Promise<MbRecording | null> {
		return this.http
			.json<MbRecording>(
				`${BASE}/recording/${id}?inc=artists+releases+isrcs+genres+tags&fmt=json`,
				{ signal: context?.signal },
			)
			.catch(() => null);
	}

	private async toCandidate(
		r: MbRecording,
		facts: TrackFacts,
		full: boolean,
		context?: LookupContext,
	): Promise<Candidate> {
		const artist = credit(r);
		// MusicBrainz's own 0-100 score and our comparison, whichever is lower.
		const own = matchScore(facts, {
			title: r.title,
			artist,
			durationSec: r.length ? r.length / 1000 : null,
		});
		const m = r.score !== undefined ? Math.min(own, r.score / 100) : own;
		const f: Partial<Record<CandidateField, FieldClaim>> = {};
		const claim = (
			field: CandidateField,
			value: FieldClaim["value"] | null | undefined,
			c = m,
		) => {
			if (value === null || value === undefined || value === "") return;
			f[field] = { value, confidence: c };
		};
		claim("title", r.title);
		claim("artist", artist);
		claim("mbid", r.id, 1);
		const isrc = r.isrcs?.[0];
		claim("isrc", typeof isrc === "string" ? isrc : isrc?.id);
		const genres = (r.genres ?? [])
			.sort((a, b) => b.count - a.count)
			.map((g) => g.name);
		if (genres.length) claim("genre", genres[0], m * 0.7);
		const tags = (r.tags ?? [])
			.sort((a, b) => b.count - a.count)
			.map((t) => t.name);
		if (tags.length) claim("tags", tags.slice(0, 8), m * 0.5);

		const release = pickRelease(r.releases);
		if (release) {
			claim("album", release.title);
			claim("releaseMbid", release.id, 1);
			claim("releaseDate", release.date);
			claim("year", yearOf(release.date));
			if (full) {
				const rel = await this.http
					.json<MbRelease>(
						`${BASE}/release/${release.id}?inc=labels&fmt=json`,
						{
							signal: context?.signal,
						},
					)
					.catch(() => null);
				const info = rel?.["label-info"]?.find((l) => l.label?.name);
				claim("label", info?.label?.name, m * 0.9);
				claim("catalogNumber", info?.["catalog-number"], m * 0.9);
			}
		}
		return {
			provider: this.name,
			id: r.id,
			sourceUrl: `https://musicbrainz.org/recording/${r.id}`,
			matchConfidence: m,
			fields: f,
		};
	}
}
