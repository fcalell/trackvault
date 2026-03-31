import {
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable(
	"tracks",
	{
		id: text("id").primaryKey(),
		title: text("title"),
		artist: text("artist"),
		album: text("album"),
		genre: text("genre"),
		year: integer("year"),
		comment: text("comment"),
		bitrate: integer("bitrate"),
		duration: real("duration"),
		createdAt: integer("createdAt")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updatedAt")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("idx_tracks_artist").on(table.artist),
		index("idx_tracks_album").on(table.album),
		index("idx_tracks_genre").on(table.genre),
	],
);
