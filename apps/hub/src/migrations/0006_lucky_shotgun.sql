CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`filename` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`artist` text,
	`title` text,
	`format` text,
	`bitrate` integer,
	`state` text DEFAULT 'requested' NOT NULL,
	`raw_state` text,
	`slskd_id` text,
	`bytes` integer DEFAULT 0 NOT NULL,
	`speed` real DEFAULT 0 NOT NULL,
	`score` real,
	`needs_cutoff_check` integer DEFAULT false NOT NULL,
	`want_id` integer,
	`inbox_item_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `downloads_file_idx` ON `downloads` (`username`,`filename`);--> statement-breakpoint
CREATE INDEX `downloads_state_idx` ON `downloads` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` text NOT NULL,
	`pos` integer NOT NULL,
	`artist` text NOT NULL,
	`title` text NOT NULL,
	`mix` text,
	`duration_sec` real,
	`isrc` text,
	`label` text,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`status` text NOT NULL,
	`track_ids` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`resolution` text,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `import_items_import_idx` ON `import_items` (`import_id`,`status`,`pos`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`ref` text NOT NULL,
	`state` text DEFAULT 'parsing' NOT NULL,
	`input` text,
	`warnings` text NOT NULL,
	`error` text,
	`playlist_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `imports_created_idx` ON `imports` (`created_at`);--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`steps` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`mtime_ms` integer DEFAULT 0 NOT NULL,
	`audio_hash` text,
	`file_hash` text,
	`format` text,
	`codec` text,
	`bitrate` integer,
	`sample_rate` integer,
	`bit_depth` integer,
	`duration_ms` integer,
	`has_art` integer DEFAULT false NOT NULL,
	`corrupt` integer DEFAULT false NOT NULL,
	`tags` text,
	`proposed` text,
	`fingerprint` blob,
	`decision` text,
	`decision_kind` text,
	`matches` text,
	`override` text,
	`target` text,
	`needs_cutoff_check` integer DEFAULT false NOT NULL,
	`cutoff` text,
	`want_id` integer,
	`download_id` text,
	`track_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_items_path_idx` ON `inbox_items` (`path`);--> statement-breakpoint
CREATE INDEX `inbox_items_state_idx` ON `inbox_items` (`state`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `inbox_items_hash_idx` ON `inbox_items` (`audio_hash`);--> statement-breakpoint
CREATE TABLE `search_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`search_id` text NOT NULL,
	`pos` integer NOT NULL,
	`username` text NOT NULL,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`format` text NOT NULL,
	`bitrate` integer,
	`sample_rate` integer,
	`bit_depth` integer,
	`length_sec` real,
	`queue_length` integer DEFAULT 0 NOT NULL,
	`free_slot` integer DEFAULT false NOT NULL,
	`artist` text,
	`title` text,
	`mix` text,
	`score` real NOT NULL,
	`rejected` integer DEFAULT false NOT NULL,
	`reasons` text NOT NULL,
	`needs_cutoff_check` integer DEFAULT false NOT NULL,
	`have` text DEFAULT 'none' NOT NULL,
	`have_track_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `search_results_search_idx` ON `search_results` (`search_id`,`pos`);--> statement-breakpoint
CREATE INDEX `search_results_created_idx` ON `search_results` (`created_at`);--> statement-breakpoint
CREATE TABLE `wishlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`artist` text NOT NULL,
	`title` text NOT NULL,
	`mix` text,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`status` text DEFAULT 'wanted' NOT NULL,
	`duration_sec` real,
	`isrc` text,
	`label` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`next_search_at` integer,
	`better_than_track_id` text,
	`min_format_score` real,
	`best_score` real,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_key_idx` ON `wishlist` (`key`);--> statement-breakpoint
CREATE INDEX `wishlist_status_idx` ON `wishlist` (`status`,`next_search_at`,`id`);--> statement-breakpoint
CREATE INDEX `wishlist_created_idx` ON `wishlist` (`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `settings` ADD `slskd_url` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `slskd_api_key` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `slskd_downloads_dir` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_client_id` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `spotify_client_secret` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `inbox_auto_approve` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `inbox_auto_replace` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `inbox_auto_reject_duplicates` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `inbox_bitrate_margin_kbps` integer DEFAULT 64 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `inbox_fuzzy_percent` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `inbox_acoustic_percent` integer DEFAULT 85 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `wishlist_auto_download` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `wishlist_min_score` integer DEFAULT 75 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `wanted_quality` text DEFAULT 'good' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `slskd_max_queue` integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `codec` text;--> statement-breakpoint
ALTER TABLE `tracks` ADD `bit_depth` integer;