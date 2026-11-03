// Essentia against Rekordbox on real tracks (plan A2), one command:
//   DB_FILE=<hub database> node scripts/bench-yardstick.ts <yardstick.json> [--window 120] [--workers 4] [--limit N]
// The yardstick file comes from the agent on the Rekordbox machine
// (`trackvault-agent yardstick --out yardstick.json`) and holds Rekordbox's BPM and key for
// the tracks it matched to the library. Each matched track is decoded from the hub's file
// (the middle `--window` seconds, 0 = whole) and measured; nothing is written to the
// database and no file name is printed. Needs ffmpeg on PATH.
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { essentiaKey, essentiaTempo } from "@trackvault/core/analysis";
import { decodeMono } from "@trackvault/core/audio";
import { parseKey, toCamelot } from "@trackvault/core/harmonic";
import { safeJoin } from "@trackvault/core/paths";

interface Job {
	file: string;
	startSec: number;
	durationSec: number;
}
interface Measured {
	bpm: number | null;
	key: string | null;
}

if (!isMainThread) {
	parentPort?.on("message", async (job: Job) => {
		const pcm = await decodeMono(job.file, {
			sampleRate: 44_100,
			startSec: job.startSec,
			...(job.durationSec > 0 ? { durationSec: job.durationSec } : {}),
			timeoutMs: 180_000,
		});
		const out: Measured = { bpm: null, key: null };
		if (pcm.ok) {
			out.bpm = essentiaTempo(pcm.samples).value?.bpm ?? null;
			out.key = essentiaKey(pcm.samples).value?.camelot ?? null;
		}
		parentPort?.postMessage(out);
	});
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const input = args[0];
	if (!input) throw new Error("usage: bench-yardstick.ts <yardstick.json>");
	const num = (name: string, d: number): number => {
		const at = args.indexOf(`--${name}`);
		return at >= 0 ? Number(args[at + 1]) : d;
	};
	const windowSec = num("window", 120);
	const size = Math.max(1, num("workers", Math.min(4, cpus().length)));
	const limit = num("limit", Number.POSITIVE_INFINITY);

	const { createClient } = await import("@fcalell/plugin-db/sqlite");
	const schema = await import("../src/schema/index.ts");
	const file = process.env.DB_FILE;
	if (!file) throw new Error("DB_FILE is not set");
	const client = (
		createClient(file, schema) as unknown as {
			$client: {
				prepare: (sql: string) => {
					get(...p: unknown[]): unknown;
					all(...p: unknown[]): unknown[];
				};
			};
		}
	).$client;
	const root = (
		client.prepare("SELECT library_root AS r FROM settings LIMIT 1").get() as
			| { r: string | null }
			| undefined
	)?.r;
	if (!root) throw new Error("the library folder is not set in this database");

	const yardstick = JSON.parse(readFileSync(input, "utf8")) as {
		v: number;
		tracks: Array<{ trackId: string; bpm: number | null; key: string | null }>;
	};
	if (yardstick.v !== 1) throw new Error("unknown yardstick version");

	const lookup = client.prepare(
		`SELECT f.path AS path, t.duration_ms AS ms, t.genre AS genre
		 FROM files f JOIN tracks t ON t.id = f.track_id
		 WHERE f.track_id = ? AND f.state = 'ok' ORDER BY f.id LIMIT 1`,
	);
	const todo = yardstick.tracks.slice(0, limit).flatMap((t) => {
		const row = lookup.get(t.trackId) as
			| { path: string; ms: number | null; genre: string | null }
			| undefined;
		return row
			? [
					{
						rbBpm: t.bpm,
						rbKey: t.key,
						genre: row.genre,
						path: row.path,
						ms: row.ms,
					},
				]
			: [];
	});
	console.log(
		`${yardstick.tracks.length} tracks in the yardstick, ${todo.length} found in the library`,
	);

	const workers = Array.from(
		{ length: size },
		() => new Worker(new URL(import.meta.url)),
	);
	const results: Array<(typeof todo)[number] & Measured> = [];
	let next = 0;
	await Promise.all(
		workers.map(async (worker) => {
			while (next < todo.length) {
				const t = todo[next++] as (typeof todo)[number];
				const seconds = t.ms ? t.ms / 1000 : 0;
				const startSec =
					windowSec > 0 && seconds > windowSec ? (seconds - windowSec) / 2 : 0;
				const measured = await new Promise<Measured>((resolve) => {
					worker.once("message", resolve);
					worker.postMessage({
						file: safeJoin(root, t.path),
						startSec,
						durationSec: windowSec,
					} satisfies Job);
				});
				results.push({ ...t, ...measured });
				if (results.length % 25 === 0)
					console.log(`  ${results.length} / ${todo.length}`);
			}
		}),
	);
	await Promise.all(workers.map((w) => w.terminate()));
	report(results, windowSec);
}

