import { procedure } from "virtual:stack-procedure";
import { z } from "@fcalell/plugin-api/schema";
import { asc, count, desc, eq } from "@fcalell/plugin-db/orm";
import { jobs, previews as previewsTable, tracks } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";
import { toView } from "../../server/services/jobs.ts";

const KINDS = ["rules", "unify", "organise"] as const;
const FIELDS = ["genre", "artist", "label"] as const;

export const previews = {
	// The latest job of a kind that stored a preview: its progress and its counts,
	// and the apply job queued after it, if any, which says whether the plan was carried out.
	latest: procedure({ auth: true, reads: ["jobs", "previews"] })
		.input(
			z.object({
				kind: z.enum(KINDS),
				// A unify preview is told apart by the fields it was run over.
				fields: z.array(z.enum(FIELDS)).optional(),
			}),
		)
		.query(({ input }) => {
			const rows = db()
				.select()
				.from(jobs)
				.where(eq(jobs.kind, input.kind))
				.orderBy(desc(jobs.createdAt))
				.limit(8)
				.all();
			const modeOf = (row: (typeof rows)[number]) =>
				(row.payload as { mode?: string } | null)?.mode;
			const ofFields = (row: (typeof rows)[number]) =>
				input.fields === undefined ||
				JSON.stringify((row.payload as { fields?: string[] }).fields) ===
					JSON.stringify(input.fields);
			const planned = rows.findIndex(
				(each) => modeOf(each) === "preview" && ofFields(each),
			);
			const row = rows[planned];
			if (!row) return null;
			const applying = rows
				.slice(0, planned)
				.find((each) => modeOf(each) === "apply" && ofFields(each));
			return {
				job: toView(row),
				result: (row.result ?? null) as unknown,
				apply: applying ? toView(applying) : null,
			};
		}),

	// The rows a preview job stored, in the order it found them, windowed.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["previews"],
	})
		.input(z.object({ jobId: z.string() }))
		.query(({ input }) => {
			const database = db();
			const data = database
				.select({
					row: previewsTable,
					title: tracks.title,
					mixName: tracks.mixName,
					artist: tracks.artist,
				})
				.from(previewsTable)
				.leftJoin(tracks, eq(tracks.id, previewsTable.trackId))
				.where(eq(previewsTable.jobId, input.jobId))
				.orderBy(asc(previewsTable.pos))
				.limit(input.limit)
				.offset(input.offset)
				.all()
				.map(({ row, title, mixName, artist }) => ({
					id: String(row.id),
					entity: "track",
					entityId: row.trackId,
					title,
					mixName,
					artist,
					field: row.field,
					before: row.before,
					after: row.after,
				}));
			const total =
				database
					.select({ n: count() })
					.from(previewsTable)
					.where(eq(previewsTable.jobId, input.jobId))
					.get()?.n ?? 0;
			return { data, total, offset: input.offset };
		}),
};
