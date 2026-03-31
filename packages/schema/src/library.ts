import { z } from "zod/v4";

export const trackSchema = z.object({
	id: z.uuid(),
	title: z.string().nullable(),
	artist: z.string().nullable(),
	album: z.string().nullable(),
	genre: z.string().nullable(),
	year: z.number().int().nullable(),
	comment: z.string().nullable(),
	bitrate: z.number().int().nullable(),
	duration: z.number().nullable(),
	createdAt: z.number().int(),
	updatedAt: z.number().int(),
});

export const localFileSchema = z.object({
	id: z.uuid(),
	filepath: z.string(),
	filename: z.string(),
	indexedAt: z.number().int().nullable(),
});

export const trackWithFileSchema = trackSchema.extend({
	filepath: z.string().nullable(),
	filename: z.string().nullable(),
});

export type TrackWithFile = z.infer<typeof trackWithFileSchema>;

export const deleteFileInputSchema = z.object({
	id: z.uuid(),
});

export const findDuplicatesInputSchema = z.object({
	probability: z.number().min(0.1).max(1),
	matchTags: z.boolean(),
	matchFilename: z.boolean(),
});

export const updateTrackInputSchema = z.object({
	id: z.uuid(),
	title: z.string().optional(),
	artist: z.string().optional(),
	album: z.string().optional(),
	genre: z.string().optional(),
	year: z.number().int().optional(),
	comment: z.string().optional(),
});

export const batchUpdateInputSchema = z.object({
	ids: z.array(z.uuid()).max(500),
	fields: z.object({
		artist: z.string().optional(),
		album: z.string().optional(),
		genre: z.string().optional(),
		year: z.number().int().optional(),
		comment: z.string().optional(),
	}),
});

export const batchDeleteInputSchema = z.object({
	ids: z.array(z.uuid()).max(500),
});
