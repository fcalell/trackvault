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
export * from "@fcalell/plugin-auth/schema/devices";
export * from "@fcalell/plugin-auth/schema/oauth";
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
		// Play history imported from Rekordbox (all devices): kept on the row so a smart
		// playlist can test it. Not a library change: the version does not move.
		playCount: integer("play_count").notNull().default(0),
		lastPlayedAt: integer("last_played_at", { mode: "timestamp_ms" }),
		// The container (mp3, flac, m4a, aiff, wav) and what is coded inside it (mp3,
		// flac, aac, alac, pcm...): lossless is a codec, not an extension. (The column
		// keeps its old "mp3" default: dropping it makes SQLite rebuild the table, which
		// drops the FTS triggers. Every writer sets the format.)
		format: text("format").notNull().default("mp3"),
		codec: text("codec"),
		bitrate: integer("bitrate"),
		sampleRate: integer("sample_rate"),
		bitDepth: integer("bit_depth"),
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
		// R4: the analysis columns sort, filter and feed the stats and the set builder.
		index("tracks_energy_idx").on(t.energy, t.id),
		index("tracks_loudness_idx").on(t.loudness, t.id),
		index("tracks_play_count_idx").on(t.playCount, t.id),
		index("tracks_last_played_idx").on(t.lastPlayedAt, t.id),
		// "Changed since version N" in (version, id) order: a sync page is a range scan.
		index("tracks_version_idx").on(t.version, t.id),
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

export const CHANGE_ORIGINS = [
	"ui",
	"rule",
	"autotag",
	"rekordbox",
	"agent",
	"scan",
	"analysis",
	"mcp",
] as const;
// `rekordbox:<deviceId>` is a change merged from one install's import.
export type ChangeOrigin =
	| (typeof CHANGE_ORIGINS)[number]
	| `rekordbox:${string}`;

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
		origin: text("origin").$type<ChangeOrigin>().notNull(),
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
		// -- R3 acquisition --
		// The slskd sidecar: its base URL, its API key and the folder it saves
		// downloads to (null asks slskd for it).
		slskdUrl: text("slskd_url"),
		slskdApiKey: text("slskd_api_key"),
		slskdDownloadsDir: text("slskd_downloads_dir"),
		// Spotify playlist import (client credentials of the owner's own app).
		spotifyClientId: text("spotify_client_id"),
		spotifyClientSecret: text("spotify_client_secret"),
		// What the inbox approves by itself: new tracks, better copies that replace
		// a library track, and exact or same-song duplicates rejected.
		inboxAutoApprove: integer("inbox_auto_approve", { mode: "boolean" })
			.notNull()
			.default(false),
		inboxAutoReplace: integer("inbox_auto_replace", { mode: "boolean" })
			.notNull()
			.default(false),
		inboxAutoRejectDuplicates: integer("inbox_auto_reject_duplicates", {
			mode: "boolean",
		})
			.notNull()
			.default(false),
		// core/inbox decision thresholds: a lossy copy must beat the library's by
		// this many kbps; fuzzy and acoustic matches under their percent need a person.
		inboxBitrateMarginKbps: integer("inbox_bitrate_margin_kbps")
			.notNull()
			.default(64),
		inboxFuzzyPercent: integer("inbox_fuzzy_percent").notNull().default(90),
		inboxAcousticPercent: integer("inbox_acoustic_percent")
			.notNull()
			.default(85),
		// The wishlist downloads the best accepted candidate by itself above this
		// score (0 to 100) when switched on; otherwise it marks the want found.
		wishlistAutoDownload: integer("wishlist_auto_download", { mode: "boolean" })
			.notNull()
			.default(false),
		wishlistMinScore: integer("wishlist_min_score").notNull().default(75),
		// The least format a candidate may have: any, good (256+), high (320 or
		// lossless), lossless.
		wantedQuality: text("wanted_quality", {
			enum: ["any", "good", "high", "lossless"],
		})
			.notNull()
			.default("good"),
		// Peers with a longer queue are passed over (0 keeps all).
		slskdMaxQueue: integer("slskd_max_queue").notNull().default(200),
		// -- R4 intelligence --
		// Auto-tag providers: each can be switched off; one with a key or a user agent
		// asks for it before it is used. Responses are remembered for `autotagCacheDays`.
		autotagMusicbrainz: integer("autotag_musicbrainz", { mode: "boolean" })
			.notNull()
			.default(true),
		// "TrackVault/1.0 (you@example.com)": MusicBrainz blocks anonymous agents.
		autotagMusicbrainzAgent: text("autotag_musicbrainz_agent"),
		autotagAcoustid: integer("autotag_acoustid", { mode: "boolean" })
			.notNull()
			.default(true),
		autotagAcoustidKey: text("autotag_acoustid_key"),
		autotagDiscogs: integer("autotag_discogs", { mode: "boolean" })
			.notNull()
			.default(true),
		autotagDiscogsToken: text("autotag_discogs_token"),
		autotagBeatport: integer("autotag_beatport", { mode: "boolean" })
			.notNull()
			.default(true),
		autotagBeatportToken: text("autotag_beatport_token"),
		autotagDeezer: integer("autotag_deezer", { mode: "boolean" })
			.notNull()
			.default(true),
		// fill-empty only fills tags the file leaves empty; overwrite also replaces
		// differing values (never the title or artist it searched by).
		autotagPolicy: text("autotag_policy", {
			enum: ["fill-empty", "overwrite"],
		})
			.notNull()
			.default("fill-empty"),
		// The least merged confidence (percent) a proposal needs to be made.
		autotagMinConfidence: integer("autotag_min_confidence")
			.notNull()
			.default(70),
		autotagCacheDays: integer("autotag_cache_days").notNull().default(30),
		// The inbox pipeline's auto-tag step fills tags above the confidence by itself.
		autotagInbox: integer("autotag_inbox", { mode: "boolean" })
			.notNull()
			.default(false),
		// A cover under this many pixels on its short side is not acceptable art.
		artMinSide: integer("art_min_side").notNull().default(500),
		// New tracks lacking BPM, key, energy or loudness are analysed in the background.
		analyseAuto: integer("analyse_auto", { mode: "boolean" })
			.notNull()
			.default(true),
		// An empty BPM, key or energy tag is filled from the analysis above this
		// confidence (percent); Rekordbox-analysed tracks are never touched.
		analyseFillConfidence: integer("analyse_fill_confidence")
			.notNull()
			.default(70),
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
		origin: text("origin").$type<ChangeOrigin>().notNull(),
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

