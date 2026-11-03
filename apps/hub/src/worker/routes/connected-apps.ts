import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { scopesOf } from "@fcalell/plugin-auth/schema/oauth";
import { and, desc, eq } from "@fcalell/plugin-db/orm";
import { oauthClient, oauthConsent } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";

// The MCP clients the owner has let in. A grant is the consent row; revoking it ends
// the client's access and refresh tokens.
export const connectedApps = {
	list: procedure({ auth: true, reads: ["oauthConsent", "oauthClient"] })
		.output(
			z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					uri: z.string().nullable(),
					scopes: z.array(z.string()),
					connectedAt: z.date().nullable(),
				}),
			),
		)
		.query(({ context }) =>
			db()
				.select({
					id: oauthConsent.id,
					clientId: oauthClient.clientId,
					name: oauthClient.name,
					uri: oauthClient.uri,
					scopes: oauthConsent.scopes,
					connectedAt: oauthConsent.createdAt,
				})
				.from(oauthConsent)
				.innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
				.where(eq(oauthConsent.userId, context.user.id))
				.orderBy(desc(oauthConsent.createdAt))
				.all()
				.map((row) => ({
					id: row.id,
					name: row.name ?? row.clientId,
					uri: row.uri,
					scopes: scopesOf(row.scopes),
					connectedAt: row.connectedAt,
				})),
		),

	revoke: procedure({ auth: true, writes: ["oauthConsent"] })
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input, context }) => {
			const own = db()
				.select({ id: oauthConsent.id })
				.from(oauthConsent)
				.where(
					and(
						eq(oauthConsent.id, input.id),
						eq(oauthConsent.userId, context.user.id),
					),
				)
				.get();
			if (!own || !(await context.oauth.revokeGrant(input.id)))
				throw new ApiError("NOT_FOUND");
		}),
};
