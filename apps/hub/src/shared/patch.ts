import { z } from "@fcalell/plugin-api/schema";

const text = z
	.string()
	.nullable()
	.transform((value) => {
		const trimmed = value?.trim();
		return trimmed ? trimmed : null;
	});

// The tags an edit may carry. A key left out is left alone; null clears it.
export const tagPatch = z.object({
	title: text.optional(),
	artist: text.optional(),
	albumArtist: text.optional(),
	album: text.optional(),
	remixer: text.optional(),
	label: text.optional(),
	genre: text.optional(),
	isrc: text.optional(),
	key: text.optional(),
	comment: text.optional(),
	year: z.number().int().min(1000).max(9999).nullable().optional(),
	bpm: z.number().min(1).max(999).nullable().optional(),
	energy: z.number().int().min(1).max(10).nullable().optional(),
	rating: z.number().int().min(0).max(5).optional(),
});

// The Edit tags form: a field per tag, typed as text (empty keeps the tag, "-" clears
// it), and the custom tags to add or take off by name. One input for the preview and
// the edit, so the form's own `onChange` is what the preview reads.
const typed = z.string().trim().optional();
export const editFields = {
	artist: typed,
	albumArtist: typed,
	album: typed,
	genre: typed,
	label: typed,
	year: typed,
	key: typed,
	energy: typed,
	rating: typed,
	comment: typed,
	addTags: z.array(z.string()).optional(),
	removeTags: z.array(z.string()).optional(),
};

export const EDIT_LABELS = {
	artist: "Artist",
	albumArtist: "Album artist",
	album: "Album",
	genre: "Genre",
	label: "Label",
	year: "Year",
	key: "Key",
	energy: "Energy",
	rating: "Rating",
	comment: "Comment",
	addTags: "Add tags",
	removeTags: "Take off tags",
} as const;

const NUMBERS = new Set(["year", "energy", "rating"]);

// The patch the typed text means: a number where the tag is one, null for "-".
// Text that is no number is left out, as an empty field is.
export function patchOf(
	text: Partial<Record<keyof typeof editFields, unknown>>,
): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(text)) {
		if (typeof raw !== "string") continue;
		const value = raw.trim();
		if (value === "") continue;
		if (value === "-") patch[key] = null;
		else if (NUMBERS.has(key)) {
			const n = Number(value);
			if (Number.isFinite(n)) patch[key] = Math.round(n);
		} else patch[key] = value;
	}
	return patch;
}