// -- R2 playlists ----------------------------------------------------------

export const PLAYLIST_KINDS = ["folder", "manual", "smart"] as const;
export type PlaylistKind = (typeof PLAYLIST_KINDS)[number];

// The playlist tree: folders hold playlists and folders, a manual playlist holds an
// ordered list of tracks, a smart one holds a rule (core/smart `SmartPlaylist` as
// JSON) and no rows. `position` orders siblings and is fractional: a move writes one
// number between its neighbours.
export const playlists = sqliteTable(
	"playlists",
	{
		id: text("id").primaryKey(),
		parentId: text("parent_id"),
		kind: text("kind", { enum: PLAYLIST_KINDS }).notNull(),
		name: text("name").notNull(),
		position: real("position").notNull(),
		rule: text("rule", { mode: "json" }),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [index("playlists_parent_idx").on(t.parentId, t.position, t.id)],
);

// A manual playlist's tracks in order. `position` is fractional, so a reorder is one
// row; a playlist holds a track once (the sync's membership is a set).
export const playlistTracks = sqliteTable(
	"playlist_tracks",
	{
		playlistId: text("playlist_id")
			.notNull()
			.references(() => playlists.id, { onDelete: "cascade" }),
		trackId: text("track_id")
			.notNull()
			.references(() => tracks.id, { onDelete: "cascade" }),
		position: real("position").notNull(),
		addedAt: at("added_at").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.playlistId, t.trackId] }),
		// A window of the playlist is a range scan of its slice.
		index("playlist_tracks_order_idx").on(t.playlistId, t.position, t.trackId),
		index("playlist_tracks_track_idx").on(t.trackId),
	],
);

