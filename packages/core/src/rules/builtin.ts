import type { Rule } from "./types.ts";

// Starting rules a library can enable as they are or copy.
export const BUILTIN_RULES: readonly Rule[] = [
	{
		id: "builtin.whitespace",
		name: "Trim and collapse whitespace",
		actions: [{ do: "whitespace" }],
	},
	{
		id: "builtin.junk",
		name: "Strip URLs and promo tags",
		actions: [{ do: "stripJunk" }, { do: "whitespace" }],
	},
	{
		id: "builtin.track-number",
		name: "Remove track number prefixes",
		actions: [{ do: "stripTrackNumber" }],
	},
	{
		id: "builtin.split-artist-title",
		name: 'Split "Artist - Title" out of the title',
		actions: [{ do: "splitArtistTitle" }],
	},
	{
		id: "builtin.feat",
		name: "Move feat. from title to artist",
		actions: [{ do: "moveFeaturing", to: "artist" }],
	},
	{
		id: "builtin.separators",
		name: "Normalise artist separators",
		actions: [{ do: "normalizeSeparators" }],
	},
	{
		id: "builtin.mix-brackets",
		name: "Normalise mix names",
		actions: [{ do: "normalizeMixBrackets" }],
	},
	{
		id: "builtin.title-case",
		name: "Title case",
		actions: [{ do: "case", mode: "title" }],
	},
	{
		id: "builtin.genre-aliases",
		name: "Unify genres",
		actions: [{ do: "alias", field: "genre", table: "genre" }],
	},
];
