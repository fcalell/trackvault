import {
	blob,
	check,
	ftsTable,
	index,
	integer,
	primaryKey,
	real,
	sql,
	sqliteTable,
	text,
	uniqueIndex,
} from "@fcalell/plugin-db/orm";

export * from "@fcalell/plugin-auth/schema";
export * from "@fcalell/plugin-auth/schema/organization";
export * from "@fcalell/plugin-auth/schema/passkey";

// The issue bits the library can be filtered by (core/issues), each with a partial index.
const ISSUE_BITS = [
	["lowBitrate", 1],
	["noTitle", 2],
	["noArtist", 4],
	["noGenre", 8],
	["noBpm", 16],
	["noKey", 32],
	["noArt", 64],
	["corrupt", 512],
	["fakeBitrate", 1024],
	["quarantined", 2048],
] as const;

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
		// A number per track, assigned once at insert (the highest plus one) and never
		// changed: the integer the full-text index addresses the row by (`trackSearch`).
		seq: integer("seq").notNull(),
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
		addedAt: at("added_at").notNull(),
		updatedAt: at("updated_at").notNull(),
		// The library version at this row's last change (settings.libraryVersion).
		version: integer("version").notNull(),
	},
	(t) => [
		uniqueIndex("tracks_audio_hash_idx").on(t.audioHash),
		uniqueIndex("tracks_seq_idx").on(t.seq),
		// One index per sortable column, ending in `id`: an unfiltered window is a
		// range scan from any offset.
		index("tracks_title_idx").on(nocase(t.title), t.id),
		index("tracks_artist_idx").on(nocase(t.artist), t.id),
		index("tracks_genre_idx").on(nocase(t.genre), t.id),
		index("tracks_bpm_idx").on(t.bpm, t.id),
		index("tracks_key_idx").on(t.key, t.id),
		index("tracks_rating_idx").on(t.rating, t.id),
		index("tracks_duration_idx").on(t.durationMs, t.id),
		index("tracks_bitrate_idx").on(t.bitrate, t.id),
		index("tracks_format_idx").on(t.format, t.id),
		index("tracks_issues_idx").on(t.issues, t.id),
		index("tracks_added_idx").on(t.addedAt, t.id),
		index("tracks_version_idx").on(t.version),
		index("tracks_block_key_idx").on(t.blockKey),
		// A facet filter with a sort: the equality leads and the order follows, so
		// the window is a range scan of the facet's slice and `total` a count of it
		// (measured: a genre of 11k rows went from 20 ms through a temp B-tree to 2).
		index("tracks_genre_title_idx").on(nocase(t.genre), nocase(t.title), t.id),
		index("tracks_genre_artist_idx").on(
			nocase(t.genre),
			nocase(t.artist),
			t.id,
		),
		index("tracks_genre_added_idx").on(nocase(t.genre), t.addedAt, t.id),
		index("tracks_genre_bpm_idx").on(nocase(t.genre), t.bpm, t.id),
		index("tracks_genre_key_idx").on(nocase(t.genre), t.key, t.id),
		index("tracks_genre_rating_idx").on(nocase(t.genre), t.rating, t.id),
		index("tracks_key_title_idx").on(t.key, nocase(t.title), t.id),
		index("tracks_key_artist_idx").on(t.key, nocase(t.artist), t.id),
		index("tracks_key_added_idx").on(t.key, t.addedAt, t.id),
		index("tracks_key_bpm_idx").on(t.key, t.bpm, t.id),
		// A BPM range is a range, so the order cannot follow it; the index covers the
		// sort keys, so the sorter reads no rows.
		index("tracks_bpm_title_idx").on(t.bpm, nocase(t.title), t.id),
		index("tracks_bpm_artist_idx").on(t.bpm, nocase(t.artist), t.id),
		index("tracks_bpm_added_idx").on(t.bpm, t.addedAt, t.id),
		// An issue filter tests a bit, which no ordinary index answers: one small
		// partial index per bit and per default order (title, newest).
		...ISSUE_BITS.flatMap(([name, bit]) => [
			index(`tracks_issue_${name}_title_idx`)
				.on(nocase(t.title), t.id)
				.where(sql`(${t.issues} & ${sql.raw(String(bit))}) != 0`),
			index(`tracks_issue_${name}_added_idx`)
				.on(t.addedAt, t.id)
				.where(sql`(${t.issues} & ${sql.raw(String(bit))}) != 0`),
		]),
	],
);

// Library search: tokens of the text a person types into the search box. The text
// stays in `tracks`; the index is kept in step by triggers, so a scan or an edit
// needs nothing more. Prefix indexes make search-as-you-type a lookup.
export const trackSearch = ftsTable("track_search", {
	content: tracks,
	columns: ["title", "artist", "remixer", "mixName", "album", "label", "genre"],
	rowid: "seq",
	prefix: [2, 3],
});

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
		// A quarantined file: where it lay (relative, "/" separated) and when it moved
		// under `.quarantine/<batch>/`.
		originalPath: text("original_path"),
		quarantinedAt: at("quarantined_at"),
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
		index("changes_batch_seq_idx").on(t.batchId, t.seq),
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
		// Quarantined files are deleted for good after this many days (0 keeps them).
		quarantineDays: integer("quarantine_days").notNull().default(30),
		// The organiser's folder and file template (core/organize).
		organiseTemplate: text("organise_template")
			.notNull()
			.default("{genre|Unknown}/{artist|Unknown} - {title}"),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [check("settings_single_row", sql`${t.id} = 1`)],
);

