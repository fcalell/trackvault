import { procedure } from "virtual:stack-procedure";
import { selectionWhere } from "@fcalell/plugin-api/lib/selection";
import { selector, z } from "@fcalell/plugin-api/schema";
import { and, count, desc, eq, inArray, sql } from "@fcalell/plugin-db/orm";
import { batches, files, tracks } from "../../schema/index.ts";
import purge from "../../server/jobs/purge.ts";
import restore from "../../server/jobs/restore.ts";
import { db } from "../../server/lib/db.ts";
import { QUARANTINE_DIR } from "../../server/lib/quarantine.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const held = eq(files.state, "quarantined");
const pick = selector(z.object({}));
const chosen = z.object({ files: pick });

// The quarantined files a choice names.
const chosenWhere = (input: z.infer<typeof chosen>) =>
	and(
		held,
		selectionWhere(input.files, {
			id: files.id,
			where: () => undefined,
		}),
	);

// The batch that moved a file in: `.quarantine/<batch>/<path>`.
const batchOf = (path: string): string | null =>
	path.startsWith(`${QUARANTINE_DIR}/`)
		? (path.slice(QUARANTINE_DIR.length + 1).split("/")[0] ?? null)
		: null;

const idsOf = (input: z.infer<typeof chosen>): number[] =>
	db()
		.select({ id: files.id })
		.from(files)
		.where(chosenWhere(input))
		.all()
		.map((row) => row.id);

export const quarantine = {
	// The files in the quarantine, newest first, windowed, with the days they have
	// left before the purge, the batch that moved them and what that batch was.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["files", "batches"],
	})
		.input(z.object({}))
		.query(({ input }) => {
			const database = db();
			const days = readSettings().quarantineDays;
			const rows = database
				.select({
					id: files.id,
					path: files.path,
					size: files.size,
					originalPath: files.originalPath,
					at: files.quarantinedAt,
					title: tracks.title,
					artist: tracks.artist,
				})
				.from(files)
				.leftJoin(tracks, eq(tracks.id, files.trackId))
				.where(held)
				.orderBy(desc(files.quarantinedAt), desc(files.id))
				.limit(input.limit)
				.offset(input.offset)
				.all();
			const batchIds = [
				...new Set(rows.flatMap((row) => batchOf(row.path) ?? [])),
			];
			const reasons = new Map(
				batchIds.length
					? database
							.select({ id: batches.id, label: batches.label })
							.from(batches)
							.where(inArray(batches.id, batchIds))
							.all()
							.map((row) => [row.id, row.label])
					: [],
			);
			const data = rows.map((row) => {
				const batchId = batchOf(row.path);
				return {
					id: String(row.id),
					title: row.title,
					artist: row.artist,
					originalPath: row.originalPath ?? row.path,
					size: row.size,
					batchId: batchId && reasons.has(batchId) ? batchId : null,
					reason: batchId ? (reasons.get(batchId) ?? null) : null,
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
				};
			});
			const total =
				database.select({ n: count() }).from(files).where(held).get()?.n ?? 0;
			return { data, total, offset: input.offset };
		}),

	// How many files a choice names and how much disk they hold: what a purge confirm says.
	size: procedure({ auth: true, reads: ["files"] })
		.input(chosen)
		.query(({ input }) => {
			const row = db()
				.select({
					files: count(),
					bytes: sql<number>`coalesce(sum(${files.size}), 0)`,
				})
				.from(files)
				.where(chosenWhere(input))
				.get();
			return { files: row?.files ?? 0, bytes: row?.bytes ?? 0 };
		}),

	restore: procedure({ auth: true, writes: ["files", "tracks", "jobs"] })
		.input(chosen)
		.output(jobViewSchema)
		.mutation(({ input }) => enqueue(restore, { fileIds: idsOf(input) })),

	// Deletes for good the files named.
	purge: procedure({ auth: true, writes: ["files", "tracks", "jobs"] })
		.input(chosen)
		.output(jobViewSchema)
		.mutation(({ input }) => enqueue(purge, { fileIds: idsOf(input) })),
};
