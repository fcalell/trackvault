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
	createdAt: z.number().int().nullable(),
	updatedAt: z.number().int().nullable(),
});

export type Track = z.infer<typeof trackSchema>;

export const localFileSchema = z.object({
	id: z.uuid(),
	filepath: z.string(),
	filename: z.string(),
	indexedAt: z.number().int().nullable(),
});

export type LocalFile = z.infer<typeof localFileSchema>;

export const trackWithFileSchema = trackSchema.extend({
	filepath: z.string().nullable(),
	filename: z.string().nullable(),
});

export type TrackWithFile = z.infer<typeof trackWithFileSchema>;

export const deleteFileInputSchema = z.object({
	id: z.uuid(),
});

export type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;

export const findDuplicatesInputSchema = z.object({
	probability: z.number().min(0.1).max(1),
	matchTags: z.boolean(),
	matchFilename: z.boolean(),
});

export type FindDuplicatesInput = z.infer<typeof findDuplicatesInputSchema>;

export const updateTrackInputSchema = z.object({
	id: z.uuid(),
	title: z.string().optional(),
	artist: z.string().optional(),
	album: z.string().optional(),
	genre: z.string().optional(),
	year: z.number().int().optional(),
	comment: z.string().optional(),
});

export type UpdateTrackInput = z.infer<typeof updateTrackInputSchema>;

export const batchUpdateInputSchema = z.object({
	ids: z.array(z.uuid()),
	fields: z.object({
		artist: z.string().optional(),
		album: z.string().optional(),
		genre: z.string().optional(),
		year: z.number().int().optional(),
		comment: z.string().optional(),
	}),
});

export type BatchUpdateInput = z.infer<typeof batchUpdateInputSchema>;

export const batchDeleteInputSchema = z.object({
	ids: z.array(z.uuid()),
});

export type BatchDeleteInput = z.infer<typeof batchDeleteInputSchema>;
