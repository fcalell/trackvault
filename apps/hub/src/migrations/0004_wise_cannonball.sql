CREATE TABLE `artist_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias` text NOT NULL,
	`canonical` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_aliases_alias_idx` ON `artist_aliases` ("alias" collate nocase);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`origin` text NOT NULL,
	`label` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`undone_by` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `batches_at_idx` ON `batches` (`at`);--> statement-breakpoint
CREATE TABLE `dupe_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`reason` text NOT NULL,
	`confidence` real NOT NULL,
	`keeper_id` text NOT NULL,
	`keeper_reason` text NOT NULL,
	`size` integer NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dupe_groups_key_idx` ON `dupe_groups` (`key`);--> statement-breakpoint
CREATE INDEX `dupe_groups_state_idx` ON `dupe_groups` (`state`,`confidence`,`id`);--> statement-breakpoint
CREATE TABLE `dupe_members` (
	`group_id` integer NOT NULL,
	`track_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `track_id`),
	FOREIGN KEY (`group_id`) REFERENCES `dupe_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dupe_members_track_idx` ON `dupe_members` (`track_id`);--> statement-breakpoint
CREATE TABLE `fingerprints` (
	`track_id` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	`file_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `genre_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias` text NOT NULL,
	`genre_id` integer NOT NULL,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genre_aliases_alias_idx` ON `genre_aliases` ("alias" collate nocase);--> statement-breakpoint
CREATE INDEX `genre_aliases_genre_idx` ON `genre_aliases` (`genre_id`);--> statement-breakpoint
CREATE TABLE `genres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_name_idx` ON `genres` ("name" collate nocase);--> statement-breakpoint
CREATE TABLE `health_checks` (
	`track_id` text PRIMARY KEY NOT NULL,
	`file_hash` text,
	`integrity` text,
	`integrity_errors` text,
	`cutoff_hz` integer,
	`bitrate_verdict` text,
	`bitrate_note` text,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `label_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias` text NOT NULL,
	`canonical` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `label_aliases_alias_idx` ON `label_aliases` ("alias" collate nocase);--> statement-breakpoint
CREATE TABLE `previews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`pos` integer NOT NULL,
	`track_id` text NOT NULL,
	`label` text,
	`field` text NOT NULL,
	`before` text,
	`after` text
);
--> statement-breakpoint
CREATE INDEX `previews_job_idx` ON `previews` (`job_id`,`pos`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`builtin` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`definition` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rules_position_idx` ON `rules` (`position`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_idx` ON `tags` ("name" collate nocase);--> statement-breakpoint
CREATE TABLE `track_tags` (
	`track_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`track_id`, `tag_id`),
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `track_tags_tag_idx` ON `track_tags` (`tag_id`,`track_id`);--> statement-breakpoint
ALTER TABLE `files` ADD `original_path` text;--> statement-breakpoint
ALTER TABLE `files` ADD `quarantined_at` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `quarantine_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `organise_template` text DEFAULT '{genre|Unknown}/{artist|Unknown} - {title}' NOT NULL;--> statement-breakpoint
CREATE INDEX `changes_batch_seq_idx` ON `changes` (`batch_id`,`seq`);--> statement-breakpoint
CREATE INDEX `tracks_issue_corrupt_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 512) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_corrupt_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 512) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_fakeBitrate_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 1024) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_fakeBitrate_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 1024) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_quarantined_title_idx` ON `tracks` ("title" collate nocase,`id`) WHERE ("tracks"."issues" & 2048) != 0;--> statement-breakpoint
CREATE INDEX `tracks_issue_quarantined_added_idx` ON `tracks` (`added_at`,`id`) WHERE ("tracks"."issues" & 2048) != 0;