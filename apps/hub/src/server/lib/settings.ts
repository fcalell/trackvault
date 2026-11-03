import { eq } from "@fcalell/plugin-db/orm";
import { settings } from "../../schema/index.ts";
import { db } from "./db.ts";

export type SettingsRow = typeof settings.$inferSelect;

// The single settings row, created with its defaults on first use.
export function readSettings(): SettingsRow {
	const database = db();
	const row = database.select().from(settings).where(eq(settings.id, 1)).get();
	if (row) return row;
	database
		.insert(settings)
		.values({ id: 1, updatedAt: new Date() })
		.onConflictDoNothing()
		.run();
	const created = database
		.select()
		.from(settings)
		.where(eq(settings.id, 1))
		.get();
	if (!created) throw new Error("settings row could not be created");
	return created;
}
