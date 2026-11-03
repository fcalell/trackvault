import { createClient } from "@fcalell/plugin-api/client";
import { createApiQueryUtils } from "@fcalell/plugin-api/tanstack-query";
// The hub's router type, type-only (the declaration the hub's `tsc -b` emits under
// `.stack/types`): no hub code enters the bundle, and the phone never type-checks
// the hub's sources. The agent imports it the same way. After a hub route changes,
// run `pnpm --filter hub check-types` first (the phone depends on `hub` in
// the workspace, so `pnpm check` builds the hub before the phone).
import type { AppRouter as HubRouter } from "../../../hub/.stack/types/.stack/worker.d.ts";
import { hub } from "./hub";

// The client is built once and aims at whatever hub the sign-in chose: the origin is
// swapped, and the device key stamped, on every request.
const BASE = "http://hub.invalid";

const hubFetch: typeof fetch = (input, init) => {
	const { url, key } = hub();
	if (!url) return Promise.reject(new Error("No hub address is set."));
	const source = input instanceof Request ? input : new Request(input, init);
	const path = source.url.slice(BASE.length);
	const request = new Request(`${url}${path}`, source);
	if (key) request.headers.set("authorization", `Bearer ${key}`);
	return fetch(request);
};

export const client = createClient<HubRouter>({
	url: `${BASE}/rpc`,
	fetch: hubFetch,
	credentials: "omit",
});

export const orpc = createApiQueryUtils(client);
