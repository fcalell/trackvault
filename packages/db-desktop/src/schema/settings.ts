import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
	id: text("id").primaryKey().default("Default"),
	libraryPath: text("libraryPath").notNull(),
	lowBitrateThreshold: integer("lowBitrateThreshold").default(320),
});
