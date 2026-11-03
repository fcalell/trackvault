import { createClient } from "@fcalell/plugin-api/client";
import { createApiQueryUtils } from "@fcalell/plugin-api/tanstack-query";
import type { AppRouter } from "../../.stack/server";
import { hub } from "./hub";

// The hub's router type (`stack generate` writes `.stack/server.ts` from the `server`
// option of `nativeUi()`): no hub code enters the bundle. After a hub route changes, run
// `pnpm --filter hub check-types` first (the phone depends on `hub` in the workspace, so
// `pnpm check` builds the hub before the phone).
export type { AppRouter };

/** The hub's address, or a refusal: no request leaves before the sign-in chose one. */
export function hubUrl(): string {
	const { url } = hub();
	if (!url) throw new Error("No hub address is set.");
	return url;
}

// Built once; the address and the device key are read on every request, so the hub the
// sign-in chose (or a new one) needs no new client.
export const client = createClient<AppRouter>({
	url: () => `${hubUrl()}/rpc`,
	headers: (): Record<string, string> => {
		const { key } = hub();
		return key ? { authorization: `Bearer ${key}` } : {};
	},
	credentials: "omit",
});

export const orpc = createApiQueryUtils(client);
