// Times the R4 read paths on the seeded database (each panel's budget is 50 ms):
//   DB_FILE=... node scripts/bench-r4.ts [--augment]
// `--augment` gives the synthetic tracks energy, loudness and plays first (the seed
// leaves them empty); run it on a scratch copy.
import { createClient } from "@fcalell/plugin-db/sqlite";
import * as schema from "../src/schema/index.ts";
import { listPage } from "../src/server/lib/library-query.ts";
import { mixTracks, suggestAfter } from "../src/server/lib/sets.ts";
import * as stats from "../src/server/lib/stats.ts";

const database = createClient(
	process.env.DB_FILE ?? "./data/trackvault.sqlite",
	schema,
);
const client = (
	database as unknown as {
		$client: {
			exec(sql: string): void;
			prepare(sql: string): { all(): unknown[] };
		};
	}
).$client;

if (process.argv.includes("--augment")) {
	client.exec(`UPDATE tracks SET energy = 1 + abs(random()) % 10, loudness = -14 + (abs(random()) % 800) / 100.0,
		play_count = CASE WHEN abs(random()) % 10 < 3 THEN 1 + abs(random()) % 40 ELSE 0 END;
		UPDATE tracks SET last_played_at = CASE WHEN play_count > 0 THEN strftime('%s','now')*1000 - (abs(random()) % 700) * 86400000 ELSE NULL END;`);
}
client.exec("ANALYZE");

const time = async (
	name: string,
	run: () => unknown,
	runs = 5,
): Promise<void> => {
	await run();
	const t = performance.now();
	for (let i = 0; i < runs; i++) await run();
	console.log(
		`${name.padEnd(34)} ${((performance.now() - t) / runs).toFixed(1)} ms`,
	);
};

// Panels are cached by version in the app; here every call is a cold one.
const cold =
	<T>(run: () => T) =>
	() => {
		client.exec("UPDATE settings SET library_version = library_version + 1");
		return run();
	};
await time("stats totals (cold)", cold(stats.totals));
await time("stats formats (cold)", cold(stats.formats));
await time("stats genres (cold)", cold(stats.genres));
await time("stats bpm histogram (cold)", cold(stats.bpmHistogram));
await time("stats key wheel (cold)", cold(stats.keyWheel));
await time("stats added per month (cold)", cold(stats.addedPerMonth));
await time("stats played (cold)", cold(stats.played));
await time("stats freshness (cold)", cold(stats.freshness));
await time("stats totals (cached)", stats.totals);

const first = client
	.prepare(
		"SELECT id FROM tracks WHERE key IS NOT NULL AND bpm IS NOT NULL LIMIT 1",
	)
	.all() as Array<{ id: string }>;
const [current] = mixTracks(first.map((row) => row.id));
if (current) {
	await time("suggestions after one track", () =>
		suggestAfter(current, [current.id]),
	);
	console.log(
		`  from ${current.bpm} BPM ${current.key}: ${suggestAfter(current, [current.id]).length} suggestions`,
	);
}
const version = 1;
for (const sort of ["energy", "loudness"] as const)
	await time(`library window sorted by ${sort}`, () =>
		listPage(
			database,
			{ sort: { column: sort, direction: "desc" }, offset: 20000, limit: 200 },
			version,
		),
	);
await time("library window energy = 7", () =>
	listPage(database, { energy: 7, limit: 200 }, version),
);
await time("library window never played", () =>
	listPage(database, { neverPlayed: true, limit: 200 }, version),
);
