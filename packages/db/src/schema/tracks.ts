import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable("tracks", {
	id: text("id").primaryKey(),
	title: text("title"),
	artist: text("artist"),
	album: text("album"),
	genre: text("genre"),
	year: integer("year"),
	comment: text("comment"),
	bitrate: integer("bitrate"),
	duration: real("duration"),
	createdAt: integer("createdAt"),
	updatedAt: integer("updatedAt"),
});

export type TrackRow = typeof tracks.$inferSelect;
export type InsertTrackRow = typeof tracks.$inferInsert;
