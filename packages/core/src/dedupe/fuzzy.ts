import { fold, normalizeTrack } from "../normalize/index.ts";
import { tokenSetSimilarity } from "../similarity/index.ts";
import type { DedupeTrack } from "./types.ts";
import { classifyMix, type MixClass } from "./versions.ts";

export interface FuzzyEdge {
	a: number;
	b: number;
	confidence: number;
}

export interface FuzzyVersionSet {
	members: number[];
	versions: Array<{ cls: MixClass; members: number[] }>;
}

export interface FuzzyOptions {
	// Title similarity for tracks in different strict blocks. Default 0.88.
	titleThreshold?: number;
	// Same version but durations further apart than max(this, 8 %) split. Default 8 s.
	durationSlackSec?: number;
	// Loose blocks larger than this are skipped (a prolific artist's catalogue). Default 400.
	maxBlock?: number;
}

interface Prepared {
	index: number;
	blockKey: string;
	artistsKey: string;
	title: string;
	cls: MixClass;
	durationMs: number;
	album: string;
	year: number;
}

function prepare(tracks: readonly DedupeTrack[]): Prepared[] {
	const out: Prepared[] = [];
	tracks.forEach((t, index) => {
		if (!t.title && !t.artist) return;
		const n = normalizeTrack({
			title: t.title ?? null,
			artist: t.artist ?? null,
		});
		const title = fold(n.titleBase);
		if (title === "") return;
		out.push({
			index,
			blockKey: n.blockKey,
			artistsKey: n.blockKey.slice(0, n.blockKey.length - title.length - 1),
			title,
			cls: classifyMix(n.mixName, n.remixer),
			durationMs: t.durationMs ?? 0,
			album: fold(t.album),
			year: t.year ?? 0,
		});
	});
	return out;
}

function confidenceOf(a: Prepared, b: Prepared, titleSim: number): number {
	let c = 0.7 + (titleSim - 0.88) * 0.5;
	if (titleSim >= 1) c = 0.72;
	if (a.album !== "" && a.album === b.album) c += 0.08;
	if (a.year !== 0 && a.year === b.year) c += 0.03;
	if (a.durationMs && b.durationMs) {
		const d = Math.abs(a.durationMs - b.durationMs);
		if (d <= 2000) c += 0.1;
		else if (d > 5000) c -= 0.08;
	}
	return Math.max(0.5, Math.min(0.95, c));
}

// Fuzzy tier: artist and title with the mix stripped decide who is compared.
// Inside a block, same-version tracks of similar length are duplicates;
// different versions are reported as versions of one song instead.
// Pass 1 blocks on the exact key (hash map, O(n)). Pass 2 catches typos by
// blocking on artist + each long title word, so comparisons stay inside
// small blocks.
export function fuzzyMatch(
	tracks: readonly DedupeTrack[],
	options: FuzzyOptions = {},
): { edges: FuzzyEdge[]; versionSets: FuzzyVersionSet[] } {
	const threshold = options.titleThreshold ?? 0.88;
	const slack = (options.durationSlackSec ?? 8) * 1000;
	const maxBlock = options.maxBlock ?? 400;
	const prepared = prepare(tracks);
	const edges: FuzzyEdge[] = [];
	const seenPairs = new Set<number>();
	const pairKey = (a: number, b: number) =>
		a < b ? a * 4_194_304 + b : b * 4_194_304 + a;
	const sameLength = (a: Prepared, b: Prepared) => {
		if (!a.durationMs || !b.durationMs) return true;
		return (
			Math.abs(a.durationMs - b.durationMs) <=
			Math.max(slack, 0.08 * Math.max(a.durationMs, b.durationMs))
		);
	};

	const strict = new Map<string, Prepared[]>();
	for (const p of prepared) {
		const list = strict.get(p.blockKey);
		if (list) list.push(p);
		else strict.set(p.blockKey, [p]);
	}

	const versionSets: FuzzyVersionSet[] = [];
	for (const block of strict.values()) {
		if (block.length < 2) continue;
		const byVersion = new Map<string, Prepared[]>();
		for (const p of block) {
			const list = byVersion.get(p.cls.key);
			if (list) list.push(p);
			else byVersion.set(p.cls.key, [p]);
		}
		for (const same of byVersion.values()) {
			if (same.length < 2) continue;
			const sorted = [...same].sort((x, y) => x.durationMs - y.durationMs);
			let cluster: Prepared[] = [sorted[0] as Prepared];
			const flush = () => {
				const head = cluster[0] as Prepared;
				for (let i = 1; i < cluster.length; i++) {
					const other = cluster[i] as Prepared;
					edges.push({
						a: head.index,
						b: other.index,
						confidence: confidenceOf(head, other, 1),
					});
					seenPairs.add(pairKey(head.index, other.index));
				}
			};
			for (let i = 1; i < sorted.length; i++) {
				const next = sorted[i] as Prepared;
				if (sameLength(cluster[cluster.length - 1] as Prepared, next))
					cluster.push(next);
				else {
					flush();
					cluster = [next];
				}
			}
			flush();
		}
		if (byVersion.size > 1) {
			versionSets.push({
				members: block.map((p) => p.index),
				versions: [...byVersion.values()].map((m) => ({
					cls: (m[0] as Prepared).cls,
					members: m.map((p) => p.index),
				})),
			});
		}
	}

	const loose = new Map<string, Prepared[]>();
	for (const p of prepared) {
		if (p.artistsKey === "") continue;
		const words = p.title
			.split(" ")
			.filter((w) => w.length >= 4)
			.sort((x, y) => y.length - x.length || (x < y ? -1 : 1))
			.slice(0, 2);
		// Prefix and suffix keys: one typo leaves at least one of them intact.
		for (const w of words) {
			for (const part of [`p${w.slice(0, 3)}`, `s${w.slice(-3)}`]) {
				const key = `${p.artistsKey}|${part}`;
				const list = loose.get(key);
				if (list) list.push(p);
				else loose.set(key, [p]);
			}
		}
	}
	for (const block of loose.values()) {
		if (block.length < 2 || block.length > maxBlock) continue;
		for (let i = 0; i < block.length; i++) {
			for (let j = i + 1; j < block.length; j++) {
				const a = block[i] as Prepared;
				const b = block[j] as Prepared;
				if (a.blockKey === b.blockKey) continue;
				if (a.artistsKey !== b.artistsKey || a.cls.key !== b.cls.key) continue;
				const k = pairKey(a.index, b.index);
				if (seenPairs.has(k)) continue;
				seenPairs.add(k);
				if (!sameLength(a, b)) continue;
				const sim = tokenSetSimilarity(a.title, b.title);
				if (sim < threshold) continue;
				edges.push({
					a: a.index,
					b: b.index,
					confidence: confidenceOf(a, b, sim),
				});
			}
		}
	}
	return { edges, versionSets };
}
