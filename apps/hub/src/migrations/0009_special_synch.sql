PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`audio_hash` text NOT NULL,
	`fingerprint` text,
	`title` text,
	`artist` text,
	`artists` text,
	`remixer` text,
	`mix_name` text,
	`album` text,
	`album_artist` text,
	`label` text,
	`genre` text,
	`genre_id` integer,
	`year` integer,
	`release_date` text,
	`isrc` text,
	`bpm` real,
	`key` text,
	`energy` integer,
	`loudness` real,
	`rating` integer DEFAULT 0 NOT NULL,
	`colour` text,
	`comment` text,
	`play_count` integer DEFAULT 0 NOT NULL,
	`last_played_at` integer,
	`format` text NOT NULL,
	`codec` text,
	`bitrate` integer,
	`sample_rate` integer,
	`bit_depth` integer,
	`duration_ms` integer,
	`size` integer,
	`has_art` integer DEFAULT false NOT NULL,
	`issues` integer DEFAULT 0 NOT NULL,
	`block_key` text,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tracks`("id", "seq", "audio_hash", "fingerprint", "title", "artist", "artists", "remixer", "mix_name", "album", "album_artist", "label", "genre", "genre_id", "year", "release_date", "isrc", "bpm", "key", "energy", "loudness", "rating", "colour", "comment", "play_count", "last_played_at", "format", "codec", "bitrate", "sample_rate", "bit_depth", "duration_ms", "size", "has_art", "issues", "block_key", "added_at", "updated_at", "version") SELECT "id", "seq", "audio_hash", "fingerprint", "title", "artist", "artists", "remixer", "mix_name", "album", "album_artist", "label", "genre", "genre_id", "year", "release_date", "isrc", "bpm", "key", "energy", "loudness", "rating", "colour", "comment", "play_count", "last_played_at", "format", "codec", "bitrate", "sample_rate", "bit_depth", "duration_ms", "size", "has_art", "issues", "block_key", "added_at", "updated_at", "version" FROM `tracks`;--> statement-breakpoint
DROP TABLE `tracks`;--> statement-breakpoint
ALTER TABLE `__new_tracks` RENAME TO `tracks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_audio_hash_idx` ON `tracks` (`audio_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_seq_idx` ON `tracks` (`seq`);--> statement-breakpoint
CREATE INDEX `tracks_title_idx` ON `tracks` ("title" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_artist_idx` ON `tracks` ("artist" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_idx` ON `tracks` ("genre" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_bpm_idx` ON `tracks` (`bpm`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_key_idx` ON `tracks` (`key`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_rating_idx` ON `tracks` (`rating`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_duration_idx` ON `tracks` (`duration_ms`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_bitrate_idx` ON `tracks` (`bitrate`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_format_idx` ON `tracks` (`format`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_issues_idx` ON `tracks` (`issues`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_added_idx` ON `tracks` (`added_at`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_energy_idx` ON `tracks` (`energy`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_loudness_idx` ON `tracks` (`loudness`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_play_count_idx` ON `tracks` (`play_count`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_last_played_idx` ON `tracks` (`last_played_at`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_version_idx` ON `tracks` (`version`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_block_key_idx` ON `tracks` (`block_key`);--> statement-breakpoint
CREATE INDEX `tracks_genre_title_idx` ON `tracks` ("genre" collate nocase,"title" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_artist_idx` ON `tracks` ("genre" collate nocase,"artist" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_added_idx` ON `tracks` ("genre" collate nocase,`added_at`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_bpm_idx` ON `tracks` ("genre" collate nocase,`bpm`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_key_idx` ON `tracks` ("genre" collate nocase,`key`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_rating_idx` ON `tracks` ("genre" collate nocase,`rating`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_key_title_idx` ON `tracks` (`key`,"title" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_key_artist_idx` ON `tracks` (`key`,"artist" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_key_added_idx` ON `tracks` (`key`,`added_at`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_key_bpm_idx` ON `tracks` (`key`,`bpm`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_bpm_title_idx` ON `tracks` (`bpm`,"title" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_bpm_artist_idx` ON `tracks` (`bpm`,"artist" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_bpm_added_idx` ON `tracks` (`bpm`,`added_at`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_issue_lowBitrate_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 1) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_lowBitrate_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 1) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noTitle_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 2) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noTitle_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 2) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noArtist_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 4) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noArtist_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 4) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noGenre_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 8) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noGenre_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 8) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noBpm_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 16) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noBpm_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 16) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noKey_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 32) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noKey_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 32) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noArt_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 64) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_noArt_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 64) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_corrupt_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 512) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_corrupt_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 512) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_fakeBitrate_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 1024) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_fakeBitrate_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 1024) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_quarantined_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 2048) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_quarantined_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 2048) != 0;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `track_search_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `track_search_ad`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `track_search_au`;
--> statement-breakpoint
CREATE TRIGGER `track_search_ai` AFTER INSERT ON `tracks` BEGIN
	INSERT INTO `track_search`(`rowid`, `title`, `artist`, `remixer`, `mix_name`, `album`, `label`, `genre`) VALUES (new.`seq`, new.`title`, new.`artist`, new.`remixer`, new.`mix_name`, new.`album`, new.`label`, new.`genre`);
END;
--> statement-breakpoint
CREATE TRIGGER `track_search_ad` AFTER DELETE ON `tracks` BEGIN
	INSERT INTO `track_search`(`track_search`, `rowid`, `title`, `artist`, `remixer`, `mix_name`, `album`, `label`, `genre`) VALUES ('delete', old.`seq`, old.`title`, old.`artist`, old.`remixer`, old.`mix_name`, old.`album`, old.`label`, old.`genre`);
END;
--> statement-breakpoint
CREATE TRIGGER `track_search_au` AFTER UPDATE OF `seq`, `title`, `artist`, `remixer`, `mix_name`, `album`, `label`, `genre` ON `tracks` BEGIN
	INSERT INTO `track_search`(`track_search`, `rowid`, `title`, `artist`, `remixer`, `mix_name`, `album`, `label`, `genre`) VALUES ('delete', old.`seq`, old.`title`, old.`artist`, old.`remixer`, old.`mix_name`, old.`album`, old.`label`, old.`genre`);
	INSERT INTO `track_search`(`rowid`, `title`, `artist`, `remixer`, `mix_name`, `album`, `label`, `genre`) VALUES (new.`seq`, new.`title`, new.`artist`, new.`remixer`, new.`mix_name`, new.`album`, new.`label`, new.`genre`);
END;
--> statement-breakpoint
INSERT INTO `track_search`(`track_search`) VALUES ('rebuild');
