import { procedure } from "virtual:stack-procedure";
import { z } from "@fcalell/plugin-api/schema";
import { inArray } from "@fcalell/plugin-db/orm";
import { tracks } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";
import { mintMediaToken } from "../../server/lib/media-token.ts";

export const media = {
	// Signed access to tracks' media, for a player that cannot send headers: the phone's
	// artwork (the dock's cover and the lock screen's) is fetched without any. A token
	// opens `/media/<id>?t=<token>` and its `/art` and `/peaks` for that one track until
	// `expiresAt` (epoch ms); mint again when it runs out. Many at once, since a queue
	// signs a page of rows. A track that does not exist gets none.
	urls: procedure({ auth: true })
		.input(z.object({ ids: z.array(z.string()).min(1).max(200) }))
		.output(
			z.object({
				tokens: z.record(z.string(), z.string()),
				expiresAt: z.number(),
			}),
		)
		.mutation(({ input }) => {
			const rows = db()
				.select({ id: tracks.id })
				.from(tracks)
				.where(inArray(tracks.id, input.ids))
				.all();
			const tokens: Record<string, string> = {};
			let expiresAt = 0;
			for (const row of rows) {
				const minted = mintMediaToken(row.id);
				tokens[row.id] = minted.token;
				expiresAt = minted.expiresAt;
			}
			return { tokens, expiresAt };
		}),
};
