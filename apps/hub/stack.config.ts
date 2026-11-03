import { defineConfig } from "@fcalell/cli";
import { api } from "@fcalell/plugin-api";
import { auth } from "@fcalell/plugin-auth";
import { db } from "@fcalell/plugin-db";
import { node } from "@fcalell/plugin-node";
import { react } from "@fcalell/plugin-react";
import { reactUi } from "@fcalell/plugin-react-ui";
import { screens } from "@fcalell/plugin-screens";
import { vite } from "@fcalell/plugin-vite";

export default defineConfig({
	app: {
		name: "trackvault",
		// The hub's stable HTTPS name (a tailnet name in production, e.g.
		// trackvault.<tailnet>.ts.net): passkeys bind to it. Set TRACKVAULT_DOMAIN
		// where `stack build` or `stack generate` runs; dev works on localhost.
		domain: process.env.TRACKVAULT_DOMAIN ?? "trackvault.localhost",
	},
	plugins: [
		node(),
		db({ dialect: "sqlite", path: "./data/trackvault.sqlite" }),
		auth({
			cookies: { prefix: "trackvault" },
			// Only the owner's first account may sign up; any later one needs an invitation.
			signUp: "first",
			// One owner. Passkeys after the first sign-in, email codes to get in.
			passkey: {},
			// One personal organization: the MCP server of a later phase needs one.
			organization: true,
		}),
		api(),
		vite(),
		react({ title: "TrackVault", icon: "/mark.svg" }),
		reactUi({ theme: { defaultMode: "dark" } }),
		screens(),
	],
});
