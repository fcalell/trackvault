import { sql } from "@fcalell/plugin-db/orm";
import {
	buildTaxonomy,
	SEED_GENRES,
	type Taxonomy,
	type TaxonomyEntry,
} from "@trackvault/core/taxonomy";
import {
	artistAliases,
	genreAliases,
	genres,
	labelAliases,
} from "../../schema/index.ts";
import { db } from "./db.ts";

export type AliasField = "genre" | "artist" | "label";

// The genres a library starts with: core's seed taxonomy, once. The owner's own
// additions and aliases are kept (the seed never runs over a table with rows).
export function ensureGenres(): void {
	const database = db();
	const any = database.select({ id: genres.id }).from(genres).limit(1).get();
	if (any) return;
	database.transaction((tx) => {
		const now = new Date();
		for (const entry of SEED_GENRES) {
			const row = tx
				.insert(genres)
				.values({ name: entry.name, createdAt: now })
				.onConflictDoNothing()
				.returning({ id: genres.id })
				.get();
			if (!row) continue;
			for (const alias of entry.aliases ?? [])
				tx.insert(genreAliases)
					.values({ alias, genreId: row.id })
					.onConflictDoNothing()
					.run();
		}
	});
}

function entriesOf(
	rows: Array<{ name: string; alias: string | null }>,
): TaxonomyEntry[] {
	const map = new Map<string, string[]>();
	for (const row of rows) {
		const list = map.get(row.name) ?? [];
		if (row.alias) list.push(row.alias);
		map.set(row.name, list);
	}
	return [...map].map(([name, aliases]) => ({ name, aliases }));
}

export interface Taxonomies {
	genre: Taxonomy;
	artist: Taxonomy;
	label: Taxonomy;
}

// The three taxonomies as the database holds them now.
export function loadTaxonomies(): Taxonomies {
	const database = db();
	const genreRows = database
		.select({ name: genres.name, alias: genreAliases.alias })
		.from(genres)
		.leftJoin(genreAliases, sql`${genreAliases.genreId} = ${genres.id}`)
		.all();
	const canonicalOf = (
		table: typeof artistAliases | typeof labelAliases,
	): TaxonomyEntry[] =>
		entriesOf(
			database
				.select({ name: table.canonical, alias: table.alias })
				.from(table)
				.all(),
		);
	return {
		genre: buildTaxonomy(entriesOf(genreRows)),
		artist: buildTaxonomy(canonicalOf(artistAliases)),
		label: buildTaxonomy(canonicalOf(labelAliases)),
	};
}
