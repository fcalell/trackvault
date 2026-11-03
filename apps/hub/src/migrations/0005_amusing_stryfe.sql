CREATE TABLE `analysis_blobs` (
	`hash` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`device_id` text NOT NULL,
	`kind` text NOT NULL,
	`size` integer NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analysis_blobs_track_idx` ON `analysis_blobs` (`track_id`);--> statement-breakpoint
CREATE TABLE `conflicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`entity` text NOT NULL,
	`ref_id` text NOT NULL,
	`field` text,
	`base_value` text,
	`device_value` text,
	`hub_value` text,
	`winner` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`resolution` text,
	`pushed` integer DEFAULT true NOT NULL,
	`batch_id` text,
	`at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `conflicts_state_idx` ON `conflicts` (`state`,`id`);--> statement-breakpoint
CREATE INDEX `conflicts_device_idx` ON `conflicts` (`device_id`,`pushed`,`id`);--> statement-breakpoint
CREATE INDEX `conflicts_ref_idx` ON `conflicts` (`entity`,`ref_id`);--> statement-breakpoint
CREATE TABLE `cue_sets` (
	`track_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`at` integer NOT NULL,
	`signature` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cues` (
	`track_id` text NOT NULL,
	`idx` integer NOT NULL,
	`kind` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer,
	`color` integer,
	`color_table_index` integer,
	`comment` text,
	`active_loop` integer DEFAULT false NOT NULL,
	`beat_loop_size` integer,
	PRIMARY KEY(`track_id`, `idx`),
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `device_files` (
	`device_id` text NOT NULL,
	`track_id` text NOT NULL,
	`state` text NOT NULL,
	`file_hash` text,
	`error` text,
	`at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `track_id`)
);
--> statement-breakpoint
CREATE INDEX `device_files_state_idx` ON `device_files` (`device_id`,`state`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`hostname` text,
	`local_root` text,
	`agent_version` text,
	`modes` text,
	`free_disk_bytes` integer,
	`total_disk_bytes` integer,
	`rekordbox` text,
	`status` text,
	`activity` text,
	`base_id` text,
	`base_version` integer DEFAULT 0 NOT NULL,
	`manifest_cursor` text,
	`export_cursor` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `devices_seen_idx` ON `devices` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `import_parts` (
	`batch_id` text NOT NULL,
	`part` integer NOT NULL,
	`device_id` text NOT NULL,
	`parts` integer NOT NULL,
	`result` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`batch_id`, `part`)
);
--> statement-breakpoint
CREATE INDEX `import_parts_at_idx` ON `import_parts` (`at`);--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` real NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`playlist_id`, `track_id`),
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playlist_tracks_order_idx` ON `playlist_tracks` (`playlist_id`,`position`,`track_id`);--> statement-breakpoint
CREATE INDEX `playlist_tracks_track_idx` ON `playlist_tracks` (`track_id`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`position` real NOT NULL,
	`rule` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `playlists_parent_idx` ON `playlists` (`parent_id`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `plays` (
	`track_id` text NOT NULL,
	`device_id` text NOT NULL,
	`played_at` integer NOT NULL,
	PRIMARY KEY(`track_id`, `device_id`, `played_at`)
);
--> statement-breakpoint
CREATE INDEX `plays_time_idx` ON `plays` (`played_at`);--> statement-breakpoint
CREATE TABLE `rekordbox_links` (
	`device_id` text NOT NULL,
	`kind` text NOT NULL,
	`rb_id` text NOT NULL,
	`ref_id` text NOT NULL,
	`via` text,
	`state` text DEFAULT 'linked' NOT NULL,
	`stamp` text,
	PRIMARY KEY(`device_id`, `kind`, `rb_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rekordbox_links_ref_idx` ON `rekordbox_links` (`device_id`,`kind`,`ref_id`);--> statement-breakpoint
CREATE TABLE `track_analysis` (
	`track_id` text NOT NULL,
	`kind` text NOT NULL,
	`device_id` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`track_id`, `kind`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE `track_tombstones` (
	`track_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `track_tombstones_version_idx` ON `track_tombstones` (`version`,`track_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`audio_hash` text NOT NULL,
	`file_hash` text NOT NULL,
	`size` integer NOT NULL,
	`name` text NOT NULL,
	`source_rel_path` text,
	`mtime_ms` integer NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'receiving' NOT NULL,
	`landed_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_device_hash_idx` ON `uploads` (`device_id`,`file_hash`);--> statement-breakpoint
CREATE INDEX `uploads_state_idx` ON `uploads` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text DEFAULT 'default' NOT NULL,
	`name` text,
	`start` text,
	`reference_id` text NOT NULL,
	`prefix` text,
	`key` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer DEFAULT 0,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`reference_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `apikey_configId_idx` ON `apikey` (`config_id`);--> statement-breakpoint
CREATE INDEX `apikey_referenceId_idx` ON `apikey` (`reference_id`);--> statement-breakpoint
CREATE INDEX `apikey_key_idx` ON `apikey` (`key`);--> statement-breakpoint
DROP INDEX `tracks_version_idx`;--> statement-breakpoint
ALTER TABLE `tracks` ADD `play_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `last_played_at` integer;--> statement-breakpoint
CREATE INDEX `tracks_version_idx` ON `tracks` (`version`,`id`);