// -- R2 devices and sync ---------------------------------------------------

// One row per device key (`id` is the key's id in auth's `apikey`) that has said hello:
// what the agent reported, and where the hub's streams to it stand.
export const devices = sqliteTable(
	"devices",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		platform: text("platform").notNull(),
		hostname: text("hostname"),
		localRoot: text("local_root"),
		agentVersion: text("agent_version"),
		modes: text("modes", { mode: "json" }),
		freeDiskBytes: integer("free_disk_bytes"),
		totalDiskBytes: integer("total_disk_bytes"),
		// The RekordboxStatus and DeviceStatus the agent last reported.
		rekordbox: text("rekordbox", { mode: "json" }),
		status: text("status", { mode: "json" }),
		// What the last Rekordbox import and export did ({ import?, export? }).
		activity: text("activity", { mode: "json" }),
		// The lineage of the Rekordbox base the hub accepted last, and its version: the
		// install's identity on the hub.
		baseId: text("base_id"),
		baseVersion: integer("base_version").notNull().default(0),
		manifestCursor: text("manifest_cursor"),
		// Where the export stream to this device stands (see rb-export).
		exportCursor: text("export_cursor"),
		firstSeenAt: at("first_seen_at").notNull(),
		lastSeenAt: at("last_seen_at").notNull(),
	},
	(t) => [index("devices_seen_idx").on(t.lastSeenAt)],
);

// What a device holds of the replica, as it reported.
export const deviceFiles = sqliteTable(
	"device_files",
	{
		deviceId: text("device_id").notNull(),
		trackId: text("track_id").notNull(),
		state: text("state").notNull(),
		fileHash: text("file_hash"),
		error: text("error"),
		at: at("at").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.deviceId, t.trackId] }),
		index("device_files_state_idx").on(t.deviceId, t.state),
	],
);

// Rekordbox ids of one install mapped to hub ids: a content id to a track, a playlist
// id to a playlist. `removed` marks a track the install dropped from its collection, so
// the export does not add it again. `stamp` is the content last exported of a smart
// playlist.
export const rekordboxLinks = sqliteTable(
	"rekordbox_links",
	{
		deviceId: text("device_id").notNull(),
		kind: text("kind", { enum: ["track", "playlist"] }).notNull(),
		rbId: text("rb_id").notNull(),
		refId: text("ref_id").notNull(),
		via: text("via"),
		state: text("state", { enum: ["linked", "removed"] })
			.notNull()
			.default("linked"),
		stamp: text("stamp"),
	},
	(t) => [
		primaryKey({ columns: [t.deviceId, t.kind, t.rbId] }),
		uniqueIndex("rekordbox_links_ref_idx").on(t.deviceId, t.kind, t.refId),
	],
);

// A field (or a playlist) changed on a device and on the hub since the base: both
// values, who won, and whether the owner has looked. `pushed` is false while the hub's
// winning value has not been sent to the device yet.
export const conflicts = sqliteTable(
	"conflicts",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		deviceId: text("device_id").notNull(),
		entity: text("entity", { enum: ["track", "playlist"] }).notNull(),
		refId: text("ref_id").notNull(),
		field: text("field"),
		baseValue: text("base_value", { mode: "json" }),
		deviceValue: text("device_value", { mode: "json" }),
		hubValue: text("hub_value", { mode: "json" }),
		winner: text("winner", { enum: ["device", "hub"] }).notNull(),
		state: text("state", { enum: ["open", "resolved"] })
			.notNull()
			.default("open"),
		resolution: text("resolution", { enum: ["hub", "device"] }),
		pushed: integer("pushed", { mode: "boolean" }).notNull().default(true),
		batchId: text("batch_id"),
		at: at("at").notNull(),
		resolvedAt: at("resolved_at"),
	},
	(t) => [
		index("conflicts_state_idx").on(t.state, t.id),
		index("conflicts_device_idx").on(t.deviceId, t.pushed, t.id),
		index("conflicts_ref_idx").on(t.entity, t.refId),
	],
);

