import { procedure } from "virtual:stack-procedure";
import { z } from "@fcalell/plugin-api/schema";
import { asc, count, desc, eq } from "@fcalell/plugin-db/orm";
import { jobs, previews as previewsTable } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";
import { toView } from "../../server/services/jobs.ts";

const KINDS = ["rules", "unify", "organise"] as const;
const FIELDS = ["genre", "artist", "label"] as const;

export const previews = {
	// The latest job of a kind that stored a preview: its progress and its counts.
	// A unify preview is told apart by the fields it was run over.
	latest: procedure({ auth: true, reads: ["jobs", "previews"] })
		.input(
			z.object({
				kind: z.enum(KINDS),
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
			const row = rows.find((each) => {
				const payload = each.payload as {
					mode?: string;
					fields?: string[];
				} | null;
				return (
					payload?.mode === "preview" &&
					(input.fields === undefined ||
						JSON.stringify(payload.fields) === JSON.stringify(input.fields))
				);
			});
			return row
				? { job: toView(row), result: (row.result ?? null) as unknown }
				: null;
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
				.select()
				.from(previewsTable)
				.where(eq(previewsTable.jobId, input.jobId))
				.orderBy(asc(previewsTable.pos))
				.limit(input.limit)
				.offset(input.offset)
				.all()
				.map((row) => ({
					id: String(row.id),
					trackId: row.trackId,
					label: row.label ?? row.trackId,
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
