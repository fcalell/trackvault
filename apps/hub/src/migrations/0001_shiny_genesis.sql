DROP INDEX `tracks_album_idx`;--> statement-breakpoint
DROP INDEX `tracks_label_idx`;--> statement-breakpoint
DROP INDEX `tracks_year_idx`;--> statement-breakpoint
ALTER TABLE `tracks` ADD `seq` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_seq_idx` ON `tracks` (`seq`);--> statement-breakpoint
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
CREATE INDEX `tracks_issue_noArt_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 64) != 0;