import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { count, desc, eq, sql } from "@fcalell/plugin-db/orm";
import { fold } from "@trackvault/core/normalize";
import { resolveName } from "@trackvault/core/taxonomy";
import {
	artistAliases,
	genreAliases,
	genres as genresTable,
	labelAliases,
	tracks,
} from "../../schema/index.ts";
import unify from "../../server/jobs/unify.ts";
import { db } from "../../server/lib/db.ts";
import { loadTaxonomies } from "../../server/lib/taxonomy.ts";
import { logRemoved, newBatch } from "../../server/lib/taxonomy-log.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const FIELDS = ["genre", "artist", "label"] as const;
const kind = z.enum(["artist", "label"]);
const name = z.string().trim().min(1, "Enter a name").max(120);

// A value as the library has it, with how many tracks carry it.
async function distinct(field: (typeof FIELDS)[number]) {
	const column = tracks[field];
	return db()
		.select({ value: sql<string>`min(${column})`, count: count() })
		.from(tracks)
		.where(sql`${column} IS NOT NULL AND ${column} != ''`)
		.groupBy(sql`${column} collate nocase`)
		.orderBy(desc(count()))
		.all();
}

// How many tracks carry each value of a field, by the lower-cased value.
function usage(field: (typeof FIELDS)[number]): Map<string, number> {
	const column = tracks[field];
	return new Map(
		db()
			.select({ value: sql<string>`lower(${column})`, n: count() })
			.from(tracks)
			.where(sql`${column} IS NOT NULL AND ${column} != ''`)
			.groupBy(sql`${column} collate nocase`)
			.all()
			.map((row) => [row.value, row.n]),
	);
}