const pct = (a: number, b: number): string =>
	b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}% (${a} of ${b})`;

// Camelot neighbours: the relative (same number, other letter) and one step round the wheel.
function neighbour(a: string, b: string): boolean {
	const x = parseKey(a);
	const y = parseKey(b);
	if (!x || !y) return false;
	const c = toCamelot(x);
	const d = toCamelot(y);
	if (c.number === d.number) return c.letter !== d.letter;
	const gap = Math.abs(c.number - d.number);
	return c.letter === d.letter && (gap === 1 || gap === 11);
}

function report(
	rows: Array<
		{
			rbBpm: number | null;
			rbKey: string | null;
			genre: string | null;
		} & Measured
	>,
	windowSec: number,
): void {
	let bpmN = 0;
	let bpmWithin = 0;
	let octave = 0;
	let keyN = 0;
	let keyExact = 0;
	let keyNear = 0;
	let unmeasured = 0;
	const genres = new Map<string, number>();
	for (const r of rows) {
		if (r.bpm === null && r.key === null) unmeasured++;
		genres.set(r.genre ?? "(none)", (genres.get(r.genre ?? "(none)") ?? 0) + 1);
		if (r.rbBpm !== null && r.bpm !== null) {
			bpmN++;
			const ratio = r.bpm / r.rbBpm;
			if (Math.abs(r.bpm - r.rbBpm) <= 0.5) bpmWithin++;
			else if (Math.abs(ratio - 2) < 0.03 || Math.abs(ratio - 0.5) < 0.015)
				octave++;
		}
		const a = parseKey(r.rbKey);
		const b = parseKey(r.key);
		if (a && b) {
			keyN++;
			const exact = toCamelot(a);
			const other = toCamelot(b);
			if (exact.number === other.number && exact.letter === other.letter)
				keyExact++;
			else if (neighbour(r.rbKey as string, r.key as string)) keyNear++;
		}
	}
	const bpmRate = bpmN - octave === 0 ? 0 : bpmWithin / (bpmN - octave);
	const keyRate = keyN === 0 ? 0 : keyExact / keyN;
	console.log(
		`\nwindow ${windowSec || "whole track"} s; ${rows.length} tracks, ${unmeasured} not measurable, ${genres.size} distinct genre tags`,
	);
	console.log(`BPM within 0.5      ${pct(bpmWithin, bpmN)}`);
	console.log(`BPM octave errors   ${pct(octave, bpmN)} (counted apart)`);
	console.log(
		`BPM within 0.5, octave errors excluded  ${pct(bpmWithin, bpmN - octave)}`,
	);
	console.log(`key exact           ${pct(keyExact, keyN)}`);
	console.log(`key Camelot neighbour (not exact)  ${pct(keyNear, keyN)}`);
	if (rows.length < 300)
		console.log(
			`\nonly ${rows.length} tracks: the plan asks for at least 300 across genres, so there is no verdict`,
		);
	else
		console.log(
			`\nplan bar: BPM >= 90% (octave excluded) ${bpmRate >= 0.9 ? "MET" : "MISSED"}; key exact >= 70% ${keyRate >= 0.7 ? "MET" : "MISSED"}`,
		);
}

if (isMainThread) await main();
