CREATE TABLE `offsite_objects` (
	`key` text PRIMARY KEY NOT NULL,
	`file_hash` text NOT NULL,
	`size` integer NOT NULL,
	`encrypted` integer NOT NULL,
	`uploaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offsite_uploads` (
	`key` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`part_size` integer NOT NULL,
	`size` integer NOT NULL,
	`version` text NOT NULL,
	`salt` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `settings` ADD `backup_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `backup_dir` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `backup_hour` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `backup_keep_daily` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `backup_keep_weekly` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `backup_keep_monthly` integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `backup_compression` text DEFAULT 'zstd' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_endpoint` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_bucket` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_region` text DEFAULT 'us-east-1' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_access_key` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_secret_key` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_prefix` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_virtual_hosted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_databases` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_library` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_prune` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_encrypt` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_key` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `offsite_bandwidth_kbps` integer DEFAULT 0 NOT NULL;