import { settings } from "@repo/db-desktop/schema";
import { updateSettingsSchema } from "@repo/schema/settings";
import { eq } from "drizzle-orm";
import { requireDesktopDb } from "#lib/context";
import { baseProcedure } from "#lib/orpc";

const read = baseProcedure.handler(async ({ context }) => {
	const desktopDb = requireDesktopDb(context);
	const result = await desktopDb.query.settings.findFirst({
		where: eq(settings.id, "Default"),
	});
	return result ?? null;
});

const update = baseProcedure
	.input(updateSettingsSchema)
	.handler(async ({ input, context }) => {
		const desktopDb = requireDesktopDb(context);
		const existing = await desktopDb.query.settings.findFirst({
			where: eq(settings.id, "Default"),
		});

		if (existing) {
			await desktopDb
				.update(settings)
				.set(input)
				.where(eq(settings.id, "Default"));
		} else {
			await desktopDb.insert(settings).values({
				id: "Default",
				libraryPath: input.libraryPath,
				lowBitrateThreshold: input.lowBitrateThreshold,
			});
		}
	});

export const settingsRouter = {
	read,
	update,
};
