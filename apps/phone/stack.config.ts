import { defineConfig } from "@fcalell/cli";
import { api } from "@fcalell/plugin-api";
import { expo } from "@fcalell/plugin-expo";
import { nativeUi } from "@fcalell/plugin-native-ui";

// The phone has no backend of its own: it is a client of the hub (`api({ server })`), whose
// router type `.stack/server.ts` exports and whose schema `stack generate` copies in. Run
// `stack generate` in the hub first.
export default defineConfig({
	app: {
		name: "trackvault",
		domain: process.env.TRACKVAULT_DOMAIN ?? "trackvault.localhost",
	},
	plugins: [
		api({ server: "../hub" }),
		expo({
			scheme: "trackvault",
			configPlugins: [
				{
					name: "expo-audio",
					options: { microphonePermission: false, recordAudioAndroid: false },
				},
			],
		}),
		nativeUi({ theme: { defaultMode: "dark" } }),
	],
});