// -- R1 curation ----------------------------------------------------------

// One row per batch of changes (a scan, a bulk edit, an undo): the History list.
// `count` is the changes it holds; `undoneBy` the batch that reverted it.
export const batches = sqliteTable(
	"batches",
	{
		id: text("id").primaryKey(),
		origin: text("origin", { enum: CHANGE_ORIGINS }).notNull(),
		// What it was, in a short phrase ("Edit tags", "Cleanup rules").
		label: text("label").notNull(),
		count: integer("count").notNull().default(0),
		undoneBy: text("undone_by"),
		at: at("at").notNull(),
	},
	(t) => [index("batches_at_idx").on(t.at)],
);

// The genre taxonomy: canonical names, and the spellings that mean each.
export const genres = sqliteTable(
	"genres",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [uniqueIndex("genres_name_idx").on(nocase(t.name))],
);

export const genreAliases = sqliteTable(
	"genre_aliases",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		alias: text("alias").notNull(),
		genreId: integer("genre_id")
			.notNull()
			.references(() => genres.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("genre_aliases_alias_idx").on(nocase(t.alias)),
		index("genre_aliases_genre_idx").on(t.genreId),
	],
);

export const artistAliases = sqliteTable(
	"artist_aliases",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		alias: text("alias").notNull(),
		canonical: text("canonical").notNull(),
	},
	(t) => [uniqueIndex("artist_aliases_alias_idx").on(nocase(t.alias))],
);

export const labelAliases = sqliteTable(
	"label_aliases",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		alias: text("alias").notNull(),
		canonical: text("canonical").notNull(),
	},
	(t) => [uniqueIndex("label_aliases_alias_idx").on(nocase(t.alias))],
);

// Custom tags (vibe, set position, venue): free names a track can carry any of.
export const tags = sqliteTable(
	"tags",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [uniqueIndex("tags_name_idx").on(nocase(t.name))],
);

export const trackTags = sqliteTable(
	"track_tags",
	{
		trackId: text("track_id")
			.notNull()
			.references(() => tracks.id, { onDelete: "cascade" }),
		tagId: integer("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [
		primaryKey({ columns: [t.trackId, t.tagId] }),
		// The filter facet: the tracks of a tag, and the tag counts, from the index alone.
		index("track_tags_tag_idx").on(t.tagId, t.trackId),
	],
);

// Cleanup rules: `definition` is core/rules' `Rule` as JSON.
export const rules = sqliteTable(
	"rules",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
		builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),
		position: integer("position").notNull().default(0),
		definition: text("definition", { mode: "json" }).notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [index("rules_position_idx").on(t.position)],
);

// What a preview job found, one row per field it would change, read in windows by
// the screen. A new preview of a kind replaces the last; old ones age out.
export const previews = sqliteTable(
	"previews",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		jobId: text("job_id").notNull(),
		pos: integer("pos").notNull(),
		trackId: text("track_id").notNull(),
		label: text("label"),
		field: text("field").notNull(),
		before: text("before"),
		after: text("after"),
	},
	(t) => [index("previews_job_idx").on(t.jobId, t.pos)],
);

// Dedupe: a found group, its pre-picked keeper and why; `state` keeps a dismissal.
export const dupeGroups = sqliteTable(
	"dupe_groups",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		// The member ids sorted and hashed: the same set is the same group on a rerun.
		key: text("key").notNull(),
		reason: text("reason", { enum: ["exact", "acoustic", "fuzzy"] }).notNull(),
		confidence: real("confidence").notNull(),
		keeperId: text("keeper_id").notNull(),
		keeperReason: text("keeper_reason").notNull(),
		size: integer("size").notNull(),
		state: text("state", { enum: ["open", "dismissed", "merged"] })
			.notNull()
			.default("open"),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("dupe_groups_key_idx").on(t.key),
		index("dupe_groups_state_idx").on(t.state, t.confidence, t.id),
	],
);

export const dupeMembers = sqliteTable(
	"dupe_members",
	{
		groupId: integer("group_id")
			.notNull()
			.references(() => dupeGroups.id, { onDelete: "cascade" }),
		trackId: text("track_id").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.groupId, t.trackId] }),
		index("dupe_members_track_idx").on(t.trackId),
	],
);

// Chromaprint fingerprints (little-endian int32 bytes), one per track.
export const fingerprints = sqliteTable("fingerprints", {
	trackId: text("track_id")
		.primaryKey()
		.references(() => tracks.id, { onDelete: "cascade" }),
	data: blob("data", { mode: "buffer" }).notNull(),
	fileHash: text("file_hash"),
	createdAt: at("created_at").notNull(),
});

// What the health jobs found, per track, so a check runs only for what changed.
export const healthChecks = sqliteTable("health_checks", {
	trackId: text("track_id")
		.primaryKey()
		.references(() => tracks.id, { onDelete: "cascade" }),
	fileHash: text("file_hash"),
	// ok | warnings | corrupt | timeout | unavailable
	integrity: text("integrity"),
	integrityErrors: text("integrity_errors", { mode: "json" }),
	cutoffHz: integer("cutoff_hz"),
	// ok | suspect | fake | unknown
	bitrateVerdict: text("bitrate_verdict"),
	bitrateNote: text("bitrate_note"),
	checkedAt: at("checked_at").notNull(),
});