export const genres = {
	// The taxonomy with each genre's aliases and how many tracks carry it.
	list: procedure({
		auth: true,
		reads: ["genres", "genreAliases", "tracks"],
	}).query(() => {
		const database = db();
		const used = usage("genre");
		const aliases = new Map<
			number,
			Array<{ id: number; alias: string; tracks: number }>
		>();
		for (const row of database.select().from(genreAliases).all())
			aliases.set(row.genreId, [
				...(aliases.get(row.genreId) ?? []),
				{
					id: row.id,
					alias: row.alias,
					tracks: used.get(row.alias.toLowerCase()) ?? 0,
				},
			]);
		return database
			.select()
			.from(genresTable)
			.orderBy(sql`${genresTable.name} collate nocase`)
			.all()
			.map((row) => ({
				id: row.id,
				name: row.name,
				aliases: aliases.get(row.id) ?? [],
				tracks: used.get(row.name.toLowerCase()) ?? 0,
			}));
	}),

	// Genre values in the library that the taxonomy does not know, most used first,
	// each with the closest known names.
	unknown: procedure({
		auth: true,
		reads: ["genres", "genreAliases", "tracks"],
	}).query(async () => {
		const taxonomy = loadTaxonomies().genre;
		const out: Array<{ value: string; count: number; suggestions: string[] }> =
			[];
		for (const row of await distinct("genre")) {
			const resolved = resolveName(row.value, taxonomy, { fuzzy: false });
			if (resolved.name !== null) continue;
			out.push({
				value: row.value,
				count: row.count,
				suggestions: resolved.suggestions.map((each) => each.name),
			});
			if (out.length >= 200) break;
		}
		return out;
	}),

	create: procedure({ auth: true, writes: ["genres"] })
		.input(z.object({ name }))
		.mutation(({ input }) => {
			const row = db()
				.insert(genresTable)
				.values({ name: input.name, createdAt: new Date() })
				.onConflictDoNothing()
				.returning()
				.get();
			if (!row)
				throw new ApiError("BAD_REQUEST", { message: "That genre exists" });
			return row;
		}),

	// Deletes a genre and its aliases; the history holds what went, to undo.
	remove: procedure({
		auth: true,
		writes: ["genres", "genreAliases", "changes", "batches"],
	})
		.input(z.object({ id: z.number().int() }))
		.mutation(({ input }) => {
			db().transaction((tx) => {
				const genre = tx
					.select()
					.from(genresTable)
					.where(eq(genresTable.id, input.id))
					.get();
				if (!genre) return;
				const aliases = tx
					.select()
					.from(genreAliases)
					.where(eq(genreAliases.genreId, genre.id))
					.all();
				logRemoved(
					tx,
					newBatch(`Delete genre ${genre.name}`),
					{
						genre: genre.name,
						aliases: aliases.map((row) => [
							"genre",
							{ alias: row.alias, canonical: genre.name },
						]),
					},
					new Date(),
				);
				tx.delete(genresTable).where(eq(genresTable.id, genre.id)).run();
			});
		}),

	addAlias: procedure({ auth: true, writes: ["genreAliases"] })
		.input(z.object({ genreId: z.number().int(), alias: name }))
		.mutation(({ input }) => {
			const row = db()
				.insert(genreAliases)
				.values(input)
				.onConflictDoNothing()
				.returning()
				.get();
			if (!row)
				throw new ApiError("BAD_REQUEST", {
					message: "That spelling is mapped",
				});
			return row;
		}),

	removeAlias: procedure({
		auth: true,
		writes: ["genreAliases", "changes", "batches"],
	})
		.input(z.object({ id: z.number().int() }))
		.mutation(({ input }) => {
			db().transaction((tx) => {
				const row = tx
					.select({ alias: genreAliases.alias, canonical: genresTable.name })
					.from(genreAliases)
					.innerJoin(genresTable, eq(genresTable.id, genreAliases.genreId))
					.where(eq(genreAliases.id, input.id))
					.get();
				if (!row) return;
				logRemoved(
					tx,
					newBatch(`Remove the alias ${row.alias}`),
					{ aliases: [["genre", row]] },
					new Date(),
				);
				tx.delete(genreAliases).where(eq(genreAliases.id, input.id)).run();
			});
		}),

	// Maps one value to a genre (made when it is new).
	mapOne: procedure({ auth: true, writes: ["genres", "genreAliases"] })
		.input(z.object({ value: name, genre: name }))
		.mutation(({ input }) =>
			db().transaction((tx) => {
				tx.insert(genresTable)
					.values({ name: input.genre, createdAt: new Date() })
					.onConflictDoNothing()
					.run();
				const genre = tx
					.select()
					.from(genresTable)
					.where(sql`${genresTable.name} = ${input.genre} collate nocase`)
					.get();
				if (!genre) throw new ApiError("NOT_FOUND");
				if (genre.name.toLowerCase() === input.value.toLowerCase()) return;
				tx.insert(genreAliases)
					.values({ alias: input.value, genreId: genre.id })
					.onConflictDoUpdate({
						target: sql`${genreAliases.alias} collate nocase`,
						set: { genreId: genre.id },
					})
					.run();
			}),
		),

	// Maps values to genres in one call: each becomes an alias of the genre (made
	// when it is new). The next Unify applies them to the tracks.
	map: procedure({ auth: true, writes: ["genres", "genreAliases"] })
		.input(
			z.object({
				items: z
					.array(z.object({ value: name, genre: name }))
					.min(1)
					.max(500),
			}),
		)
		.mutation(({ input }) =>
			db().transaction((tx) => {
				let mapped = 0;
				for (const item of input.items) {
					const now = new Date();
					tx.insert(genresTable)
						.values({ name: item.genre, createdAt: now })
						.onConflictDoNothing()
						.run();
					const genre = tx
						.select()
						.from(genresTable)
						.where(sql`${genresTable.name} = ${item.genre} collate nocase`)
						.get();
					if (!genre) continue;
					if (genre.name.toLowerCase() === item.value.toLowerCase()) continue;
					tx.insert(genreAliases)
						.values({ alias: item.value, genreId: genre.id })
						.onConflictDoUpdate({
							target: sql`${genreAliases.alias} collate nocase`,
							set: { genreId: genre.id },
						})
						.run();
					mapped++;
				}
				return { mapped };
			}),
		),
};

const tableOf = (k: "artist" | "label") =>
	k === "artist" ? artistAliases : labelAliases;

