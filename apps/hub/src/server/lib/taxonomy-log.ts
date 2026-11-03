import { randomUUID } from "node:crypto";
import { sql } from "@fcalell/plugin-db/orm";
import {
	artistAliases,
	changes,
	genreAliases,
	genres,
	labelAliases,
} from "../../schema/index.ts";
import { type BatchInfo, ensureBatch } from "./changes.ts";
import type { Tx } from "./db.ts";
import { inserter } from "./raw.ts";

export type AliasKind = "genre" | "artist" | "label";

// A spelling and the name it stands for, as the change log keeps it.
export interface AliasValue {
	alias: string;
	canonical: string;
}

const insertChange = inserter(changes);

// The log's entities for the taxonomy: an alias row (`entityId` is its kind) and a
// genre (`field` "genre", its name the value). A deletion is `after: null`.
export const ALIAS_ENTITY = "alias";
export const GENRE_ENTITY = "genre";

export function newBatch(label: string): BatchInfo {
	return { batchId: randomUUID(), origin: "ui", label };
}

// Logs what a deletion removed as one batch, so the history shows it and undoes it.
export function logRemoved(
	tx: Tx,
	info: BatchInfo,
	removed: { genre?: string; aliases: Array<[AliasKind, AliasValue]> },
	now: Date,
): void {
	let logged = 0;
	if (removed.genre !== undefined) {
		insertChange({
			entity: GENRE_ENTITY,
			entityId: removed.genre,
			field: "genre",
			before: removed.genre,
			after: null,
			origin: info.origin,
			batchId: info.batchId,
			at: now,
		});
		logged++;
	}
	for (const [kind, value] of removed.aliases) {
		insertChange({
			entity: ALIAS_ENTITY,
			entityId: kind,
			field: "alias",
			before: value,
			after: null,
			origin: info.origin,
			batchId: info.batchId,
			at: now,
		});
		logged++;
	}
	if (logged > 0) ensureBatch(tx, info, logged, now);
}

// Puts a deleted genre back by its name, with nothing else.
export function restoreGenre(tx: Tx, name: string, now: Date): boolean {
	return (
		tx
			.insert(genres)
			.values({ name, createdAt: now })
			.onConflictDoNothing()
			.run().changes > 0
	);
}

// Puts a deleted alias back; false when its spelling is mapped again since.
export function restoreAlias(
	tx: Tx,
	kind: AliasKind,
	value: AliasValue,
	now: Date,
): boolean {
	if (kind === "genre") {
		restoreGenre(tx, value.canonical, now);
		const genre = tx
			.select({ id: genres.id })
			.from(genres)
			.where(sql`${genres.name} = ${value.canonical} collate nocase`)
			.get();
		return (
			genre !== undefined &&
			tx
				.insert(genreAliases)
				.values({ alias: value.alias, genreId: genre.id })
				.onConflictDoNothing()
				.run().changes > 0
		);
	}
	return (
		tx
			.insert(kind === "artist" ? artistAliases : labelAliases)
			.values(value)
			.onConflictDoNothing()
			.run().changes > 0
	);
}