// ANLZ files by the hash of their bytes (kept on disk beside the database).
export const analysisBlobs = sqliteTable(
	"analysis_blobs",
	{
		hash: text("hash").primaryKey(),
		trackId: text("track_id").notNull(),
		deviceId: text("device_id").notNull(),
		kind: text("kind").notNull(),
		size: integer("size").notNull(),
		at: at("at").notNull(),
	},
	(t) => [index("analysis_blobs_track_idx").on(t.trackId)],
);

// Which blob is a track's analysis of a kind, per the device it came from.
export const trackAnalysis = sqliteTable(
	"track_analysis",
	{
		trackId: text("track_id").notNull(),
		kind: text("kind").notNull(),
		deviceId: text("device_id").notNull(),
		hash: text("hash").notNull(),
		size: integer("size").notNull(),
		at: at("at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.trackId, t.kind, t.deviceId] })],
);

// Cues, hot cues and loops of a track: the whole set, the latest import winning.
export const cues = sqliteTable(
	"cues",
	{
		trackId: text("track_id")
			.notNull()
			.references(() => tracks.id, { onDelete: "cascade" }),
		idx: integer("idx").notNull(),
		kind: integer("kind").notNull(),
		startMs: integer("start_ms").notNull(),
		endMs: integer("end_ms"),
		color: integer("color"),
		colorTableIndex: integer("color_table_index"),
		comment: text("comment"),
		activeLoop: integer("active_loop", { mode: "boolean" })
			.notNull()
			.default(false),
		beatLoopSize: integer("beat_loop_size"),
	},
	(t) => [primaryKey({ columns: [t.trackId, t.idx] })],
);

// Who last set a track's cues and when (the merge is latest wins, per track).
export const cueSets = sqliteTable("cue_sets", {
	trackId: text("track_id").primaryKey(),
	deviceId: text("device_id").notNull(),
	takenAt: integer("taken_at").notNull(),
	at: at("at").notNull(),
	// The cue set as `kind:start:end:color:comment` strings, sorted (core cueSignature).
	signature: text("signature", { mode: "json" }).notNull(),
});

// Play history from every install; never written back.
export const plays = sqliteTable(
	"plays",
	{
		trackId: text("track_id").notNull(),
		deviceId: text("device_id").notNull(),
		playedAt: integer("played_at").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.trackId, t.deviceId, t.playedAt] }),
		index("plays_time_idx").on(t.playedAt),
	],
);

// A Rekordbox import part already merged: a repeat of (batch, part) answers the same.
export const importParts = sqliteTable(
	"import_parts",
	{
		batchId: text("batch_id").notNull(),
		part: integer("part").notNull(),
		deviceId: text("device_id").notNull(),
		parts: integer("parts").notNull(),
		result: text("result", { mode: "json" }).notNull(),
		at: at("at").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.batchId, t.part] }),
		index("import_parts_at_idx").on(t.at),
	],
);