export const aliases = {
	list: procedure({ auth: true, reads: ["artistAliases", "labelAliases"] })
		.input(z.object({ kind }))
		.query(({ input }) => {
			const table = tableOf(input.kind);
			const used = usage(input.kind);
			return db()
				.select()
				.from(table)
				.orderBy(sql`${table.canonical} collate nocase`, table.alias)
				.all()
				.map((row) => ({
					...row,
					tracks: used.get(row.alias.toLowerCase()) ?? 0,
				}));
		}),

	// Spellings of one artist or label that differ only by case, spacing or
	// punctuation, grouped, the most used spelling first: what to map together.
	suggest: procedure({
		auth: true,
		reads: ["tracks", "artistAliases", "labelAliases"],
	})
		.input(z.object({ kind }))
		.query(async ({ input }) => {
			const known = loadTaxonomies()[input.kind];
			const groups = new Map<string, Array<{ value: string; count: number }>>();
			for (const row of await distinct(input.kind)) {
				const key = fold(row.value);
				if (key === "") continue;
				groups.set(key, [...(groups.get(key) ?? []), row]);
			}
			const out: Array<{
				canonical: string;
				variants: Array<{ value: string; count: number }>;
			}> = [];
			for (const variants of groups.values()) {
				if (variants.length < 2) continue;
				const rest = variants.filter(
					(each) =>
						resolveName(each.value, known, { fuzzy: false }).name === null,
				);
				if (rest.length === 0) continue;
				out.push({
					canonical: (variants[0] as { value: string }).value,
					variants: variants.slice(1),
				});
				if (out.length >= 200) break;
			}
			return out;
		}),

	map: procedure({ auth: true, writes: ["artistAliases", "labelAliases"] })
		.input(
			z.object({
				kind,
				items: z
					.array(z.object({ alias: name, canonical: name }))
					.min(1)
					.max(500),
			}),
		)
		.mutation(({ input }) => {
			const table = tableOf(input.kind);
			return db().transaction((tx) => {
				for (const item of input.items)
					tx.insert(table)
						.values(item)
						.onConflictDoUpdate({
							target: sql`${table.alias} collate nocase`,
							set: { canonical: item.canonical },
						})
						.run();
				return { mapped: input.items.length };
			});
		}),

	add: procedure({ auth: true, writes: ["artistAliases", "labelAliases"] })
		.input(z.object({ kind, alias: name, canonical: name }))
		.mutation(({ input }) => {
			const table = tableOf(input.kind);
			const row = db()
				.insert(table)
				.values({ alias: input.alias, canonical: input.canonical })
				.onConflictDoNothing()
				.returning()
				.get();
			if (!row)
				throw new ApiError("BAD_REQUEST", {
					message: "That spelling is mapped",
				});
			return row;
		}),

	remove: procedure({
		auth: true,
		writes: ["artistAliases", "labelAliases", "changes", "batches"],
	})
		.input(z.object({ kind, id: z.number().int() }))
		.mutation(({ input }) => {
			const table = tableOf(input.kind);
			db().transaction((tx) => {
				const row = tx.select().from(table).where(eq(table.id, input.id)).get();
				if (!row) return;
				logRemoved(
					tx,
					newBatch(`Remove the alias ${row.alias}`),
					{
						aliases: [
							[input.kind, { alias: row.alias, canonical: row.canonical }],
						],
					},
					new Date(),
				);
				tx.delete(table).where(eq(table.id, input.id)).run();
			});
		}),
};

export const unifyTags = {
	// Library-wide unify of the chosen fields: `preview` stores what would change,
	// `apply` does it. Both are jobs.
	preview: procedure({ auth: true, writes: ["previews", "jobs"] })
		.input(z.object({ fields: z.array(z.enum(FIELDS)).min(1) }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(unify, { mode: "preview", fields: input.fields }),
		),
	apply: procedure({ auth: true, writes: ["tracks", "jobs"] })
		.input(z.object({ fields: z.array(z.enum(FIELDS)).min(1) }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(unify, { mode: "apply", fields: input.fields }),
		),
};
