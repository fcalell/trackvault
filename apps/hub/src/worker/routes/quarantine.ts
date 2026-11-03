import { procedure } from "virtual:stack-procedure";
import { z } from "@fcalell/plugin-api/schema";
import { count, desc, eq } from "@fcalell/plugin-db/orm";
import { files, tracks } from "../../schema/index.ts";
import purge from "../../server/jobs/purge.ts";
import restore from "../../server/jobs/restore.ts";
import { db } from "../../server/lib/db.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

export const quarantine = {
	// The files in the quarantine, newest first, windowed, with the days they have
	// left before the purge.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["files"],
	})
		.input(z.object({}))
		.query(({ input }) => {
			const database = db();
			const days = readSettings().quarantineDays;
			const where = eq(files.state, "quarantined");
			const data = database
				.select({
					id: files.id,
					path: files.path,
					originalPath: files.originalPath,
					at: files.quarantinedAt,
					title: tracks.title,
					artist: tracks.artist,
				})
				.from(files)
				.leftJoin(tracks, eq(tracks.id, files.trackId))
				.where(where)
				.orderBy(desc(files.quarantinedAt), desc(files.id))
				.limit(input.limit)
				.offset(input.offset)
				.all()
				.map((row) => ({
					id: String(row.id),
					label:
						[row.artist, row.title].filter(Boolean).join(" - ") ||
						(row.originalPath ?? row.path),
					originalPath: row.originalPath ?? row.path,
					at: row.at ?? new Date(0),
					daysLeft:
						days > 0 && row.at
							? Math.max(
									0,
									Math.ceil(
										days - (Date.now() - row.at.getTime()) / (24 * 3600 * 1000),
									),
								)
							: null,
				}));
			const total =
				database.select({ n: count() }).from(files).where(where).get()?.n ?? 0;
			return { data, total, offset: input.offset };
		}),

	restore: procedure({ auth: true, writes: ["files", "tracks", "jobs"] })
		.input(z.object({ fileIds: z.array(z.number().int()).min(1) }))
		.output(jobViewSchema)
		.mutation(({ input }) => enqueue(restore, { fileIds: input.fileIds })),

	restoreAll: procedure({ auth: true, writes: ["files", "tracks", "jobs"] })
		.output(jobViewSchema)
		.mutation(() =>
			enqueue(restore, {
				fileIds: db()
					.select({ id: files.id })
					.from(files)
					.where(eq(files.state, "quarantined"))
					.all()
					.map((row) => row.id),
			}),
		),

	// Deletes for good: the files named, or every one in the quarantine.
	purge: procedure({ auth: true, writes: ["files", "tracks", "jobs"] })
		.input(z.object({ fileIds: z.array(z.number().int()).optional() }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(purge, input.fileIds ? { fileIds: input.fileIds } : {}),
		),
};
