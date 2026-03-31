CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`artist` text,
	`album` text,
	`genre` text,
	`year` integer,
	`comment` text,
	`bitrate` integer,
	`duration` real,
	`createdAt` integer,
	`updatedAt` integer
);
