import type { Want } from "../wishlist/types.ts";
import {
	decodeEntities,
	dedupeWants,
	makeWant,
	type ParseResult,
} from "./common.ts";

export interface RekordboxPlaylist extends ParseResult {
	// Folder path joined with "/".
	path: string;
}

function attrs(tag: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of tag.matchAll(/([A-Za-z_]+)="([^"]*)"/g))
		out[m[1] as string] = decodeEntities(m[2] as string);
	return out;
}

// Rekordbox "Export Collection in xml format": a COLLECTION of TRACKs and a
// PLAYLISTS tree whose leaves list TRACK Key="<TrackID>". Parsed by scanning
// tags, not a full XML parser: the format is flat and machine-written.
export function parseRekordboxXml(
	xml: string,
	ref = "rekordbox",
): RekordboxPlaylist[] {
	const tracks = new Map<string, Want>();
	const collection = /<COLLECTION\b[\s\S]*?<\/COLLECTION>/.exec(xml)?.[0] ?? "";
	for (const m of collection.matchAll(/<TRACK\b([^>]*?)\/?>/g)) {
		const a = attrs(m[1] as string);
		if (!a.TrackID || !a.Artist || !a.Name) continue;
		const want = makeWant("rekordbox", ref, a.Artist, a.Name, {
			mix: a.Mix ?? null,
			durationSec: a.TotalTime ? Number(a.TotalTime) : null,
			label: a.Label ?? null,
		});
		if (want) tracks.set(a.TrackID, want);
	}
	const result: RekordboxPlaylist[] = [];
	const playlists = /<PLAYLISTS\b[\s\S]*?<\/PLAYLISTS>/.exec(xml)?.[0] ?? "";
	const stack: string[] = [];
	let current: { name: string; keys: string[] } | null = null;
	const flush = () => {
		if (!current) return;
		const wants: Want[] = [];
		const warnings: string[] = [];
		for (const k of current.keys) {
			const w = tracks.get(k);
			if (w) wants.push({ ...w, sourceRef: `${ref}:${stack.join("/")}` });
			else warnings.push(`track ${k} has no artist/title`);
		}
		result.push({
			path: stack.join("/"),
			name: current.name,
			wants: dedupeWants(wants),
			warnings,
		});
		current = null;
	};
	for (const m of playlists.matchAll(
		/<NODE\b([^>]*?)(\/?)>|<\/NODE>|<TRACK\b([^>]*?)\/?>/g,
	)) {
		if (m[0] === "</NODE>") {
			flush();
			stack.pop();
		} else if (m[0].startsWith("<NODE")) {
			const a = attrs(m[1] as string);
			stack.push(a.Name ?? "");
			if (a.Type === "1") current = { name: a.Name ?? "", keys: [] };
			if (m[2] === "/") {
				flush();
				stack.pop();
			}
		} else if (current) {
			const key = attrs(m[3] as string).Key;
			if (key) current.keys.push(key);
		}
	}
	return result;
}
