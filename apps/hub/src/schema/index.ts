import {
	check,
	index,
	integer,
	real,
	sql,
	sqliteTable,
	text,
	uniqueIndex,
} from "@fcalell/plugin-db/orm";

export * from "@fcalell/plugin-auth/schema";
export * from "@fcalell/plugin-auth/schema/organization";
export * from "@fcalell/plugin-auth/schema/passkey";

const at = (name: string) => integer(name, { mode: "timestamp_ms" });

// Text sorts and facets are case-insensitive: the index and the query both say
// `collate nocase`, so a window is an index range scan with the id tiebreak.
const nocase = (column: ReturnType<typeof text>) =>
	sql`${column} collate nocase`;

// One row per track, identified by the hash of its audio. The file(s) holding
// the audio live in `files`. Every sortable or filterable column leads an index
// that ends in `id`, so any ordering is a range scan, never a sort.
export const tracks = sqliteTable(
	"tracks",
	{
		id: text("id").primaryKey(),
		audioHash: text("audio_hash").notNull(),
		fingerprint: text("fingerprint"),
		title: text("title"),
		artist: text("artist"),
		// Folded artists, sorted, joined with "|" (normalize.artistsKey).
		artists: text("artists"),
		remixer: text("remixer"),
		mixName: text("mix_name"),
		album: text("album"),
		albumArtist: text("album_artist"),
		label: text("label"),
		genre: text("genre"),
		// The taxonomy's id once genres exist (R1); `genre` is the tag's own text.
		genreId: integer("genre_id"),
		year: integer("year"),
		releaseDate: text("release_date"),
		isrc: text("isrc"),
		bpm: real("bpm"),
		key: text("key"),
		energy: integer("energy"),
		loudness: real("loudness"),
		rating: integer("rating").notNull().default(0),
		colour: text("colour"),
		comment: text("comment"),
		format: text("format").notNull().default("mp3"),
		bitrate: integer("bitrate"),
		sampleRate: integer("sample_rate"),
		durationMs: integer("duration_ms"),
		size: integer("size"),
		hasArt: integer("has_art", { mode: "boolean" }).notNull().default(false),
		// Quality flags, one bit each (core/issues).
		issues: integer("issues").notNull().default(0),
		// Artist and base title with the mix stripped: the fuzzy dedupe block.
		blockKey: text("block_key"),
		// Artist, title, album and label folded, for search.
		searchText: text("search_text"),
		addedAt: at("added_at").notNull(),
		updatedAt: at("updated_at").notNull(),
		// The library version at this row's last change (settings.libraryVersion).
		version: integer("version").notNull(),
	},
	(t) => [
		uniqueIndex("tracks_audio_hash_idx").on(t.audioHash),
		index("tracks_title_idx").on(nocase(t.title), t.id),
		index("tracks_artist_idx").on(nocase(t.artist), t.id),
		index("tracks_album_idx").on(nocase(t.album), t.id),
		index("tracks_label_idx").on(nocase(t.label), t.id),
		index("tracks_genre_idx").on(nocase(t.genre), t.id),
		index("tracks_bpm_idx").on(t.bpm, t.id),
		index("tracks_key_idx").on(t.key, t.id),
		index("tracks_year_idx").on(t.year, t.id),
		index("tracks_rating_idx").on(t.rating, t.id),
		index("tracks_duration_idx").on(t.durationMs, t.id),
		index("tracks_bitrate_idx").on(t.bitrate, t.id),
		index("tracks_format_idx").on(t.format, t.id),
		index("tracks_issues_idx").on(t.issues, t.id),
		index("tracks_added_idx").on(t.addedAt, t.id),
		index("tracks_version_idx").on(t.version),
		index("tracks_block_key_idx").on(t.blockKey),
	],
);

const FILE_STATES = ["ok", "missing", "quarantined", "error"] as const;

// A file on the hub's disk. Several files can hold the same audio (copies);
// the scanner diffs by (size, mtime, inode) alone and parses what changed.
export const files = sqliteTable(
	"files",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		trackId: text("track_id").references(() => tracks.id, {
			onDelete: "set null",
		}),
		// Relative to the library root, "/" separated.
		path: text("path").notNull(),
		size: integer("size").notNull(),
		mtimeMs: integer("mtime_ms").notNull(),
		inode: integer("inode").notNull(),
		fileHash: text("file_hash"),
		state: text("state", { enum: FILE_STATES }).notNull().default("ok"),
		error: text("error"),
		scannedAt: at("scanned_at").notNull(),
	},
	(t) => [
		uniqueIndex("files_path_idx").on(t.path),
		index("files_track_idx").on(t.trackId),
		index("files_state_idx").on(t.state),
		index("files_hash_idx").on(t.fileHash),
	],
);

const JOB_STATES = [
	"queued",
	"running",
	"done",
	"failed",
	"cancelled",
] as const;

// Every bulk or slow operation. The runner claims `queued` rows (and the
// `running` ones a restart left behind), per kind concurrency.
export const jobs = sqliteTable(
	"jobs",
	{
		id: text("id").primaryKey(),
		kind: text("kind").notNull(),
		state: text("state", { enum: JOB_STATES }).notNull().default("queued"),
		// Counted units done and expected; `total` 0 means unknown.
		done: integer("done").notNull().default(0),
		total: integer("total").notNull().default(0),
		message: text("message"),
		payload: text("payload", { mode: "json" }),
		result: text("result", { mode: "json" }),
		error: text("error"),
		attempts: integer("attempts").notNull().default(0),
		createdAt: at("created_at").notNull(),
		startedAt: at("started_at"),
		finishedAt: at("finished_at"),
	},
	(t) => [
		index("jobs_state_idx").on(t.state, t.createdAt),
		index("jobs_kind_idx").on(t.kind, t.state),
		index("jobs_created_idx").on(t.createdAt),
	],
);

const CHANGE_ORIGINS = [
	"ui",
	"rule",
	"autotag",
	"rekordbox",
	"agent",
	"scan",
] as const;

// The op log: one row per field changed. It drives undo, history and sync
// cursors; `seq` is the cursor.
export const changes = sqliteTable(
	"changes",
	{
		seq: integer("seq").primaryKey({ autoIncrement: true }),
		entity: text("entity").notNull(),
		entityId: text("entity_id").notNull(),
		field: text("field").notNull(),
		before: text("before", { mode: "json" }),
		after: text("after", { mode: "json" }),
		origin: text("origin", { enum: CHANGE_ORIGINS }).notNull(),
		batchId: text("batch_id").notNull(),
		at: at("at").notNull(),
	},
	(t) => [
		index("changes_entity_idx").on(t.entity, t.entityId, t.seq),
		index("changes_batch_idx").on(t.batchId),
		index("changes_at_idx").on(t.at),
	],
);

// One row, id 1.
export const settings = sqliteTable(
	"settings",
	{
		id: integer("id").primaryKey(),
		// Where the music lives on the hub; null until the owner sets it.
		libraryRoot: text("library_root"),
		// Tracks under this many kbit/s carry the low-bitrate flag (0 is off).
		lowBitrateThreshold: integer("low_bitrate_threshold")
			.notNull()
			.default(256),
		// Bumped by every committed batch of library changes.
		libraryVersion: integer("library_version").notNull().default(0),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [check("settings_single_row", sql`${t.id} = 1`)],
);
