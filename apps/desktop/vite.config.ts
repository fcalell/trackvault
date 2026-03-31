import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
	plugins: [
		electron({
			main: {
				entry: "src/main/index.ts",
				vite: {
					build: {
						rollupOptions: {
							external: [
								"electron",
								"better-sqlite3",
								"music-metadata",
								"node-id3",
							],
						},
					},
				},
			},
			preload: {
				input: "src/preload/preload.ts",
				vite: {
					build: {
						rollupOptions: {
							external: ["electron"],
						},
					},
				},
			},
			renderer: {},
		}),
		tanstackRouter({
			target: "solid",
			autoCodeSplitting: true,
			routesDirectory: "./src/renderer/routes",
			generatedRouteTree: "./src/renderer/routeTree.gen.ts",
		}),
		tailwindcss(),
		solidPlugin(),
	],
});
