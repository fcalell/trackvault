import { parseTitle, splitArtists } from "../normalize/index.ts";

export function collapseWhitespace(s: string): string {
	return s
		.replace(/[  -​  　﻿\t\r\n]+/g, " ")
		.replace(/ {2,}/g, " ")
		.trim();
}

const SMALL_WORDS = new Set([
	"a",
	"an",
	"the",
	"and",
	"but",
	"or",
	"nor",
	"for",
	"so",
	"yet",
	"of",
	"on",
	"in",
	"at",
	"to",
	"by",
	"as",
	"up",
	"vs",
	"vs.",
	"feat",
	"feat.",
	"ft",
	"ft.",
	"with",
	"from",
	"via",
]);
const KEEP_UPPER = new Set([
	"dj",
	"mc",
	"vip",
	"uk",
	"usa",
	"nyc",
	"ep",
	"lp",
	"tv",
	"bbc",
	"mtv",
	"cd",
	"ok",
	"dnb",
	"edm",
	"idm",
	"ost",
	"bpm",
	"xxl",
	"gta",
	"hd",
	"atb",
	"nrg",
	"ii",
	"iii",
	"iv",
	"vi",
	"vii",
	"viii",
	"ix",
	"xi",
	"xii",
	"xiii",
	"xiv",
	"xv",
	"xvi",
	"xvii",
	"xviii",
	"xix",
	"xx",
]);
const KEEP_LOWER_FORMS = new Map([
	["feat", "feat"],
	["feat.", "feat."],
	["ft", "ft"],
	["ft.", "ft."],
	["vs", "vs"],
	["vs.", "vs."],
]);
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’.]*/gu;

function capitalize(word: string): string {
	const lower = word.toLowerCase();
	let out = "";
	let up = true;
	for (const ch of lower) {
		out += up ? ch.toUpperCase() : ch;
		up = false;
	}
	return out;
}

