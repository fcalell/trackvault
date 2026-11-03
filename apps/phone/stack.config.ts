import { defineConfig } from "@fcalell/cli";
import { api } from "@fcalell/plugin-api";
import { auth } from "@fcalell/plugin-auth";
import { db } from "@fcalell/plugin-db";
import { expo } from "@fcalell/plugin-expo";
import { nativeUi } from "@fcalell/plugin-native-ui";
import { node } from "@fcalell/plugin-node";

// The phone has no backend of its own: it is a client of the hub, whose router type
// `src/lib/api.ts` imports. The plugins below are what nativeUi() requires (expo, api,
// auth) and what those need to generate (db, a server target); the generated worker is
// never run or deployed. See .project_management/revamp-plan.md §10 (gaps found in R5).
export default defineConfig({
	app: {
		name: "trackvault",
		domain: process.env.TRACKVAULT_DOMAIN ?? "trackvault.localhost",
	},
	plugins: [
		expo({ scheme: "trackvault" }),
		node(),
		db({ dialect: "sqlite", path: "./data/phone.sqlite" }),
		auth({ cookies: { prefix: "trackvault" }, organization: false }),
		api(),
		nativeUi({ theme: { defaultMode: "dark" } }),
	],
});
