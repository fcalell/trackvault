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

interface DzTrack {
	id: number;
	title: string;
	title_short?: string;
	duration?: number;
	link?: string;
	isrc?: string;
	bpm?: number;
	release_date?: string;
	artist?: { name: string };
	album?: { id: number; title: string; cover_xl?: string; cover_big?: string };
}
interface DzAlbum {
	label?: string;
	release_date?: string;
	genres?: { data?: Array<{ name: string }> };
}

// Public API, no key. Search results lack ISRC/BPM: the top hits are fetched
// individually (`/track/{id}`), the best one's album too (label, genre).
export class Deezer implements Provider {
	readonly name = "deezer" as const;
	private readonly http: Http;
	private readonly limit: number;

	constructor(options: ProviderOptions = {}) {
		this.limit = options.limit ?? 3;
		// 50 requests / 5 s per IP.
		this.http = createHttp({
			fetch: options.fetch,
			cache: options.cache,
			limiter: options.limiter ?? new TokenBucket(5, 10),
		});
	}

	async lookup(
		facts: TrackFacts,
		context?: LookupContext,
	): Promise<Candidate[]> {
		const signal = context?.signal;
		let hits: DzTrack[];
		if (facts.isrc) {
			const t = await this.http
				.json<DzTrack & { error?: unknown }>(
					`https://api.deezer.com/track/isrc:${encodeURIComponent(facts.isrc)}`,
					{ signal },
				)
				.catch(() => null);
			hits = t && !t.error && t.id ? [t] : [];
		} else hits = [];
		if (hits.length === 0) {
			if (!facts.title) return [];
			const q = [
				facts.artist ? `artist:"${facts.artist.replace(/"/g, "")}"` : "",
				`track:"${facts.title.replace(/"/g, "")}"`,
			]
				.filter(Boolean)
				.join(" ");
			const res = await this.http.json<{ data?: DzTrack[] }>(
				`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${this.limit + 2}`,
				{ signal },
			);
			hits = (res.data ?? []).slice(0, this.limit);
		}
		const out: Candidate[] = [];
		for (const [i, hit] of hits.entries()) {
			const t = await this.http
				.json<DzTrack>(`https://api.deezer.com/track/${hit.id}`, { signal })
				.catch(() => hit);
			const m = matchScore(facts, {
				title: t.title,
				artist: t.artist?.name,
				durationSec: t.duration,
			});
			const f: Partial<Record<CandidateField, FieldClaim>> = {};
			const claim = (
				field: CandidateField,
				value: FieldClaim["value"] | null | undefined,
				c = m,
			) => {
				if (value === null || value === undefined || value === "") return;
				f[field] = { value, confidence: c };
			};
			claim("title", t.title);
			claim("artist", t.artist?.name);
			claim("album", t.album?.title);
			claim("isrc", t.isrc);
			claim("releaseDate", t.release_date);
			claim("year", yearOf(t.release_date));
			// Deezer reports 0 when it has no tempo; its values are rough, so trust is low.
			if (t.bpm && t.bpm > 0) claim("bpm", t.bpm, m * 0.6);
			claim("coverUrl", t.album?.cover_xl ?? t.album?.cover_big);
			if (i === 0 && t.album?.id) {
				const album = await this.http
					.json<DzAlbum>(`https://api.deezer.com/album/${t.album.id}`, {
						signal,
					})
					.catch(() => null);
				claim("label", album?.label, m * 0.8);
				claim("genre", album?.genres?.data?.[0]?.name, m * 0.6);
			}
			out.push({
				provider: this.name,
				id: String(t.id),
				sourceUrl: t.link ?? `https://www.deezer.com/track/${t.id}`,
				matchConfidence: m,
				fields: f,
			});
		}
		return out.sort((a, b) => b.matchConfidence - a.matchConfidence);
	}
}