// A resumable upload from a device into the library's inbox.
export const uploads = sqliteTable(
	"uploads",
	{
		id: text("id").primaryKey(),
		deviceId: text("device_id").notNull(),
		audioHash: text("audio_hash").notNull(),
		fileHash: text("file_hash").notNull(),
		size: integer("size").notNull(),
		name: text("name").notNull(),
		sourceRelPath: text("source_rel_path"),
		mtimeMs: integer("mtime_ms").notNull(),
		received: integer("received").notNull().default(0),
		state: text("state", { enum: ["receiving", "complete", "aborted"] })
			.notNull()
			.default("receiving"),
		// Where the finished file landed, relative to the library root.
		landedPath: text("landed_path"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("uploads_device_hash_idx").on(t.deviceId, t.fileHash),
		index("uploads_state_idx").on(t.state, t.updatedAt),
	],
);

// A track removed for good, so a device reading "changes since version N" learns of it.
export const trackTombstones = sqliteTable(
	"track_tombstones",
	{
		trackId: text("track_id").primaryKey(),
		version: integer("version").notNull(),
		at: at("at").notNull(),
	},
	(t) => [index("track_tombstones_version_idx").on(t.version, t.trackId)],
);

// -- R3 acquisition ----------------------------------------------------------

export const INBOX_STATES = [
	"queued",
	"processing",
	"awaiting-approval",
	"duplicate",
	"needs-review",
	"approved",
	"rejected",
	"failed",
] as const;

// A file in `<library>/Inbox/` and where it stands in core's INBOX_PIPELINE. It is no
// track until approved: the scanner leaves the folder alone. `steps` is the pipeline's
// per-step state (core/inbox `StepResult`), `decision` the `inboxDecision` verdict.
export const inboxItems = sqliteTable(
	"inbox_items",
	{
		id: text("id").primaryKey(),
		// Relative to the library root, "/" separated, under `Inbox/`.
		path: text("path").notNull(),
		source: text("source", {
			enum: ["upload", "soulseek", "watch", "agent"],
		}).notNull(),
		sourceRef: text("source_ref"),
		state: text("state", { enum: INBOX_STATES }).notNull().default("queued"),
		steps: text("steps", { mode: "json" }).notNull(),
		size: integer("size").notNull().default(0),
		mtimeMs: integer("mtime_ms").notNull().default(0),
		audioHash: text("audio_hash"),
		fileHash: text("file_hash"),
		format: text("format"),
		codec: text("codec"),
		bitrate: integer("bitrate"),
		sampleRate: integer("sample_rate"),
		bitDepth: integer("bit_depth"),
		durationMs: integer("duration_ms"),
		hasArt: integer("has_art", { mode: "boolean" }).notNull().default(false),
		corrupt: integer("corrupt", { mode: "boolean" }).notNull().default(false),
		// The tags as read from the file, and the tags the pipeline would write
		// (rules, then the taxonomy): a TagValues patch against the first.
		tags: text("tags", { mode: "json" }),
		proposed: text("proposed", { mode: "json" }),
		fingerprint: blob("fingerprint", { mode: "buffer" }),
		// core/inbox InboxDecision, with the matches it was made from.
		decision: text("decision", { mode: "json" }),
		decisionKind: text("decision_kind", {
			enum: ["accept", "duplicate-of", "better-than-existing", "needs-review"],
		}),
		matches: text("matches", { mode: "json" }),
		// A decision the owner made (keep it, replace this track) over the pipeline's.
		override: text("override", { mode: "json" }),
		// Where approval files it, relative to the library root.
		target: text("target"),
		// The spectral cutoff check the ranking asked for, and whether it ran.
		needsCutoffCheck: integer("needs_cutoff_check", { mode: "boolean" })
			.notNull()
			.default(false),
		cutoff: text("cutoff", { mode: "json" }),
		wantId: integer("want_id"),
		downloadId: text("download_id"),
		// The track an approved item became.
		trackId: text("track_id"),
		error: text("error"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("inbox_items_path_idx").on(t.path),
		index("inbox_items_state_idx").on(t.state, t.createdAt, t.id),
		index("inbox_items_hash_idx").on(t.audioHash),
	],
);

export const DOWNLOAD_STATES = [
	"requested",
	"queued",
	"downloading",
	"completed",
	"imported",
	"failed",
	"cancelled",
] as const;

// A file asked of a Soulseek peer through slskd. The poller keeps `state` and the
// progress in step with slskd's transfers and, once the file is whole, moves it into
// the inbox.
export const downloads = sqliteTable(
	"downloads",
	{
		id: text("id").primaryKey(),
		username: text("username").notNull(),
		// The peer's path (backslashes as the peer reports it).
		filename: text("filename").notNull(),
		size: integer("size").notNull().default(0),
		artist: text("artist"),
		title: text("title"),
		format: text("format"),
		bitrate: integer("bitrate"),
		state: text("state", { enum: DOWNLOAD_STATES })
			.notNull()
			.default("requested"),
		// slskd's own state string, and its transfer id once the poller sees it.
		rawState: text("raw_state"),
		slskdId: text("slskd_id"),
		bytes: integer("bytes").notNull().default(0),
		speed: real("speed").notNull().default(0),
		score: real("score"),
		needsCutoffCheck: integer("needs_cutoff_check", { mode: "boolean" })
			.notNull()
			.default(false),
		wantId: integer("want_id"),
		inboxItemId: text("inbox_item_id"),
		error: text("error"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("downloads_file_idx").on(t.username, t.filename),
		index("downloads_state_idx").on(t.state, t.createdAt),
	],
);

export const WANT_STATUSES = [
	"wanted",
	"searching",
	"found",
	"downloading",
	"downloaded",
	"in-library",
	"gave-up",
	"ignored",
] as const;

// What the owner wants and the library lacks (core/wishlist `Want` plus the retry
// state). `key` is the folded artist, title and mix: a want is added once.
export const wishlist = sqliteTable(
	"wishlist",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		key: text("key").notNull(),
		artist: text("artist").notNull(),
		title: text("title").notNull(),
		mix: text("mix"),
		source: text("source").notNull(),
		sourceRef: text("source_ref").notNull(),
		status: text("status", { enum: WANT_STATUSES }).notNull().default("wanted"),
		durationSec: real("duration_sec"),
		isrc: text("isrc"),
		label: text("label"),
		attempts: integer("attempts").notNull().default(0),
		lastAttemptAt: at("last_attempt_at"),
		// When the next search is due; null searches as soon as the runner looks.
		nextSearchAt: at("next_search_at"),
		// A want for a better copy of this track: the library's own copy is not
		// "already in the library", and a candidate must beat its format score.
		betterThanTrackId: text("better_than_track_id"),
		minFormatScore: real("min_format_score"),
		// The best candidate of the last search and its score, for review.
		bestScore: real("best_score"),
		note: text("note"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("wishlist_key_idx").on(t.key),
		index("wishlist_status_idx").on(t.status, t.nextSearchAt, t.id),
		index("wishlist_created_idx").on(t.createdAt, t.id),
	],
);

// Ranked candidates of a search (core/ranking), one row each, read in windows.
// `searchId` is a search job's id or `want-<id>`; a new search of the same id
// replaces the old rows.
export const searchResults = sqliteTable(
	"search_results",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		searchId: text("search_id").notNull(),
		pos: integer("pos").notNull(),
		username: text("username").notNull(),
		filename: text("filename").notNull(),
		size: integer("size").notNull(),
		format: text("format").notNull(),
		bitrate: integer("bitrate"),
		sampleRate: integer("sample_rate"),
		bitDepth: integer("bit_depth"),
		lengthSec: real("length_sec"),
		queueLength: integer("queue_length").notNull().default(0),
		freeSlot: integer("free_slot", { mode: "boolean" })
			.notNull()
			.default(false),
		artist: text("artist"),
		title: text("title"),
		mix: text("mix"),
		score: real("score").notNull(),
		rejected: integer("rejected", { mode: "boolean" }).notNull().default(false),
		reasons: text("reasons", { mode: "json" }).notNull(),
		needsCutoffCheck: integer("needs_cutoff_check", { mode: "boolean" })
			.notNull()
			.default(false),
		// "Already in the library": core/ranking HaveStatus and the best track.
		have: text("have").notNull().default("none"),
		haveTrackId: text("have_track_id"),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		index("search_results_search_idx").on(t.searchId, t.pos),
		index("search_results_created_idx").on(t.createdAt),
	],
);

// A playlist import: what was parsed, and how it matched the library.
export const imports = sqliteTable(
	"imports",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		source: text("source").notNull(),
		ref: text("ref").notNull(),
		state: text("state", { enum: ["parsing", "ready", "failed"] })
			.notNull()
			.default("parsing"),
		// The pasted text or file, until the job has read it.
		input: text("input"),
		warnings: text("warnings", { mode: "json" }).notNull(),
		error: text("error"),
		// The playlist made from the matched tracks.
		playlistId: text("playlist_id"),
		createdAt: at("created_at").notNull(),
	},
	(t) => [index("imports_created_idx").on(t.createdAt)],
);

export const importItems = sqliteTable(
	"import_items",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		importId: text("import_id")
			.notNull()
			.references(() => imports.id, { onDelete: "cascade" }),
		pos: integer("pos").notNull(),
		artist: text("artist").notNull(),
		title: text("title").notNull(),
		mix: text("mix"),
		durationSec: real("duration_sec"),
		isrc: text("isrc"),
		label: text("label"),
		source: text("source").notNull(),
		sourceRef: text("source_ref").notNull(),
		// matched | missing | uncertain | other-version, as core/matchWants sorted it.
		status: text("status", {
			enum: ["matched", "missing", "uncertain", "other-version"],
		}).notNull(),
		// The library tracks that matched (best first) and the confidence.
		trackIds: text("track_ids", { mode: "json" }).notNull(),
		confidence: real("confidence").notNull().default(0),
		// What the owner did: wishlist | playlist | kept (confirmed or ignored).
		resolution: text("resolution", {
			enum: ["wishlist", "confirmed", "ignored"],
		}),
	},
	(t) => [index("import_items_import_idx").on(t.importId, t.status, t.pos)],
);

