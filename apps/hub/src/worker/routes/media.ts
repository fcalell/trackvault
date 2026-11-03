import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { eq } from "@fcalell/plugin-db/orm";
import { tracks } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";
import { mintMediaToken } from "../../server/lib/media-token.ts";

export const media = {
	// A signed address for one track's media, for a player that cannot send headers (the
	// phone's native player). `url` is relative to the hub; it opens `/media/<id>`, its
	// `/art` and `/peaks` until `expiresAt` (epoch ms). Mint again when it runs out.
	url: procedure({ auth: true })
		.input(z.object({ id: z.string() }))
		.output(z.object({ url: z.string(), expiresAt: z.number() }))
		.mutation(({ input }) => {
			const row = db()
				.select({ id: tracks.id })
				.from(tracks)
				.where(eq(tracks.id, input.id))
				.get();
			if (!row) throw new ApiError("NOT_FOUND", { message: "No such track" });
			const { token, expiresAt } = mintMediaToken(row.id);
			return {
				url: `/media/${encodeURIComponent(row.id)}?t=${token}`,
				expiresAt,
			};
		}),
};
