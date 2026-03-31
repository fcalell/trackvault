import { z } from "zod/v4";

export const genreNormalizationApplyInputSchema = z.object({
	mappings: z.array(
		z.object({
			from: z.string(),
			to: z.string(),
		}),
	),
});

export type GenreNormalizationApplyInput = z.infer<
	typeof genreNormalizationApplyInputSchema
>;

export const fileOrganizerInputSchema = z.object({
	pattern: z.string(),
});

export type FileOrganizerInput = z.infer<typeof fileOrganizerInputSchema>;