// -- R4 intelligence -------------------------------------------------------

// Provider responses (core/providers `ProviderCache`), keyed by request URL, until `expiresAt`.
export const providerCache = sqliteTable(
	"provider_cache",
	{
		key: text("key").primaryKey(),
		value: text("value").notNull(),
		expiresAt: at("expires_at").notNull(),
	},
	(t) => [index("provider_cache_expires_idx").on(t.expiresAt)],
);

export const PROPOSAL_STATES = [
	"pending",
	"accepted",
	"rejected",
	"applied",
	"stale",
] as const;

// An auto-tag result waiting for a decision: one row per field of a track. `before` is
// what the track had when the provider was asked, so an accepted proposal is applied
// only while the field still holds it (else it goes `stale`).
export const proposals = sqliteTable(
	"proposals",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		// The auto-tag job that made it.
		runId: text("run_id").notNull(),
		trackId: text("track_id")
			.notNull()
			.references(() => tracks.id, { onDelete: "cascade" }),
		// "Artist - Title" as the review lists it.
		label: text("label").notNull(),
		field: text("field").notNull(),
		before: text("before"),
		after: text("after").notNull(),
		source: text("source").notNull(),
		sourceUrl: text("source_url"),
		confidence: real("confidence").notNull(),
		// Other values the providers offered: { value, source, confidence }[].
		alternatives: text("alternatives", { mode: "json" }),
		state: text("state", { enum: PROPOSAL_STATES })
			.notNull()
			.default("pending"),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		index("proposals_review_idx").on(t.state, nocase(t.label), t.id),
		index("proposals_track_idx").on(t.trackId, t.field),
		index("proposals_run_idx").on(t.runId),
	],
);

