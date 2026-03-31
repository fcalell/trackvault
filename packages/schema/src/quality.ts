import { z } from "zod/v4";

export const genreNormalizationApplyInputSchema = z.object({
	mappings: z
		.array(
			z.object({
				from: z.string().min(1),
				to: z.string().min(1),
			}),
		)
		.max(500),
});

export const fileOrganizerInputSchema = z.object({
	pattern: z.string().min(1),
});
