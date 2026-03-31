import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const localFiles = sqliteTable("local_files", {
	id: text("id").primaryKey(),
	filepath: text("filepath").notNull().unique(),
	filename: text("filename").notNull(),
	indexedAt: integer("indexedAt"),
});

export type LocalFileRow = typeof localFiles.$inferSelect;
export type InsertLocalFileRow = typeof localFiles.$inferInsert;
