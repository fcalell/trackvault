-- stack:fts track_search 4c428904
CREATE VIRTUAL TABLE `track_search` USING fts5(`title`, `artist`, `remixer`, `mix_name`, `album`, `label`, `genre`, content=`tracks`, content_rowid=`seq`, prefix='2 3', tokenize='unicode61 remove_diacritics 2');
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
