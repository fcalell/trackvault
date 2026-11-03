// Times Essentia's tempo and key on real files, in a worker thread (as the hub runs it).
//   node scripts/bench-essentia.ts <folder> [--count 20] [--window 0|120|60] [--seed 1]
// --window 0 analyses the whole track. Prints per-track timings and a summary; file names
// are not printed. ffmpeg decodes at the 44.1 kHz mono Essentia wants.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
	isMainThread,
	parentPort,
	Worker,
	workerData,
} from "node:worker_threads";
import { essentiaKey, essentiaTempo } from "@trackvault/core/analysis";
import { decodeMono } from "@trackvault/core/audio";

if (!isMainThread) {
	parentPort?.on("message", (m: { id: number; samples: Float32Array }) => {
		const t0 = performance.now();
		const tempo = essentiaTempo(m.samples);
		const t1 = performance.now();
		const key = essentiaKey(m.samples);
		const t2 = performance.now();
		parentPort?.postMessage({
			id: m.id,
			bpm: tempo.value?.bpm ?? null,
			beats: tempo.value?.beats.length ?? 0,
			camelot: key.value?.camelot ?? null,
			tempoMs: t1 - t0,
			keyMs: t2 - t1,
			rssMb: process.memoryUsage().rss / 1048576,
			workerData,
		});
	});
} else {
	const args = process.argv.slice(2);
	const folder = args[0];
	if (!folder) throw new Error("folder missing");
	const opt = (name: string, d: number): number => {
		const i = args.indexOf(`--${name}`);
		return i >= 0 ? Number(args[i + 1]) : d;
	};
	const count = opt("count", 20);
	const windowSec = opt("window", 0);
	let seed = opt("seed", 1);
	const walk = (dir: string, out: string[]): string[] => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p, out);
			else if (/\.(mp3|flac|m4a|aiff?|wav)$/i.test(e.name)) out.push(p);
		}
		return out;
	};
	const all = walk(folder, []);
	const rand = (): number => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
	const files = all.sort(() => rand() - 0.5).slice(0, count);
	const worker = new Worker(new URL(import.meta.url));
	const rows: Array<{
		decodeMs: number;
		tempoMs: number;
		keyMs: number;
		rssMb: number;
		sec: number;
	}> = [];
	const answer = (id: number) =>
		new Promise<Record<string, number | string | null>>((resolve) => {
			const on = (m: { id: number }) => {
				if (m.id === id) {
					worker.off("message", on);
					resolve(m as never);
				}
			};
			worker.on("message", on);
		});
	let id = 0;
	for (const file of files) {
		const d0 = performance.now();
		const pcm = await decodeMono(file, {
			sampleRate: 44_100,
			...(windowSec > 0 ? { durationSec: windowSec } : {}),
			timeoutMs: 120_000,
		});
		if (!pcm.ok) continue;
		const decodeMs = performance.now() - d0;
		const sec = pcm.samples.length / 44_100;
		const p = answer(++id);
		worker.postMessage({ id, samples: pcm.samples });
		const r = (await p) as { tempoMs: number; keyMs: number; rssMb: number };
		rows.push({
			decodeMs,
			tempoMs: r.tempoMs,
			keyMs: r.keyMs,
			rssMb: r.rssMb,
			sec,
		});
	}
	await worker.terminate();
	const avg = (f: (r: (typeof rows)[number]) => number): number =>
		rows.reduce((s, r) => s + f(r), 0) / Math.max(1, rows.length);
	const max = (f: (r: (typeof rows)[number]) => number): number =>
		Math.max(...rows.map(f));
	console.log(
		`tracks ${rows.length}, window ${windowSec || "whole"}s, audio avg ${avg((r) => r.sec).toFixed(0)} s`,
	);
	console.log(
		`decode  avg ${avg((r) => r.decodeMs).toFixed(0)} ms, max ${max((r) => r.decodeMs).toFixed(0)}`,
	);
	console.log(
		`tempo   avg ${avg((r) => r.tempoMs).toFixed(0)} ms, max ${max((r) => r.tempoMs).toFixed(0)}`,
	);
	console.log(
		`key     avg ${avg((r) => r.keyMs).toFixed(0)} ms, max ${max((r) => r.keyMs).toFixed(0)}`,
	);
	console.log(
		`total   avg ${avg((r) => r.decodeMs + r.tempoMs + r.keyMs).toFixed(0)} ms per track; worker rss max ${max((r) => r.rssMb).toFixed(0)} MB; main rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`,
	);
}
