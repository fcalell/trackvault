import { procedure } from "virtual:stack-procedure";
import { z } from "@fcalell/plugin-api/schema";
import { attention as attentionCounts } from "../../server/lib/attention.ts";

const count = z.number();

// What waits for the owner, as counts: the sidebar's badges and the library's Banner
// read this one procedure.
export const attention = {
	counts: procedure({
		auth: true,
		reads: ["inboxItems", "proposals", "conflicts", "dupeGroups", "jobs"],
	})
		.output(
			z.object({
				inbox: count,
				review: count,
				conflicts: count,
				duplicates: count,
				failedJobs: count,
				backupFailed: z.boolean(),
			}),
		)
		.query(() => attentionCounts()),
};
