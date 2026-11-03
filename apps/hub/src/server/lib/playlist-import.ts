import {
	createSpotifyClient,
	fetchText,
	fetchYoutubeVideoWant,
	type ParseResult,
	parse1001Tracklist,
	parseBeatportPage,
	parseM3u,
	parseRekordboxXml,
	parseSpotifyPlaylistId,
	parseTextList,
	parseYoutubePlaylistPage,
} from "@trackvault/core/playlist-import";
import type { SettingsRow } from "./settings.ts";

export interface ImportInput {
	url?: string | undefined;
	text?: string | undefined;
	fileName?: string | undefined;
}

export interface Imported extends ParseResult {
	// Where the tracks came from, the way a want names it.
	source: string;
	ref: string;
}

const AUDIO_LINE = /\.(?:mp3|flac|wav|aiff?|m4a|ogg|opus)\s*$/im;

class ImportError extends Error {}

// Reads a page the way its address says, or the pasted text by what it looks like:
// rekordbox XML, an M3U, a Beatport / 1001tracklists / YouTube page saved as HTML, a
// list of "Artist - Title" lines or a CSV with those columns.
export async function parseInput(
	input: ImportInput,
	settings: Pick<SettingsRow, "spotifyClientId" | "spotifyClientSecret">,
): Promise<Imported> {
	let url = input.url?.trim();
	const text = input.text?.trim();
	// A pasted line that is only an address is an address.
	if (!url && text && !/\s/.test(text) && /^(?:https?:|spotify:)/i.test(text))
		url = text;
	if (url) return fromUrl(url, settings);
	if (!text) throw new ImportError("Paste a link, some text or pick a file.");
	return fromText(text, input.fileName);
}

async function fromUrl(
	url: string,
	settings: Pick<SettingsRow, "spotifyClientId" | "spotifyClientSecret">,
): Promise<Imported> {
	if (parseSpotifyPlaylistId(url) && /spotify/i.test(url)) {
		if (!settings.spotifyClientId || !settings.spotifyClientSecret)
			throw new ImportError(
				"Spotify needs a client id and secret: add them in Settings.",
			);
		const r = await createSpotifyClient({
			clientId: settings.spotifyClientId,
			clientSecret: settings.spotifyClientSecret,
		}).playlist(url);
		return { ...r, source: "spotify", ref: url };
	}
	let host = "";
	try {
		host = new URL(url).hostname.replace(/^www\./, "");
	} catch {
		throw new ImportError("That is not a link.");
	}
	if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host) && !/[?&]list=/.test(url)) {
		const want = await fetchYoutubeVideoWant(url);
		return {
			name: null,
			wants: want ? [want] : [],
			warnings: want ? [] : ["The video's title could not be read."],
			source: "youtube",
			ref: url,
		};
	}
	const html = await fetchText(url).catch((error: Error) => {
		throw new ImportError(
			`${error.message}. Some sites refuse the hub: save the page as HTML and paste or pick it instead.`,
		);
	});
	return { ...pageToImport(html, url, host), ref: url };
}

function pageToImport(html: string, ref: string, host = ""): Imported {
	if (/beatport\.com$/.test(host) || /__NEXT_DATA__/.test(html))
		return { ...parseBeatportPage(html, ref), source: "beatport", ref };
	if (/1001tracklists\.com$/.test(host) || /1001tracklists/i.test(html))
		return { ...parse1001Tracklist(html, ref), source: "1001tracklists", ref };
	if (/youtube\.com$/.test(host) || /ytInitialData/.test(html))
		return { ...parseYoutubePlaylistPage(html, ref), source: "youtube", ref };
	throw new ImportError(
		"This page is not one the hub reads (Beatport, 1001tracklists, YouTube).",
	);
}

function fromText(text: string, fileName?: string): Imported {
	const ref = fileName ?? "pasted text";
	const stem = fileName?.replace(/\.[A-Za-z0-9]+$/, "") ?? null;
	if (/<DJ_PLAYLISTS\b/.test(text)) {
		const lists = parseRekordboxXml(text, ref).filter(
			(p) => p.wants.length > 0,
		);
		const first = lists[0];
		if (!first) throw new ImportError("No playlist with tracks in that file.");
		const biggest = lists.reduce((a, b) =>
			b.wants.length > a.wants.length ? b : a,
		);
		return {
			...biggest,
			name: biggest.name ?? biggest.path,
			warnings: [
				...biggest.warnings,
				...(lists.length > 1
					? [
							`The file holds ${lists.length} playlists: imported the longest, ${biggest.path}`,
						]
					: []),
			],
			source: "rekordbox",
			ref,
		};
	}
	if (/^\s*<!doctype html|<html[\s>]|<script[\s>]/i.test(text))
		return pageToImport(text, ref);
	if (
		/^#EXTM3U/m.test(text) ||
		(AUDIO_LINE.test(text) && /\.m3u8?$/i.test(fileName ?? ""))
	)
		return { ...parseM3u(text, ref), name: stem, source: "m3u", ref };
	const r = parseTextList(text, ref);
	return { ...r, name: r.name ?? stem, source: "text", ref };
}

export { ImportError };
