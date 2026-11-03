import { procedure } from "virtual:stack-procedure";
import { requestScan } from "../../server/services/scanner.ts";
import { jobViewSchema } from "../../shared/channels.ts";

export const scan = {
	// Queues a scan of the whole library (or returns the one already waiting).
	start: procedure({ auth: true, writes: ["jobs"] })
		.output(jobViewSchema)
		.mutation(() => requestScan()),
};
