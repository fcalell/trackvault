import { createClient } from "@fcalell/plugin-api/client";
import type { AppRouter as HubRouter } from "../../../hub/.stack/types/.stack/worker.d.ts";

// The typed boundary to the hub's oRPC API (`/rpc`), authenticated by the device key. The
// agent talks `/sync` for everything it does today; this is where an `orpc.*` call goes
// when it needs one (a device key can do what its member can).
//
// The hub's `AppRouter` is a type-only import across the workspace: the agent carries no
// hub runtime (nothing of stack's server or the hub's code is loaded; Node strips the
// `import type`). It is the declaration the hub's `tsc -b` emits (`.stack/types`), so the
// agent never type-checks the hub's sources: run `pnpm --filter hub check-types` after a
// route changes.
export function createHubApi(hubUrl: string, key: string) {
	return createClient<HubRouter>({
		url: `${hubUrl.replace(/\/+$/, "")}/rpc`,
		headers: { authorization: `Bearer ${key}` },
	});
}
