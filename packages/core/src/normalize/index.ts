// Text normalisation for matching: case, diacritics, artist separators, and the
// mix name inside a title. Every key here is for comparing and searching; the
// text a user sees is the file's own.

const LETTER_MAP: Record<string, string> = {
	ß: "ss",
	ø: "o",
	æ: "ae",
	œ: "oe",
	đ: "d",
	ð: "d",
	þ: "th",
	ł: "l",
	ı: "i",
};

// Lower case, accents and punctuation gone, "&" read as "and", one space between words.
export function fold(input: string | null | undefined): string {
	if (!input) return "";
	const stripped = input
		.normalize("NFKD")
		.replace(/\p{M}+/gu, "")
		.toLowerCase()
		.replace(/[ßøæœđðþłı]/g, (c) => LETTER_MAP[c] ?? c)
		.replace(/&/g, " and ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
	return stripped.replace(/\s+/g, " ");
}

// Joins the folded parts into the text a search matches against.
export function searchKey(...parts: Array<string | null | undefined>): string {
	return parts
		.map(fold)
		.filter((p) => p !== "")
		.join(" ");
}

const ARTIST_SEPARATOR =
	/\s*(?:;|\s&\s|,\s|\s+\/\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+vs\.?\s+|\s+x\s+|\s+pres\.?\s+)\s*/i;

// The artists named in an artist field. A band written with a separator
// ("Above & Beyond") is split too: the parts are for matching, never display.
export function splitArtists(raw: string | null | undefined): string[] {
	if (!raw) return [];
	const seen = new Set<string>();
	const parts: string[] = [];
	for (const part of raw.split(ARTIST_SEPARATOR)) {
		const name = part.trim();
		const key = fold(name);
		if (key === "" || seen.has(key)) continue;
		seen.add(key);
		parts.push(name);
	}
	return parts;
}

const MIX_WORDS =
	/\b(?:mix|edit|remix|version|dub|bootleg|rework|vip|flip|instrumental|acapella|a cappella|radio|extended|original|club|remaster(?:ed)?)\b/i;
const FEATURING = /^(?:feat\.?|ft\.?|featuring|with)\s+(.+)$/i;
const MIX_SUFFIX =
	/\s+-\s+([^-]*\b(?:mix|edit|remix|version|dub|rework|bootleg|flip|vip)\b[^-]*)$/i;
const GENERIC_MIX_WORDS = new Set([
	"original",
	"extended",
	"radio",
	"club",
	"instrumental",
	"vocal",
	"dub",
	"short",
	"long",
	"album",
	"main",
	"full",
	"single",
	"clean",
	"dirty",
	"explicit",
	"edit",
	"mix",
	"version",
	"remastered",
	"remaster",
	"the",
]);
const REMIX_KINDS =
	/^(.*?)(?:'s)?\s+(?:remix|rework|bootleg|edit|flip|vip(?: mix)?|dub(?: mix)?|mix)$/i;

export interface ParsedTitle {
	// The title without its mix name and featuring credits.
	base: string;
	mixName: string | null;
	remixer: string | null;
	features: string[];
}

export function parseTitle(raw: string | null | undefined): ParsedTitle {
	let title = (raw ?? "").trim();
	const features: string[] = [];
	const mixes: string[] = [];

	title = title.replace(/[([]([^()[\]]*)[)\]]/g, (whole, inner: string) => {
		const content = inner.trim();
		const feat = FEATURING.exec(content);
		if (feat) {
			features.push(...splitArtists(feat[1]));
			return " ";
		}
		if (MIX_WORDS.test(content)) {
			mixes.push(content);
			return " ";
		}
		return whole;
	});

	const suffix = MIX_SUFFIX.exec(title);
	if (suffix) {
		mixes.push((suffix[1] as string).trim());
		title = title.slice(0, suffix.index);
	}

	const mixName =
		mixes.length > 0 ? mixes.join(" / ").replace(/\s+/g, " ") : null;
	let remixer: string | null = null;
	for (const mix of mixes) {
		const found = REMIX_KINDS.exec(mix);
		const prefix = found?.[1]?.trim();
		if (!prefix) continue;
		const words = fold(prefix).split(" ");
		if (words.every((w) => GENERIC_MIX_WORDS.has(w))) continue;
		remixer = prefix;
		break;
	}
	return {
		base: title.replace(/\s+/g, " ").trim(),
		mixName,
		remixer,
		features,
	};
}

// Two spellings of the plain version compare equal: no mix, "Original Mix".
export function mixKey(mixName: string | null | undefined): string {
	const key = fold(mixName);
	return key === "original" ||
		key === "original mix" ||
		key === "original version"
		? ""
		: key;
}

export interface NormalizedTrack {
	// Individual artists, the featured ones from the title last.
	artists: string[];
	// Folded artists, sorted, joined with "|": the facet and match key.
	artistsKey: string;
	titleBase: string;
	mixName: string | null;
	remixer: string | null;
	mixKey: string;
	// The fuzzy dedupe block: main artists and base title, mix and features stripped.
	blockKey: string;
	// One string to search by: artist, title, album and label, folded.
	searchText: string;
}

export function normalizeTrack(input: {
	title: string | null;
	artist: string | null;
	album?: string | null;
	label?: string | null;
}): NormalizedTrack {
	const title = parseTitle(input.title);
	const main = splitArtists(input.artist);
	const seen = new Set(main.map(fold));
	const artists = [...main];
	for (const name of title.features) {
		const key = fold(name);
		if (key !== "" && !seen.has(key)) {
			seen.add(key);
			artists.push(name);
		}
	}
	const sortedMain = main
		.map(fold)
		.filter((k) => k !== "")
		.sort();
	return {
		artists,
		artistsKey: artists
			.map(fold)
			.filter((k) => k !== "")
			.sort()
			.join("|"),
		titleBase: title.base,
		mixName: title.mixName,
		remixer: title.remixer,
		mixKey: mixKey(title.mixName),
		blockKey: `${sortedMain.join("|")}|${fold(title.base)}`,
		searchText: searchKey(input.artist, input.title, input.album, input.label),
	};
}
