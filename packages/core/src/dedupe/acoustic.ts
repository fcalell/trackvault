import { run } from "../exec/index.ts";

// -- fingerprinting --------------------------------------------------------

export interface FingerprintOptions {
	fpcalcPath?: string;
	// Seconds of audio fingerprinted from the start. Default 120.
	lengthSec?: number;
	timeoutMs?: number;
}

export type FingerprintResult =
	| { ok: true; fingerprint: Int32Array; durationSec: number }
	| { ok: false; reason: "missing-binary" | "timeout" | "failed" };

// `fpcalc -raw -json`: the raw Chromaprint items as int32. One file per call.
export async function fingerprintFile(
	path: string,
	options: FingerprintOptions = {},
): Promise<FingerprintResult> {
	const r = await run(
		options.fpcalcPath ?? "fpcalc",
		["-raw", "-json", "-length", String(options.lengthSec ?? 120), path],
		{ timeoutMs: options.timeoutMs ?? 60_000, maxStdoutBytes: 4 * 1024 * 1024 },
	);
	if (r.missing) return { ok: false, reason: "missing-binary" };
	if (r.timedOut) return { ok: false, reason: "timeout" };
	if (r.code !== 0) return { ok: false, reason: "failed" };
	try {
		const parsed = JSON.parse(r.stdout.toString("utf8")) as {
			duration?: number;
			fingerprint?: number[] | string;
		};
		const raw =
			typeof parsed.fingerprint === "string"
				? parsed.fingerprint.split(",").map(Number)
				: parsed.fingerprint;
		if (!Array.isArray(raw) || raw.length === 0)
			return { ok: false, reason: "failed" };
		const fingerprint = new Int32Array(raw.length);
		for (let i = 0; i < raw.length; i++)
			fingerprint[i] = (raw[i] as number) | 0;
		return { ok: true, fingerprint, durationSec: parsed.duration ?? 0 };
	} catch {
		return { ok: false, reason: "failed" };
	}
}

// Fingerprints are stored as little-endian int32 bytes.
export function fingerprintToBytes(fp: Int32Array): Uint8Array {
	const out = new Uint8Array(fp.length * 4);
	const view = new DataView(out.buffer);
	for (let i = 0; i < fp.length; i++)
		view.setInt32(i * 4, fp[i] as number, true);
	return out;
}

export function fingerprintFromBytes(bytes: Uint8Array): Int32Array {
	const out = new Int32Array(Math.floor(bytes.length / 4));
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let i = 0; i < out.length; i++) out[i] = view.getInt32(i * 4, true);
	return out;
}

// -- comparison ------------------------------------------------------------

function popcount(x: number): number {
	x -= (x >>> 1) & 0x55555555;
	x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
	x = (x + (x >>> 4)) & 0x0f0f0f0f;
	return Math.imul(x, 0x01010101) >>> 24;
}

export interface Alignment {
	// Fraction of differing bits over the overlap, 0 (same) to ~0.5 (unrelated).
	ber: number;
	// Items `b` is shifted against `a`: a[i] is compared with b[i + offset].
	offset: number;
	overlap: number;
}

// Bit error rate with `b` shifted by `offset` items; null under `minOverlap`.
export function berAtOffset(
	a: Int32Array,
	b: Int32Array,
	offset: number,
	minOverlap: number,
): Alignment | null {
	const start = Math.max(0, -offset);
	const end = Math.min(a.length, b.length - offset);
	const overlap = end - start;
	if (overlap < minOverlap) return null;
	let bits = 0;
	for (let i = start; i < end; i++)
		bits += popcount((a[i] as number) ^ (b[i + offset] as number));
	return { ber: bits / (overlap * 32), offset, overlap };
}

export interface CompareOptions {
	// Largest shift tried, in items (~0.124 s each). Default 120 (about 15 s).
	maxOffset?: number;
	// Fewest overlapping items to trust a result. Default 80 (about 10 s).
	minOverlap?: number;
}

// The best alignment of two fingerprints over every shift up to `maxOffset`.
export function compareFingerprints(
	a: Int32Array,
	b: Int32Array,
	options: CompareOptions = {},
): Alignment | null {
	const maxOffset = options.maxOffset ?? 120;
	const minOverlap = Math.min(
		options.minOverlap ?? 80,
		Math.floor(Math.min(a.length, b.length) / 2),
	);
	let best: Alignment | null = null;
	for (let off = -maxOffset; off <= maxOffset; off++) {
		const r = berAtOffset(a, b, off, minOverlap);
		if (r && (!best || r.ber < best.ber)) best = r;
	}
	return best;
}

// -- candidate generation --------------------------------------------------

export interface AcousticItem {
	id: number;
	fingerprint: Int32Array;
	durationMs?: number | null;
}

export interface AcousticPair {
	a: number;
	b: number;
	ber: number;
	offset: number;
	confidence: number;
}

