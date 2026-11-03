import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { count, eq, sql } from "@fcalell/plugin-db/orm";
import { tags as tagsTable, trackTags } from "../../schema/index.ts";
import { ensureBatch } from "../../server/lib/changes.ts";
import { db } from "../../server/lib/db.ts";
import { applyTagSets } from "../../server/lib/track-tags.ts";
import { bumpVersion, notifyChanged } from "../../server/services/library.ts";

const name = z.string().trim().min(1, "Enter a name").max(60);

export const tags = {
	list: procedure({ auth: true, reads: ["tags", "trackTags"] }).query(() =>
		db()
			.select({
				id: tagsTable.id,
				name: tagsTable.name,
				tracks: count(trackTags.trackId),
			})
			.from(tagsTable)
			.leftJoin(trackTags, eq(trackTags.tagId, tagsTable.id))
			.groupBy(tagsTable.id)
			.orderBy(sql`${tagsTable.name} collate nocase`)
			.all(),
	),

	create: procedure({ auth: true, writes: ["tags"] })
		.input(z.object({ name }))
		.mutation(({ input }) => {
			const row = db()
				.insert(tagsTable)
				.values({ name: input.name, createdAt: new Date() })
				.onConflictDoNothing()
				.returning()
				.get();
			if (!row)
				throw new ApiError("BAD_REQUEST", { message: "That tag exists" });
			return row;
		}),

	rename: procedure({ auth: true, writes: ["tags"] })
		.input(z.object({ id: z.number().int(), name }))
		.mutation(({ input }) => {
			try {
				db()
					.update(tagsTable)
					.set({ name: input.name })
					.where(eq(tagsTable.id, input.id))
					.run();
			} catch {
				throw new ApiError("BAD_REQUEST", { message: "That tag exists" });
			}
		}),

	remove: procedure({ auth: true, writes: ["tags", "trackTags"] })
		.input(z.object({ id: z.number().int() }))
		.mutation(({ input }) => {
			db().delete(tagsTable).where(eq(tagsTable.id, input.id)).run();
		}),

	// The tags of one track.
	forTrack: procedure({ auth: true, reads: ["tags", "trackTags"] })
		.input(z.object({ trackId: z.string() }))
		.query(({ input }) =>
			db()
				.select({ id: tagsTable.id, name: tagsTable.name })
				.from(trackTags)
				.innerJoin(tagsTable, eq(tagsTable.id, trackTags.tagId))
				.where(eq(trackTags.trackId, input.trackId))
				.orderBy(sql`${tagsTable.name} collate nocase`)
				.all(),
		),

	// Sets a track's tags to exactly these names (a new name makes the tag).
	assign: procedure({ auth: true, writes: ["tags", "trackTags", "tracks"] })
		.input(z.object({ trackId: z.string(), names: z.array(name) }))
		.mutation(({ input }) => {
			const database = db();
			let version = 0;
			database.transaction((tx) => {
				version = bumpVersion(tx);
				const now = new Date();
				const wanted: number[] = [];
				for (const each of new Set(input.names)) {
					tx.insert(tagsTable)
						.values({ name: each, createdAt: now })
						.onConflictDoNothing()
						.run();
					const row = tx
						.select()
						.from(tagsTable)
						.where(sql`${tagsTable.name} = ${each} collate nocase`)
						.get();
					if (row) wanted.push(row.id);
				}
				const have = tx
					.select({ tagId: trackTags.tagId })
					.from(trackTags)
					.where(eq(trackTags.trackId, input.trackId))
					.all()
					.map((row) => row.tagId);
				const info = {
					batchId: randomUUID(),
					origin: "ui" as const,
					label: "Edit tags",
				};
				const done = applyTagSets(
					tx,
					[input.trackId],
					wanted.filter((id) => !have.includes(id)),
					have.filter((id) => !wanted.includes(id)),
					info,
					now,
				);
				if (done.logged > 0) ensureBatch(tx, info, done.logged, now);
			});
			notifyChanged([input.trackId], version);
		}),
};
