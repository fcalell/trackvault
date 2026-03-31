import { ORPCError } from "@orpc/server";
import { settings } from "@repo/db-desktop/schema";
import { updateSettingsSchema } from "@repo/schema/settings";
import { eq } from "drizzle-orm";
import { baseProcedure } from "#lib/orpc";

function requireDesktopDb(context: { desktopDb?: unknown }) {
	if (!context.desktopDb)
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Desktop database not available",
		});
}

const read = baseProcedure.handler(async ({ context }) => {
	requireDesktopDb(context);
	const result = await context.desktopDb?.query.settings.findFirst({
		where: eq(settings.id, "Default"),
	});
	return result ?? null;
});

const update = baseProcedure
	.input(updateSettingsSchema)
	.handler(async ({ input, context }) => {
		requireDesktopDb(context);
		const db = context.desktopDb as NonNullable<typeof context.desktopDb>;
		const existing = await db.query.settings.findFirst({
			where: eq(settings.id, "Default"),
		});

		if (existing) {
			await db.update(settings).set(input).where(eq(settings.id, "Default"));
		} else {
			await db.insert(settings).values({
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
