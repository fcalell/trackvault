import { statSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { eq } from "@fcalell/plugin-db/orm";
import { settings as settingsTable } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";
import { readSettings } from "../../server/lib/settings.ts";
import {
	applyLowBitrateThreshold,
	notifyChanged,
} from "../../server/services/library.ts";
import { libraryRootChanged } from "../../server/services/scanner.ts";

const view = z.object({
	libraryRoot: z.string().nullable(),
	lowBitrateThreshold: z.number(),
	quarantineDays: z.number(),
	libraryVersion: z.number(),
});

const asView = (row: ReturnType<typeof readSettings>) => ({
	libraryRoot: row.libraryRoot,
	lowBitrateThreshold: row.lowBitrateThreshold,
	quarantineDays: row.quarantineDays,
	libraryVersion: row.libraryVersion,
});

export const settings = {
	read: procedure({ auth: true, reads: ["settings"] })
		.output(view)
		.query(() => asView(readSettings())),

	// One setting at a time: the settings page commits by field, so each key is
	// optional and a call carries the one that changed.
	update: procedure({ auth: true, writes: ["settings"] })
		.input(
			z.object({
				libraryRoot: z.string().trim().min(1, "Enter a folder").optional(),
				lowBitrateThreshold: z
					.number("Enter a number")
					.int("Enter a whole number")
					.min(0, "Enter 0 or more")
					.max(2000, "Enter 2000 or less")
					.optional(),
				quarantineDays: z
					.number("Enter a number")
					.int("Enter a whole number")
					.min(0, "Enter 0 or more")
					.max(3650, "Enter 3650 or less")
					.optional(),
			}),
		)
		.output(view)
		.mutation(({ input }) => {
			const before = readSettings();
			let root: string | undefined;
			if (input.libraryRoot !== undefined) {
				root = normalize(input.libraryRoot).replace(/(.)\/+$/, "$1");
				if (!isAbsolute(root)) {
					throw new ApiError("BAD_REQUEST", {
						message: "Enter the folder's full path, starting with /",
					});
				}
				let isFolder = false;
				try {
					isFolder = statSync(root).isDirectory();
				} catch {
					isFolder = false;
				}
				if (!isFolder) {
					throw new ApiError("BAD_REQUEST", {
						message: "That folder doesn't exist on the hub",
					});
				}
			}
			const row = db()
				.update(settingsTable)
				.set({
					...(root !== undefined && { libraryRoot: root }),
					...(input.lowBitrateThreshold !== undefined && {
						lowBitrateThreshold: input.lowBitrateThreshold,
					}),
					...(input.quarantineDays !== undefined && {
						quarantineDays: input.quarantineDays,
					}),
					updatedAt: new Date(),
				})
				.where(eq(settingsTable.id, 1))
				.returning()
				.get();
			if (!row) throw new ApiError("INTERNAL_SERVER_ERROR");
			if (root !== undefined && root !== before.libraryRoot)
				libraryRootChanged();
			if (
				input.lowBitrateThreshold !== undefined &&
				input.lowBitrateThreshold !== before.lowBitrateThreshold
			) {
				notifyChanged(
					[],
					applyLowBitrateThreshold(input.lowBitrateThreshold),
					true,
				);
			}
			return asView(readSettings());
		}),
};
