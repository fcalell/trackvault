import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { cancelJob, getJob, recentJobs } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

export const jobs = {
	list: procedure({ auth: true, reads: ["jobs"] })
		.input(
			z
				.object({ limit: z.number().int().min(1).max(500).default(100) })
				.default({ limit: 100 }),
		)
		.output(z.array(jobViewSchema))
		.query(({ input }) => recentJobs(input.limit)),

	get: procedure({ auth: true, reads: ["jobs"] })
		.input(z.object({ id: z.string() }))
		.output(jobViewSchema)
		.query(({ input }) => {
			const job = getJob(input.id);
			if (!job) throw new ApiError("NOT_FOUND");
			return job;
		}),

	cancel: procedure({ auth: true, writes: ["jobs"] })
		.input(z.object({ id: z.string() }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			const job = cancelJob(input.id);
			if (!job) throw new ApiError("NOT_FOUND");
			return job;
		}),
};