// What the analysis measured, per track, with how sure it is. The tags are filled
// from it only above the settings' confidence; the numbers stay here either way.
export const analysisResults = sqliteTable(
	"analysis_results",
	{
		trackId: text("track_id")
			.primaryKey()
			.references(() => tracks.id, { onDelete: "cascade" }),
		bpm: real("bpm"),
		bpmConfidence: real("bpm_confidence"),
		// Camelot ("8A").
		key: text("key"),
		keyConfidence: real("key_confidence"),
		// 1 to 10.
		energy: integer("energy"),
		energyConfidence: real("energy_confidence"),
		lufs: real("lufs"),
		loudnessRange: real("loudness_range"),
		truePeakDb: real("true_peak_db"),
		// Why a part could not be measured (ffmpeg missing, undecodable, silent).
		note: text("note"),
		fileHash: text("file_hash"),
		analysedAt: at("analysed_at").notNull(),
	},
	(t) => [index("analysis_results_at_idx").on(t.analysedAt)],
);

// A cover search that found nothing (or only art too small): not repeated until
// forced or the days pass.
export const artChecks = sqliteTable("art_checks", {
	trackId: text("track_id")
		.primaryKey()
		.references(() => tracks.id, { onDelete: "cascade" }),
	// embedded | none | small | kept
	result: text("result").notNull(),
	source: text("source"),
	width: integer("width"),
	height: integer("height"),
	checkedAt: at("checked_at").notNull(),
});

// The set being built (one at a time): the tracks in their order.
export const setDrafts = sqliteTable("set_drafts", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	trackIds: text("track_ids", { mode: "json" }).notNull(),
	updatedAt: at("updated_at").notNull(),
});