export interface AcousticOptions {
	// Pairs under this bit error rate match. Default 0.25.
	maxBer?: number;
	// Fraction of items indexed (hash-sampled, so equal items sample alike). Default 1/4.
	sampleMask?: number;
	// Matching sampled items, at one consistent offset, to become a candidate. Default 3.
	minVotes?: number;
	// A key shared by more tracks than this (silence, intros) is not used. Default 64.
	maxBucket?: number;
	maxOffset?: number;
	minOverlap?: number;
	// Durations further apart than max(this, 3 %) never match. Default 4 s.
	durationSlackSec?: number;
}

const OFFSET_SPAN = 1 << 13;

function mix32(x: number): number {
	x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
	x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
	return (x ^ (x >>> 16)) >>> 0;
}

// Near-linear acoustic matching. Sampled 32-bit items are bucketed in a hash
// index (CSR arrays, no per-item objects); every item looks up its bucket and
// votes for (other track, offset). Only pairs with enough votes at one offset
// are compared, at that offset, by bit error rate.
export function findAcousticPairs(
	items: readonly AcousticItem[],
	options: AcousticOptions = {},
): AcousticPair[] {
	const maxBer = options.maxBer ?? 0.25;
	const mask = options.sampleMask ?? 3;
	const minVotes = options.minVotes ?? 3;
	const maxBucket = options.maxBucket ?? 64;
	const maxOffset = options.maxOffset ?? 120;
	const slack = (options.durationSlackSec ?? 4) * 1000;
	const minOverlapOpt = options.minOverlap ?? 80;

	const tableBits = Math.max(
		10,
		Math.ceil(Math.log2(Math.max(1, items.length * 64))),
	);
	const tableSize = 1 << Math.min(tableBits, 24);
	const slots = tableSize - 1;
	const counts = new Uint32Array(tableSize + 1);
	let total = 0;
	for (const it of items) {
		const fp = it.fingerprint;
		for (let p = 0; p < fp.length; p++) {
			const h = mix32(fp[p] as number);
			if ((h & mask) !== 0) continue;
			counts[((h >>> 8) & slots) + 1] =
				(counts[((h >>> 8) & slots) + 1] as number) + 1;
			total++;
		}
	}
	for (let i = 0; i < tableSize; i++)
		counts[i + 1] = (counts[i + 1] as number) + (counts[i] as number);
	const fill = counts.slice(0, tableSize);
	const entryTrack = new Uint32Array(total);
	const entryPos = new Uint32Array(total);
	items.forEach((it, idx) => {
		const fp = it.fingerprint;
		for (let p = 0; p < fp.length; p++) {
			const h = mix32(fp[p] as number);
			if ((h & mask) !== 0) continue;
			const slot = (h >>> 8) & slots;
			const at = fill[slot] as number;
			fill[slot] = at + 1;
			entryTrack[at] = idx;
			entryPos[at] = p;
		}
	});

	const pairs: AcousticPair[] = [];
	const votes = new Map<number, number>();
	items.forEach((it, idx) => {
		votes.clear();
		const fp = it.fingerprint;
		for (let p = 0; p < fp.length; p++) {
			const value = fp[p] as number;
			const h = mix32(value);
			if ((h & mask) !== 0) continue;
			const slot = (h >>> 8) & slots;
			const lo = counts[slot] as number;
			const hi = counts[slot + 1] as number;
			if (hi - lo > maxBucket) continue;
			for (let e = lo; e < hi; e++) {
				const other = entryTrack[e] as number;
				if (other <= idx) continue;
				const otherFp = (items[other] as AcousticItem).fingerprint;
				if (otherFp[entryPos[e] as number] !== value) continue;
				const offset = (entryPos[e] as number) - p;
				if (offset > maxOffset || offset < -maxOffset) continue;
				const key = other * OFFSET_SPAN + offset + OFFSET_SPAN / 2;
				votes.set(key, (votes.get(key) ?? 0) + 1);
			}
		}
		const bestFor = new Map<number, { ber: number; offset: number }>();
		for (const [key, count] of votes) {
			if (count < minVotes) continue;
			const other = Math.floor(key / OFFSET_SPAN);
			const offset = (key % OFFSET_SPAN) - OFFSET_SPAN / 2;
			const o = items[other] as AcousticItem;
			if (it.durationMs && o.durationMs) {
				const limit = Math.max(
					slack,
					0.03 * Math.max(it.durationMs, o.durationMs),
				);
				if (Math.abs(it.durationMs - o.durationMs) > limit) continue;
			}
			const minOverlap = Math.min(
				minOverlapOpt,
				Math.floor(Math.min(fp.length, o.fingerprint.length) / 2),
			);
			for (let d = -1; d <= 1; d++) {
				const r = berAtOffset(fp, o.fingerprint, offset + d, minOverlap);
				if (!r) continue;
				const prev = bestFor.get(other);
				if (!prev || r.ber < prev.ber)
					bestFor.set(other, { ber: r.ber, offset: r.offset });
			}
		}
		for (const [other, r] of bestFor) {
			if (r.ber > maxBer) continue;
			pairs.push({
				a: idx,
				b: other,
				ber: r.ber,
				offset: r.offset,
				confidence: Math.max(0.5, Math.min(1, 1 - r.ber * 1.5)),
			});
		}
	});
	return pairs;
}