// Title case that a DJ library tolerates: small words stay lower inside the
// text, "feat." and "vs" stay lower, DJ/MC/VIP/acronyms and Roman numerals
// stay upper, words with their own inner capitals (DnB, McFly) are untouched.
export function titleCase(input: string): string {
	const hasLower = /\p{Ll}/u.test(input);
	const matches = [...input.matchAll(WORD)];
	if (matches.length === 0) return input;
	let out = "";
	let cursor = 0;
	matches.forEach((m, i) => {
		const word = m[0];
		const start = m.index as number;
		const between = input.slice(cursor, start);
		out += between;
		cursor = start + word.length;
		const before = input.slice(0, start);
		const glued = /[\p{L}\p{N}]-$/u.test(before);
		const atStart =
			!glued &&
			(i === 0 || /[([:–—"“]\s*$/.test(before) || /\s-\s*$/.test(before));
		const isLast = i === matches.length - 1;
		const bare = word.replace(/\.+$/, "");
		const key = word.toLowerCase();
		const bareKey = bare.toLowerCase();

		if (/\p{Ll}\p{Lu}/u.test(word) && !/^\p{Lu}\p{Ll}+$/u.test(word)) {
			out += word;
		} else if (/^[xXvV]$/.test(word)) {
			out += word;
		} else if (/^(?:\p{L}\.){2,}$/u.test(word)) {
			out += word.toUpperCase();
		} else if (KEEP_UPPER.has(bareKey) && bare.length >= 2) {
			out += bare.toUpperCase() + word.slice(bare.length);
		} else if (
			hasLower &&
			bare.length >= 2 &&
			bare.length <= 5 &&
			bare === bare.toUpperCase() &&
			/^\p{Lu}+$/u.test(bare)
		) {
			out += word;
		} else if (!atStart && !isLast && !glued && KEEP_LOWER_FORMS.has(key)) {
			out += KEEP_LOWER_FORMS.get(key);
		} else if (!atStart && !isLast && !glued && SMALL_WORDS.has(key)) {
			out += key;
		} else if (KEEP_LOWER_FORMS.has(key) && !atStart) {
			out += KEEP_LOWER_FORMS.get(key);
		} else {
			out += capitalize(word);
		}
	});
	return out + input.slice(cursor);
}

export function sentenceCase(input: string): string {
	const lower = input.toLowerCase();
	return lower.replace(/\p{L}/u, (c) => c.toUpperCase());
}

const URL_BRACKETED = /[[(]\s*(?:https?:\/\/|www\.)[^\])]*[\])]/gi;
const URL_BARE = /(?:https?:\/\/|www\.)\S+/gi;
const DOMAIN_BRACKETED =
	/[[(]\s*[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|info|biz|ru|cc|me|tv|ws|fm|to|co\.uk)\s*[\])]/gi;
const DOMAIN_BARE =
	/(?:^|\s)[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|info|biz|ru)(?=\s|$)/gi;
const PROMO_TAG =
	/[[(]\s*(?:free\s*(?:download|dl|d\/l)|official\s*(?:music\s*)?(?:video|audio|visuali[sz]er|lyric\s*video)|lyrics?(?:\s*video)?|out\s*now|premiere|exclusive|preview|promo(?:\s*only)?|(?:\d{2,3})\s*kbps|\d{2,3}k|hq|hd|high\s*quality|new|download|dl|clip|soundcloud|bandcamp|buy\s*now)\s*[\])]/gi;
const LEADING_JUNK = /^[\s\-–—_|:]+/;
const TRAILING_JUNK = /[\s\-–—_|:]+$/;

export function stripJunk(input: string): string {
	let s = input;
	s = s.replace(URL_BRACKETED, " ").replace(DOMAIN_BRACKETED, " ");
	s = s.replace(URL_BARE, " ").replace(DOMAIN_BARE, " ");
	s = s.replace(PROMO_TAG, " ");
	s = s.replace(/[[(]\s*[\])]/g, " ");
	return collapseWhitespace(s)
		.replace(LEADING_JUNK, "")
		.replace(TRAILING_JUNK, "");
}

const TRACK_NUMBER =
	/^(?:\d{1,2}[-.]\d{1,3}|\d{1,3})(?:\s*[._)]\s*|\s+-\s+|-(?=\p{L}))/u;

export function stripTrackNumber(input: string): string {
	const rest = input.replace(TRACK_NUMBER, "");
	return rest.trim() === "" ? input : rest;
}

export function looksLikeMix(s: string): boolean {
	return parseTitle(`x (${s})`).mixName !== null;
}

// Moves "feat. X" credits out of the title. The title keeps its mix name.
export function extractFeaturing(title: string): {
	title: string;
	features: string[];
} {
	const features: string[] = [];
	let out = title.replace(
		/\s*[([]\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)[)\]]/gi,
		(_whole, names: string) => {
			features.push(...splitArtists(names));
			return "";
		},
	);
	out = out.replace(
		/\s+(?:feat\.?|ft\.?|featuring)\s+(.+?)(?=\s*[([]|\s+-\s+|$)/i,
		(_whole, names: string) => {
			features.push(...splitArtists(names));
			return "";
		},
	);
	return { title: collapseWhitespace(out), features };
}

export function joinFeatures(names: readonly string[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// Canonical separators inside an artist field, in place: "feat." for
// ft/featuring, "vs" for vs./versus, " x " for X, "&" for and/+/ /, ", " after a
// comma, "; " read as a comma.
export function normalizeSeparators(input: string, joiner = " & "): string {
	let s = input;
	s = s.replace(/\s*;\s*/g, ", ");
	s = s.replace(/\s*,\s*/g, ", ");
	s = s.replace(/\s+(?:ft\.?|feat\.?|featuring)\s+/gi, " feat. ");
	s = s.replace(/\s+(?:vs\.?|versus)\s+/gi, " vs ");
	s = s.replace(/\s+[xX×]\s+/g, " x ");
	s = s.replace(/\s+(?:and|\+|\/)\s+/gi, joiner);
	s = s.replace(/\s*&\s*/g, joiner);
	return collapseWhitespace(s);
}

const MIX_BRACKET = /[([]\s*([^()[\]]*?)\s*[)\]]/g;
const MIX_TEXT =
	/\b(?:mix|edit|remix|version|dub|bootleg|rework|vip|flip|instrumental|acapella|a cappella|radio|extended|original|club|remaster(?:ed)?|live)\b/i;
const MIX_TAIL =
	/\s+-\s+([^-]*\b(?:mix|edit|remix|version|dub|rework|bootleg|flip|vip)\b[^-]*)$/i;

function canonicalMixText(inner: string): string {
	let s = collapseWhitespace(inner);
	const lower = s.toLowerCase();
	const bare: Record<string, string> = {
		original: "Original Mix",
		extended: "Extended Mix",
		radio: "Radio Edit",
		club: "Club Mix",
		instrumental: "Instrumental",
		dub: "Dub Mix",
		"original version": "Original Mix",
		"radio mix": "Radio Edit",
		"radio version": "Radio Edit",
		"extended version": "Extended Mix",
		"extended original mix": "Extended Mix",
	};
	if (bare[lower]) return bare[lower];
	s = titleCase(s);
	return s.replace(/\bRemixed?\b/g, "Remix");
}

// Mix names go in round brackets, one canonical spelling: "Title - Extended
// Mix", "[extended mix]" and "(extended)" become "Title (Extended Mix)".
export function normalizeMixBrackets(title: string): string {
	let s = title.replace(MIX_BRACKET, (whole, inner: string) => {
		if (/^(?:feat\.?|ft\.?|featuring)\s/i.test(inner))
			return `(${collapseWhitespace(inner).replace(/^(?:ft\.?|featuring)\s/i, "feat. ")})`;
		if (!MIX_TEXT.test(inner)) return whole;
		return `(${canonicalMixText(inner)})`;
	});
	const tail = MIX_TAIL.exec(s);
	if (tail && !/\(/.test(tail[1] as string)) {
		s = `${s.slice(0, tail.index)} (${canonicalMixText(tail[1] as string)})`;
	}
	return collapseWhitespace(s);
}
