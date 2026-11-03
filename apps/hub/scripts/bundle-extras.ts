// After `stack build`, beside `server.mjs`: the restore tools, so a box that holds only `dist/`
// can restore a backup. (The worker threads and the job kinds are bundled by `stack build` itself.)
// threads and the job kinds are bundled by `stack build` itself.)
// `node scripts/bundle-extras.ts` from apps/hub.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const out = new URL("dist/server/", root);
if (!existsSync(fileURLToPath(new URL("server.mjs", out))))
	throw new Error("dist/server/server.mjs is missing: run `stack build` first");

const EXTRAS = {
	restore: "scripts/restore.ts",
	"restore-offsite": "scripts/restore-offsite.ts",
};

for (const [name, entry] of Object.entries(EXTRAS)) {
	await build({
		entryPoints: [fileURLToPath(new URL(entry, root))],
		outfile: fileURLToPath(new URL(`${name}.mjs`, out)),
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node24",
		sourcemap: "linked",
		legalComments: "none",
		logLevel: "warning",
		absWorkingDir: fileURLToPath(root),
		// The native package the build kept beside the server.
		external: ["better-sqlite3"],
		banner: {
			js: [
				'import { createRequire as __stackRequire } from "node:module";',
				"const require = __stackRequire(import.meta.url);",
			].join("\n"),
		},
	});
	console.log(`bundled ${name}`);
}
