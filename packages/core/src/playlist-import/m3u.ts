import type { Want } from "../wishlist/types.ts";
import { dedupeWants, makeWant, type ParseResult } from "./common.ts";

const DASH = /\s+[-–—]\s+/;

function fromName(raw: string): [string, string] | null {
	const name = raw
		.replace(/\.[A-Za-z0-9]{2,4}$/, "")
		.replace(/_/g, " ")
		.replace(/^\s*\d{1,3}\s*[.)-]?\s+/, "");
	const parts = name.split(DASH);
	return parts.length >= 2
		? [parts[0] as string, parts.slice(1).join(" - ")]
		: null;
}

// #EXTINF:<seconds>,<Artist - Title> lines, falling back to the file name of the
// entry. Entries that give no artist cannot be wanted and are reported.
export function parseM3u(text: string, ref = "m3u"): ParseResult {
	const wants: Want[] = [];
	const warnings: string[] = [];
	let pending: { seconds: number | null; label: string } | null = null;
	for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
		const line = raw.trim();
		if (line === "" || line === "#EXTM3U") continue;
		if (line.startsWith("#EXTINF:")) {
			const m = /^#EXTINF:(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line);
			pending = m
				? {
						seconds: Number(m[1]) > 0 ? Number(m[1]) : null,
						label: (m[2] as string).trim(),
					}
				: null;
			continue;
		}
		if (line.startsWith("#")) continue;
		const base = line.split(/[\\/]/).pop() ?? line;
		const pair = (pending && fromName(pending.label)) ?? fromName(base);
		const want = pair
			? makeWant("m3u", ref, pair[0], pair[1], {
					durationSec: pending?.seconds ?? null,
				})
			: null;
		if (want) wants.push(want);
		else warnings.push(`no artist/title for ${base}`);
		pending = null;
	}
	return { name: null, wants: dedupeWants(wants), warnings };
}
