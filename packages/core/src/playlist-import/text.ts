import { fold } from "../normalize/index.ts";
import type { Want, WantSource } from "../wishlist/types.ts";
import { dedupeWants, makeWant, type ParseResult } from "./common.ts";

const LEADING_INDEX =
	/^\s*(?:\d{1,3}\s*[.)\]:-]\s+|\d{1,3}\s+(?=\S+\s+[-–—]\s))/;
const DASH = /\s+[-–—]\s+/;

function splitCsvLine(line: string, sep: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i] as string;
		if (quoted) {
			if (c === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cur += c;
		} else if (c === '"') quoted = true;
		else if (c === sep) {
			out.push(cur);
			cur = "";
		} else cur += c;
	}
	out.push(cur);
	return out.map((s) => s.trim());
}

const ARTIST_HEADERS = [
	"artist",
	"artists",
	"artist name",
	"artist name(s)",
	"performer",
];
const TITLE_HEADERS = ["title", "track", "track name", "song", "name"];
const MIX_HEADERS = ["mix", "mix name", "version"];

// "Artist - Title" per line (en/em dash too, optional "1." numbering), or a CSV
// / TSV with an artist and a title column in its header row. Blank lines and
// "#" comments are skipped.
export function parseTextList(
	text: string,
	ref = "text",
	source: WantSource = "text",
): ParseResult {
	const lines = text.replace(/^﻿/, "").split(/\r?\n/);
	const warnings: string[] = [];
	const wants: Want[] = [];
	const first = lines.find((l) => l.trim() !== "") ?? "";
	const sep = first.includes("\t") ? "\t" : first.includes(",") ? "," : "";
	let cols: { artist: number; title: number; mix: number } | null = null;
	let start = 0;
	if (sep) {
		const head = splitCsvLine(first, sep).map((h) => fold(h));
		const find = (names: string[]) => head.findIndex((h) => names.includes(h));
		const artist = find(ARTIST_HEADERS);
		const title = find(TITLE_HEADERS);
		if (artist >= 0 && title >= 0) {
			cols = { artist, title, mix: find(MIX_HEADERS) };
			start = lines.indexOf(first) + 1;
		}
	}
	for (let i = start; i < lines.length; i++) {
		const line = (lines[i] as string).trim();
		if (line === "" || line.startsWith("#")) continue;
		let want: Want | null = null;
		if (cols && sep) {
			const cells = splitCsvLine(line, sep);
			want = makeWant(
				source,
				ref,
				cells[cols.artist] ?? "",
				cells[cols.title] ?? "",
				{
					mix: cols.mix >= 0 ? cells[cols.mix] : null,
				},
			);
		} else {
			const parts = line.replace(LEADING_INDEX, "").split(DASH);
			if (parts.length >= 2)
				want = makeWant(
					source,
					ref,
					parts[0] as string,
					parts.slice(1).join(" - "),
				);
		}
		if (want) wants.push(want);
		else
			warnings.push(
				`line ${i + 1}: not "Artist - Title": ${line.slice(0, 60)}`,
			);
	}
	return { name: null, wants: dedupeWants(wants), warnings };
}
