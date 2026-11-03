import {
	type AcousticItem,
	type AcousticOptions,
	findAcousticPairs,
} from "./acoustic.ts";
import { type FuzzyOptions, fuzzyMatch } from "./fuzzy.ts";
import type {
	DedupeResult,
	DedupeTrack,
	DuplicateGroup,
	DuplicateReason,
	TrackId,
	VersionGroup,
} from "./types.ts";

export interface DedupeOptions {
	exact?: boolean;
	acoustic?: boolean | AcousticOptions;
	fuzzy?: boolean | FuzzyOptions;
	// A group never grows past this by acoustic or fuzzy links. Default 50.
	maxGroupSize?: number;
}

interface Edge {
	a: number;
	b: number;
	reason: DuplicateReason;
	confidence: number;
}

const ORDER: Record<DuplicateReason, number> = {
	exact: 0,
	acoustic: 1,
	fuzzy: 2,
};

// Finds duplicates in three tiers and merges overlapping findings into one
// group per set (union-find over the links). Everything is hash-bucketed:
// exact by audio hash, acoustic by an LSH-style fingerprint index, fuzzy by
// artist|title blocks, so the cost is near-linear in the library.
export function groupDuplicates(
	tracks: readonly DedupeTrack[],
	options: DedupeOptions = {},
): DedupeResult {
	const maxSize = options.maxGroupSize ?? 50;
	const edges: Edge[] = [];

	if (options.exact !== false) {
		const byHash = new Map<string, number>();
		tracks.forEach((t, i) => {
			if (!t.audioHash) return;
			const head = byHash.get(t.audioHash);
			if (head === undefined) byHash.set(t.audioHash, i);
			else edges.push({ a: head, b: i, reason: "exact", confidence: 1 });
		});
	}

	if (options.acoustic !== false) {
		const acousticOptions =
			options.acoustic === true || options.acoustic === undefined
				? {}
				: options.acoustic;
		const items: AcousticItem[] = [];
		const back: number[] = [];
		tracks.forEach((t, i) => {
			if (t.fingerprint && t.fingerprint.length >= 16) {
				items.push({
					id: i,
					fingerprint: t.fingerprint,
					durationMs: t.durationMs,
				});
				back.push(i);
			}
		});
		for (const p of findAcousticPairs(items, acousticOptions)) {
			edges.push({
				a: back[p.a] as number,
				b: back[p.b] as number,
				reason: "acoustic",
				confidence: p.confidence,
			});
		}
	}

	let versions: VersionGroup[] = [];
	if (options.fuzzy !== false) {
		const fuzzy = fuzzyMatch(
			tracks,
			options.fuzzy === true || options.fuzzy === undefined
				? {}
				: options.fuzzy,
		);
		for (const e of fuzzy.edges) edges.push({ ...e, reason: "fuzzy" });
		versions = fuzzy.versionSets.map((v) => ({
			trackIds: v.members.map((i) => (tracks[i] as DedupeTrack).id),
			versions: v.versions.map((x) => ({
				key: x.cls.key,
				kind: x.cls.kind,
				trackIds: x.members.map((i) => (tracks[i] as DedupeTrack).id),
			})),
		}));
	}

	const parent = new Int32Array(tracks.length).map((_, i) => i);
	const size = new Int32Array(tracks.length).fill(1);
	const find = (x: number): number => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x] as number] as number;
			x = parent[x] as number;
		}
		return x;
	};
	edges.sort(
		(x, y) => ORDER[x.reason] - ORDER[y.reason] || y.confidence - x.confidence,
	);
	const kept: Edge[] = [];
	for (const e of edges) {
		const ra = find(e.a);
		const rb = find(e.b);
		if (ra === rb) {
			kept.push(e);
			continue;
		}
		if (
			e.reason !== "exact" &&
			(size[ra] as number) + (size[rb] as number) > maxSize
		)
			continue;
		if ((size[ra] as number) < (size[rb] as number)) {
			parent[ra] = rb;
			size[rb] = (size[rb] as number) + (size[ra] as number);
		} else {
			parent[rb] = ra;
			size[ra] = (size[ra] as number) + (size[rb] as number);
		}
		kept.push(e);
	}

	const members = new Map<number, number[]>();
	for (let i = 0; i < tracks.length; i++) {
		if ((size[find(i)] as number) < 2) continue;
		const r = find(i);
		const list = members.get(r);
		if (list) list.push(i);
		else members.set(r, [i]);
	}
	const info = new Map<
		number,
		{ reasons: Set<DuplicateReason>; confidence: number }
	>();
	for (const e of kept) {
		const r = find(e.a);
		const cur = info.get(r) ?? {
			reasons: new Set<DuplicateReason>(),
			confidence: 1,
		};
		cur.reasons.add(e.reason);
		cur.confidence = Math.min(cur.confidence, e.confidence);
		info.set(r, cur);
	}
	const groups: DuplicateGroup[] = [];
	for (const [root, list] of members) {
		const meta = info.get(root);
		if (!meta) continue;
		const reasons = [...meta.reasons].sort((x, y) => ORDER[x] - ORDER[y]);
		groups.push({
			trackIds: list.map((i): TrackId => (tracks[i] as DedupeTrack).id),
			reason: reasons[reasons.length - 1] as DuplicateReason,
			reasons,
			confidence: Math.round(meta.confidence * 1000) / 1000,
		});
	}
	groups.sort(
		(x, y) =>
			y.confidence - x.confidence || y.trackIds.length - x.trackIds.length,
	);
	return { groups, versions };
}
