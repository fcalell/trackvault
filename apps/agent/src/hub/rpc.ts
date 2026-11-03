import { createClient } from "@fcalell/plugin-api/client";

// The typed boundary to the hub's oRPC API (`/rpc`), authenticated by the device key. The
// agent talks `/sync` for everything it does today; this is where an `orpc.*` call goes
// when it needs one (a device key can do what its member can).
//
// The hub's `AppRouter` type is not wired yet. When the hub exposes it, replace
// `HubRouter` with
//     import type { AppRouter as HubRouter } from "../../../hub/.stack/worker";
// and nothing else in the agent changes.
export type HubRouter = Record<string, never>;

export function createHubApi(hubUrl: string, key: string) {
	return createClient<HubRouter>({
		url: `${hubUrl.replace(/\/+$/, "")}/rpc`,
		headers: { authorization: `Bearer ${key}` },
	});
}
