// Times the R1 jobs over the seeded library (`pnpm seed:bench` first):
//   DB_FILE=./data/trackvault.sqlite node scripts/bench-jobs.ts
// The files do not exist on disk, so the file side of a job reports "no file" for
// each track; what is measured is the database side and the previews. It changes the
// seeded tracks (an edit, rules, an undo): run it on a bench database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "@fcalell/plugin-db/orm";
import { rules, settings } from "../src/schema/index.ts";
import bitrate from "../src/server/jobs/bitrate.ts";
import dedupe from "../src/server/jobs/dedupe.ts";
import edit from "../src/server/jobs/edit.ts";
import organise from "../src/server/jobs/organise.ts";
import rulesJob from "../src/server/jobs/rules.ts";
import undo from "../src/server/jobs/undo.ts";
import unify from "../src/server/jobs/unify.ts";
import { db } from "../src/server/lib/db.ts";
import type { JobDefinition } from "../src/server/lib/job.ts";
import { ensureRules } from "../src/server/lib/rules.ts";
import { ensureGenres } from "../src/server/lib/taxonomy.ts";

const database = db();
const root = mkdtempSync(join(tmpdir(), "tv-bench-"));
database
	.update(settings)
	.set({ libraryRoot: root })
	.where(eq(settings.id, 1))
	.run();
ensureGenres();
ensureRules();
for (const id of ["builtin.whitespace", "builtin.junk", "builtin.title-case"])
	database.update(rules).set({ enabled: true }).where(eq(rules.id, id)).run();

async function time<P, R>(
	name: string,
	job: JobDefinition<P, R>,
	payload: P,
): Promise<string> {
	const id = `bench-${job.kind}-${Date.now()}`;
	const started = performance.now();
	const result = await job.run({
		id,
		payload,
		signal: new AbortController().signal,
		progress() {},
	});
	const took = Math.round(performance.now() - started);
	console.log(
		`${name.padEnd(34)} ${String(took).padStart(7)} ms  ${JSON.stringify(result).slice(0, 150)}`,
	);
	return id;
}

const all = { query: {}, except: [] as string[] };
await time("rules preview (3 rules, 50k)", rulesJob, { mode: "preview" });
await time("unify preview (genre)", unify, {
	mode: "preview",
	fields: ["genre"],
});
await time("organise preview (50k)", organise, {
	mode: "preview",
	template: "{genre|Unknown}/{artist|Unknown} - {title}",
});
await time("dedupe (exact + fuzzy)", dedupe, {});
await time("bitrate (no ffmpeg path?)", bitrate, { trackIds: [] });
const edited = await time("edit: set label on all 50k", edit, {
	tracks: all,
	patch: { label: "Bench Records" },
	addTags: [],
	removeTags: [],
});
await time("rules apply (3 rules, 50k)", rulesJob, { mode: "apply" });
await time("undo the edit (50k)", undo, { batchId: edited });
