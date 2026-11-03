import { z } from "@fcalell/plugin-api/schema";
import { defineChannel } from "@fcalell/plugin-node/ws";

export const jobViewSchema = z.object({
	id: z.string(),
	kind: z.string(),
	state: z.enum(["queued", "running", "done", "failed", "cancelled"]),
	done: z.number(),
	total: z.number(),
	message: z.string().nullable(),
	error: z.string().nullable(),
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
});
export type JobView = z.infer<typeof jobViewSchema>;

// Live job progress: the recent jobs on subscribe, then each job as it changes.
export const jobsChannel = defineChannel("jobs", {
	server: {
		snapshot: z.object({ jobs: z.array(jobViewSchema) }),
		upsert: jobViewSchema,
	},
	client: {},
});

// Library changes: after each committed batch, the ids of the tracks that changed
// and the library version they carry. `all` says the batch is too wide to list
// (a setting changed every track): refetch whatever is loaded.
export const libraryChannel = defineChannel("library", {
	server: {
		snapshot: z.object({ version: z.number() }),
		changed: z.object({
			ids: z.array(z.string()),
			version: z.number(),
			all: z.boolean(),
		}),
	},
	client: {},
});
