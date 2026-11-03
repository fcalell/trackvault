CREATE TABLE `changes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`field` text NOT NULL,
	`before` text,
	`after` text,
	`origin` text NOT NULL,
	`batch_id` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `changes_entity_idx` ON `changes` (`entity`,`entity_id`,`seq`);--> statement-breakpoint
CREATE INDEX `changes_batch_idx` ON `changes` (`batch_id`);--> statement-breakpoint
CREATE INDEX `changes_at_idx` ON `changes` (`at`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`track_id` text,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`mtime_ms` integer NOT NULL,
	`inode` integer NOT NULL,
	`file_hash` text,
	`state` text DEFAULT 'ok' NOT NULL,
	`error` text,
	`scanned_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_path_idx` ON `files` (`path`);--> statement-breakpoint
CREATE INDEX `files_track_idx` ON `files` (`track_id`);--> statement-breakpoint
CREATE INDEX `files_state_idx` ON `files` (`state`);--> statement-breakpoint
CREATE INDEX `files_hash_idx` ON `files` (`file_hash`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`message` text,
	`payload` text,
	`result` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_state_idx` ON `jobs` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_kind_idx` ON `jobs` (`kind`,`state`);--> statement-breakpoint
CREATE INDEX `jobs_created_idx` ON `jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`library_root` text,
	`low_bitrate_threshold` integer DEFAULT 256 NOT NULL,
	`library_version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "settings_single_row" CHECK("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
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
	`format` text DEFAULT 'mp3' NOT NULL,
	`bitrate` integer,
	`sample_rate` integer,
	`duration_ms` integer,
	`size` integer,
	`has_art` integer DEFAULT false NOT NULL,
	`issues` integer DEFAULT 0 NOT NULL,
	`block_key` text,
	`search_text` text,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_audio_hash_idx` ON `tracks` (`audio_hash`);--> statement-breakpoint
CREATE INDEX `tracks_title_idx` ON `tracks` ("title" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_artist_idx` ON `tracks` ("artist" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_album_idx` ON `tracks` ("album" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_label_idx` ON `tracks` ("label" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_idx` ON `tracks` ("genre" collate nocase,`id`);--> statement-breakpoint
CREATE INDEX `tracks_bpm_idx` ON `tracks` (`bpm`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_key_idx` ON `tracks` (`key`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_year_idx` ON `tracks` (`year`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_rating_idx` ON `tracks` (`rating`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_duration_idx` ON `tracks` (`duration_ms`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_bitrate_idx` ON `tracks` (`bitrate`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_format_idx` ON `tracks` (`format`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_issues_idx` ON `tracks` (`issues`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_added_idx` ON `tracks` (`added_at`,`id`);--> statement-breakpoint
CREATE INDEX `tracks_version_idx` ON `tracks` (`version`);--> statement-breakpoint
CREATE INDEX `tracks_block_key_idx` ON `tracks` (`block_key`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credential_id`);