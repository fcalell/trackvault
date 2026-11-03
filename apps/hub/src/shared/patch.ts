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
