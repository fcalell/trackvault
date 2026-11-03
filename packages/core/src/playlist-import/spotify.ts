import type { Want } from "../wishlist/types.ts";
import { dedupeWants, makeWant, type ParseResult } from "./common.ts";

// Spotify Web API, client-credentials flow: the user supplies their own app's
// client id and secret (developer.spotify.com/dashboard). That flow has no user
// context, so only public playlists can be read. Spotify has been narrowing
// what new apps may read (editorial/algorithmic playlists are refused with 403/404);
// the client reports that as an error rather than returning a partial list.

export interface SpotifyCredentials {
	clientId: string;
	clientSecret: string;
}

export interface SpotifyOptions extends SpotifyCredentials {
	fetch?: typeof fetch;
	timeoutMs?: number;
	// Safety cap on pages (100 tracks each). Default 50.
	maxPages?: number;
}

interface SpotifyTrack {
	name?: string;
	type?: string;
	is_local?: boolean;
	duration_ms?: number;
	artists?: Array<{ name?: string }>;
	external_ids?: { isrc?: string };
}

interface SpotifyPage {
	items: Array<{ track?: SpotifyTrack | null; item?: SpotifyTrack | null }>;
	next: string | null;
}

export function parseSpotifyPlaylistId(input: string): string | null {
	const s = input.trim();
	const m =
		/playlist\/([A-Za-z0-9]+)/.exec(s) ??
		/^spotify:playlist:([A-Za-z0-9]+)$/.exec(s) ??
		/^([A-Za-z0-9]{22})$/.exec(s);
	return m ? (m[1] as string) : null;
}

export function parseSpotifyItems(
	items: SpotifyPage["items"],
	ref: string,
): ParseResult {
	const wants: Want[] = [];
	let skipped = 0;
	for (const it of items) {
		// `item` is the newer name for `track` in the playlist items payload.
		const t = it.track ?? it.item;
		if (!t || t.type === "episode" || t.is_local || !t.name) {
			skipped++;
			continue;
		}
		const artists = (t.artists ?? [])
			.map((a) => a.name ?? "")
			.filter(Boolean)
			.join(", ");
		const w = makeWant("spotify", ref, artists, t.name, {
			durationSec: t.duration_ms ? t.duration_ms / 1000 : null,
			isrc: t.external_ids?.isrc ?? null,
		});
		if (w) wants.push(w);
		else skipped++;
	}
	return {
		name: null,
		wants: dedupeWants(wants),
		warnings:
			skipped > 0
				? [`${skipped} entries skipped (local files, episodes, removed)`]
				: [],
	};
}

export function createSpotifyClient(options: SpotifyOptions) {
	const doFetch = options.fetch ?? fetch;
	const timeout = () => AbortSignal.timeout(options.timeoutMs ?? 15_000);
	let token: { value: string; expiresAt: number } | null = null;

	async function accessToken(): Promise<string> {
		if (token && token.expiresAt > Date.now() + 30_000) return token.value;
		const basic = Buffer.from(
			`${options.clientId}:${options.clientSecret}`,
		).toString("base64");
		const res = await doFetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: {
				Authorization: `Basic ${basic}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "grant_type=client_credentials",
			signal: timeout(),
		});
		if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`);
		const json = (await res.json()) as {
			access_token: string;
			expires_in: number;
		};
		token = {
			value: json.access_token,
			expiresAt: Date.now() + json.expires_in * 1000,
		};
		return token.value;
	}

	async function get<T>(url: string): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			const res = await doFetch(url, {
				headers: { Authorization: `Bearer ${await accessToken()}` },
				signal: timeout(),
			});
			if (res.status === 429 && attempt < 3) {
				const wait = Number(res.headers.get("retry-after") ?? 1);
				await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
				continue;
			}
			if (!res.ok) throw new Error(`Spotify GET ${url} -> ${res.status}`);
			return (await res.json()) as T;
		}
	}

	return {
		async playlist(urlOrId: string): Promise<ParseResult> {
			const id = parseSpotifyPlaylistId(urlOrId);
			if (!id) throw new Error(`not a Spotify playlist: ${urlOrId}`);
			const ref = `spotify:playlist:${id}`;
			const meta = await get<{ name?: string }>(
				`https://api.spotify.com/v1/playlists/${id}?fields=name`,
			).catch(() => ({ name: undefined }));
			const wants: Want[] = [];
			const warnings: string[] = [];
			let url: string | null =
				`https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`;
			for (let page = 0; url && page < (options.maxPages ?? 50); page++) {
				const data: SpotifyPage = await get<SpotifyPage>(url);
				const r = parseSpotifyItems(data.items, ref);
				wants.push(...r.wants);
				warnings.push(...r.warnings);
				url = data.next;
			}
			if (url) warnings.push("stopped at the page cap: playlist is longer");
			return { name: meta.name ?? null, wants: dedupeWants(wants), warnings };
		},
	};
}
