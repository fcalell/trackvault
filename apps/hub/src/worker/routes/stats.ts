import { procedure } from "virtual:stack-procedure";
import { z } from "@fcalell/plugin-api/schema";
import {
	addedPerMonth,
	bpmHistogram,
	formats,
	freshness,
	genres,
	keyWheel,
	played,
	totals,
} from "../../server/lib/stats.ts";

const count = z.number();
const played_ = z.object({
	id: z.string(),
	title: z.string().nullable(),
	mixName: z.string().nullable(),
	artist: z.string().nullable(),
	playCount: count,
	lastPlayedAt: z.number().nullable(),
});

// The Stats place: one cheap aggregate per panel, cached by library version.
export const stats = {
	totals: procedure({ auth: true, reads: ["tracks"] })
		.output(
			z.object({
				tracks: count,
				durationMs: count,
				size: count,
				artists: count,
				neverPlayed: count,
			}),
		)
		.query(() => totals()),
	formats: procedure({ auth: true, reads: ["tracks"] })
		.output(z.array(z.object({ format: z.string(), codec: z.string(), count })))
		.query(() => formats()),
	genres: procedure({ auth: true, reads: ["tracks"] })
		.output(
			z.object({
				top: z.array(z.object({ genre: z.string(), count })),
				untagged: count,
			}),
		)
		.query(() => genres()),
	bpm: procedure({ auth: true, reads: ["tracks"] })
		.output(z.array(z.object({ bin: count, count })))
		.query(() => bpmHistogram()),
	keys: procedure({ auth: true, reads: ["tracks"] })
		.output(z.array(z.object({ key: z.string(), count })))
		.query(() => keyWheel()),
	added: procedure({ auth: true, reads: ["tracks"] })
		.output(z.array(z.object({ month: z.string(), count })))
		.query(() => addedPerMonth()),
	played: procedure({ auth: true, reads: ["tracks"] })
		.output(z.object({ most: z.array(played_), least: z.array(played_) }))
		.query(() => played()),
	freshness: procedure({ auth: true, reads: ["tracks"] })
		.output(z.array(z.object({ bucket: z.string(), count })))
		.query(() => freshness()),
};
