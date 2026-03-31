import { z } from "zod/v4";

export const updateSettingsSchema = z.object({
	libraryPath: z.string().min(1),
	lowBitrateThreshold: z.number().int().min(64).max(320).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
