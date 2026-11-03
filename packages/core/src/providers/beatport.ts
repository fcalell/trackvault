import { camelotString, parseCamelot } from "../harmonic/camelot.ts";
import { parseTitle } from "../normalize/index.ts";
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

// Beatport has no open API key: API v4 (https://api.beatport.com/v4/docs/) is
// OAuth2 and needs a registered `client_id` (granted to partners, or the one
// the public docs page itself uses). End users authenticate as themselves
// with their Beatport login. This provider therefore takes a token supplier:
// give it `beatportPasswordLogin(...)` or any function returning a valid
// bearer token. Use it for a personal library only and respect Beatport's
// terms; the provider is optional and the other four work without it.
export interface BeatportOptions extends ProviderOptions {
	accessToken: () => Promise<string>;
}

interface BpTrack {
	id: number;
	name: string;
	mix_name?: string;
	slug?: string;
	artists?: Array<{ name: string }>;
	remixers?: Array<{ name: string }>;
	genre?: { name: string } | null;
	sub_genre?: { name: string } | null;
	bpm?: number | null;
	key?: {
		name?: string;
		camelot_number?: number;
		camelot_letter?: string;
	} | null;
	isrc?: string | null;
	length_ms?: number | null;
	publish_date?: string | null;
	new_release_date?: string | null;
	catalog_number?: string | null;
	release?: {
		id: number;
		name: string;
		label?: { name: string } | null;
		image?: { uri?: string } | null;
	} | null;
	image?: { uri?: string; dynamic_uri?: string } | null;
}

const BASE = "https://api.beatport.com/v4";

export class Beatport implements Provider {
	readonly name = "beatport" as const;
	private readonly http: Http;
	private readonly limit: number;
	private readonly token: () => Promise<string>;

	constructor(options: BeatportOptions) {
		this.token = options.accessToken;
		this.limit = options.limit ?? 3;
		this.http = createHttp({
			fetch: options.fetch,
			cache: options.cache,
			limiter: options.limiter ?? new TokenBucket(2, 4),
		});
	}

	async lookup(
		facts: TrackFacts,
		context?: LookupContext,
	): Promise<Candidate[]> {
		if (!facts.title) return [];
		const base = parseTitle(facts.title).base;
		const q = [facts.artist, base].filter(Boolean).join(" ");
		const res = await this.http.json<{
			tracks?: BpTrack[];
			results?: BpTrack[];
		}>(
			`${BASE}/catalog/search/?${new URLSearchParams({ q, type: "tracks", per_page: String(this.limit + 3) })}`,
			{
				headers: { authorization: `Bearer ${await this.token()}` },
				signal: context?.signal,
			},
		);
		const out: Candidate[] = [];
		for (const t of (res.results ?? res.tracks ?? []).slice(
			0,
			this.limit + 3,
		)) {
			const artist = (t.artists ?? []).map((a) => a.name).join(", ");
			const title =
				t.mix_name && !/^original mix$/i.test(t.mix_name)
					? `${t.name} (${t.mix_name})`
					: t.name;
			const m = matchScore(facts, {
				title,
				artist,
				durationSec: t.length_ms ? t.length_ms / 1000 : null,
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
			claim("title", title);
			claim("mixName", t.mix_name);
			claim("artist", artist);
			const remixers = (t.remixers ?? []).map((r) => r.name).join(", ");
			claim("remixer", remixers);
			claim("genre", t.genre?.name);
			claim("subGenre", t.sub_genre?.name);
			claim("label", t.release?.label?.name);
			claim("album", t.release?.name);
			claim("bpm", t.bpm);
			const camelot =
				t.key?.camelot_number && t.key.camelot_letter
					? `${t.key.camelot_number}${t.key.camelot_letter}`
					: (() => {
							const k = parseCamelot(t.key?.name);
							return k ? camelotString(k) : null;
						})();
			claim("key", camelot);
			claim("isrc", t.isrc);
			claim("catalogNumber", t.catalog_number);
			const date = t.new_release_date ?? t.publish_date;
			claim("releaseDate", date);
			claim("year", yearOf(date));
			claim("coverUrl", t.release?.image?.uri ?? t.image?.uri);
			out.push({
				provider: this.name,
				id: String(t.id),
				sourceUrl: `https://www.beatport.com/track/${t.slug ?? "track"}/${t.id}`,
				matchConfidence: m,
				fields: f,
			});
		}
		return out
			.sort((a, b) => b.matchConfidence - a.matchConfidence)
			.slice(0, this.limit);
	}
}

export interface BeatportLogin {
	username: string;
	password: string;
	clientId: string;
	// The redirect URI registered for the client_id.
	redirectUri: string;
	fetch?: typeof fetch;
}

// Authorization-code flow as the docs page runs it: log in (session cookie),
// ask /auth/o/authorize/ (302 whose Location carries `code`), exchange it at
// /auth/o/token/. Returns a supplier that caches the token until it expires.
// Unverified against the live service (not reachable from the build sandbox).
export function beatportPasswordLogin(
	login: BeatportLogin,
): () => Promise<string> {
	const doFetch = login.fetch ?? fetch;
	let cached: { token: string; expires: number } | null = null;
	return async () => {
		if (cached && cached.expires > Date.now() + 60_000) return cached.token;
		const l = await doFetch(`${BASE}/auth/login/`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				username: login.username,
				password: login.password,
			}),
		});
		if (!l.ok) throw new Error(`Beatport login failed (${l.status})`);
		const cookie = l.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");
		const a = await doFetch(
			`${BASE}/auth/o/authorize/?${new URLSearchParams({ client_id: login.clientId, response_type: "code", redirect_uri: login.redirectUri })}`,
			{ headers: { cookie }, redirect: "manual" },
		);
		const code = new URL(
			a.headers.get("location") ?? "",
			login.redirectUri,
		).searchParams.get("code");
		if (!code) throw new Error("Beatport authorize returned no code");
		const t = await doFetch(`${BASE}/auth/o/token/`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded", cookie },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				client_id: login.clientId,
				redirect_uri: login.redirectUri,
			}),
		});
		if (!t.ok) throw new Error(`Beatport token exchange failed (${t.status})`);
		const j = (await t.json()) as { access_token: string; expires_in?: number };
		cached = {
			token: j.access_token,
			expires: Date.now() + (j.expires_in ?? 3600) * 1000,
		};
		return cached.token;
	};
}
