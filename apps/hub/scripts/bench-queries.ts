// Times the library's window query (page + total) across filters x sorts x offsets:
//   DB_FILE=... node scripts/bench-queries.ts [--plan] [--only <text>] [--sql <file.sql>]
// `--sql` runs the statements of a file first (candidate indexes, on a scratch copy of
// the database). It reads the database the seed made (`pnpm seed:bench`).
import { readFileSync } from "node:fs";
import { createClient } from "@fcalell/plugin-db/sqlite";
import * as schema from "../src/schema/index.ts";
import {
	type LibraryQuery,
	listPage,
} from "../src/server/lib/library-query.ts";
import type { SortColumn } from "../src/shared/library.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const at = args.indexOf(name);
	return at >= 0 ? (args[at + 1] ?? "") : undefined;
};
const file = process.env.DB_FILE ?? "./data/trackvault.sqlite";
const database = createClient(file, schema);

interface Client {
	exec(sql: string): void;
	prepare: (sql: string) => { all(...p: unknown[]): unknown[] };
}
const client = (database as unknown as { $client: Client }).$client;

const extra = flag("--sql");
if (extra !== undefined) client.exec(readFileSync(extra, "utf8"));
client.exec("ANALYZE");

// Records the statements a call runs, to explain them after.
const seen: Array<{ sql: string; params: unknown[] }> = [];
const prepare = client.prepare.bind(client);
let recording = false;
client.prepare = (sql: string) => {
	const statement = prepare(sql);
	const all = statement.all.bind(statement);
	statement.all = (...params: unknown[]) => {
		if (recording) seen.push({ sql, params });
		return all(...params);
	};
	return statement;
};

const FILTERS: Array<[string, LibraryQuery]> = [
	["none", {}],
	["genre", { genre: "House" }],
	["genre rare", { genre: "Ambient" }],
	["artist", { artist: "Kalomi" }],
	["key", { key: "8A" }],
	["genre+key", { genre: "House", key: "8A" }],
	["genre+artist", { genre: "House", artist: "Kalomi" }],
	["bpm 124-128", { bpmMin: 124, bpmMax: 128 }],
	["genre+bpm", { genre: "House", bpmMin: 124, bpmMax: 128 }],
	["format mp3", { format: "mp3" }],
	["issue noKey", { issue: "noKey" }],
	["issue lowBitrate", { issue: "lowBitrate" }],
	["search 'mid'", { q: "mid" }],
	["search 'midnight echo'", { q: "midnight echo" }],
	["search 'ka' + genre", { q: "ka", genre: "House" }],
];
const SORTS: Array<[string, SortColumn | undefined]> = [
	["default", undefined],
	["title", "title"],
	["artist", "artist"],
	["genre", "genre"],
	["bpm", "bpm"],
	["key", "key"],
	["rating", "rating"],
	["time", "durationMs"],
	["bitrate", "bitrate"],
	["added", "addedAt"],
];

const only = flag("--only");
const plan = args.includes("--plan");
const version = 1;
const median = (values: number[]): number =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;

const rows: Array<{ label: string; ms: number[] }> = [];
for (const [filterName, filter] of FILTERS) {
	for (const [sortName, column] of SORTS) {
		for (const direction of ["asc", "desc"] as const) {
			if (!column && direction === "desc") continue;
			const label = `${filterName} | ${sortName}${column ? ` ${direction}` : ""}`;
			if (only && !label.includes(only)) continue;
			const times: number[] = [];
			for (const where of ["0", "mid", "deep"]) {
				const total = listPage(
					database,
					{ ...filter, limit: 1 },
					version,
				).total;
				const offset =
					where === "0"
						? 0
						: where === "mid"
							? Math.floor(total / 2)
							: Math.max(0, total - 200);
				const input = {
					...filter,
					sort: column ? { column, direction } : undefined,
					offset,
					limit: 200,
				};
				listPage(database, input, version);
				const runs: number[] = [];
				for (let i = 0; i < 5; i++) {
					// The unfiltered total and the facets are cached by version, as in the hub.
					const t = performance.now();
					listPage(database, input, version);
					runs.push(performance.now() - t);
				}
				times.push(median(runs));
				if (plan && where === "deep") {
					seen.length = 0;
					recording = true;
					listPage(database, input, version);
					recording = false;
					const query = seen.find((s) => /limit/i.test(s.sql));
					if (query) {
						const lines = client
							.prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
							.all(...query.params) as Array<{ detail: string }>;
						console.log(
							`  ${label}: ${lines.map((l) => l.detail).join(" ; ")}`,
						);
					}
				}
			}
			rows.push({ label, ms: times });
		}
	}
}
const slow = rows.filter((r) => Math.max(...r.ms) > 10);
for (const r of rows) {
	const worst = Math.max(...r.ms);
	console.log(
		`${worst > 10 ? "SLOW " : "     "}${r.label.padEnd(44)} first ${r.ms[0]?.toFixed(1).padStart(5)}  mid ${r.ms[1]?.toFixed(1).padStart(5)}  deep ${r.ms[2]?.toFixed(1).padStart(5)} ms`,
	);
}
console.log(`\n${rows.length} cases, ${slow.length} over 10 ms`);
