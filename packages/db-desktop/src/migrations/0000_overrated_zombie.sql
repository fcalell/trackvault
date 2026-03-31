CREATE TABLE `local_files` (
	`id` text PRIMARY KEY NOT NULL,
	`filepath` text NOT NULL,
	`filename` text NOT NULL,
	`indexedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_files_filepath_unique` ON `local_files` (`filepath`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'Default' NOT NULL,
	`libraryPath` text NOT NULL
);
