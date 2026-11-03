import { defineConfig } from "@fcalell/cli";
import { expo } from "@fcalell/plugin-expo";
import { nativeUi } from "@fcalell/plugin-native-ui";

// The phone has no backend of its own: it is a client of the hub (`server`), whose router
// type `.stack/server.ts` exports and whose schema `stack generate` copies in. Run
// `stack generate` in the hub first.
export default defineConfig({
	app: {
		name: "trackvault",
		domain: process.env.TRACKVAULT_DOMAIN ?? "trackvault.localhost",
	},
	plugins: [
		expo({ scheme: "trackvault" }),
		nativeUi({ theme: { defaultMode: "dark" }, server: "../hub" }),
	],
});
