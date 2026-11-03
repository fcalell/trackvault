import { procedure } from "virtual:stack-procedure";
import { z } from "@fcalell/plugin-api/schema";
import { count, isNotNull } from "@fcalell/plugin-db/orm";
import { binaryAvailable } from "@trackvault/core/exec";
import { healthChecks } from "../../schema/index.ts";
import bitrate from "../../server/jobs/bitrate.ts";
import integrity from "../../server/jobs/integrity.ts";
import { db } from "../../server/lib/db.ts";
import { facetsOf } from "../../server/lib/library-query.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";
import { ISSUE_FILTERS } from "../../shared/library.ts";

export const health = {
	// The issues of the library with how many tracks carry each (zero included), and
	// what the checks that need a program can do on this hub.
	summary: procedure({ auth: true, reads: ["tracks", "healthChecks"] }).query(
		async () => {
			const database = db();
			const facets = facetsOf(database, readSettings().libraryVersion);
			const counts = new Map(
				facets.issues.map((each) => [each.value, each.count]),
			);
			return {
				total: facets.total,
				issues: ISSUE_FILTERS.map((value) => ({
					value,
					count: counts.get(value) ?? 0,
				})),
				checked: {
					integrity:
						database
							.select({ n: count() })
							.from(healthChecks)
							.where(isNotNull(healthChecks.integrity))
							.get()?.n ?? 0,
					bitrate:
						database
							.select({ n: count() })
							.from(healthChecks)
							.where(isNotNull(healthChecks.bitrateVerdict))
							.get()?.n ?? 0,
				},
				ffmpeg: await binaryAvailable("ffmpeg", "-version"),
			};
		},
	),

	// Queues the integrity (decode) and bitrate (spectrum) checks of what has not
	// been checked yet. Both degrade to a "needs ffmpeg" result without ffmpeg.
	run: procedure({ auth: true, writes: ["healthChecks", "tracks", "jobs"] })
		.input(z.object({ check: z.enum(["integrity", "bitrate"]) }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			input.check === "integrity"
				? enqueue(integrity, {}, { reuse: () => true })
				: enqueue(bitrate, {}, { reuse: () => true }),
		),
};
