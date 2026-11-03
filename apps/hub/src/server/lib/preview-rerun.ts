import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import { jobs } from "../../schema/index.ts";
import type { JobView } from "../../shared/channels.ts";
import { cancelJob, enqueue } from "../services/jobs.ts";
import { db } from "./db.ts";
import type { JobDefinition } from "./job.ts";

// Plans again after a change to what the plan reads (a template, a rule): a preview
// still waiting or running is for the old input, so it is cancelled first.
export function rerunPreview<P extends { mode: "preview" | "apply" }>(
	definition: JobDefinition<P, unknown>,
	payload: P,
): JobView {
	const stale = db()
		.select({ id: jobs.id, payload: jobs.payload })
		.from(jobs)
		.where(
			and(
				eq(jobs.kind, definition.kind),
				inArray(jobs.state, ["queued", "running"]),
			),
		)
		.all();
	for (const job of stale)
		if ((job.payload as P | null)?.mode === "preview") cancelJob(job.id);
	return enqueue(definition, payload);
}
