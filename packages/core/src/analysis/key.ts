import { FFT } from "../audio/index.ts";
import {
	camelotString,
	type MusicalKey,
	musicalName,
	toCamelot,
	toOpenKey,
} from "../harmonic/camelot.ts";
import { clamp01, type Estimate, none } from "./types.ts";

export interface KeyEstimate {
	key: MusicalKey;
	camelot: string;
	openKey: string;
	// "Am", "C#"
	musical: string;
}

// Index 0 = tonic. Krumhansl-Kessler and Temperley (MIREX) profiles.
const KK_MAJOR = [
	6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KK_MINOR = [
	6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];
const TP_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TP_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

const SIZE = 8192;
const LOW_HZ = 60;
const HIGH_HZ = 2000;

function correlation(x: ArrayLike<number>, y: ArrayLike<number>): number {
	const n = x.length;
	let mx = 0;
	let my = 0;
	for (let i = 0; i < n; i++) {
		mx += x[i] as number;
		my += y[i] as number;
	}
	mx /= n;
	my /= n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		const dx = (x[i] as number) - mx;
		const dy = (y[i] as number) - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

// Pitch-class energy from FFT bins (a poor man's constant-Q: the 8192 window at
// 11 kHz resolves semitones down to ~100 Hz). Spectral peaks only, sqrt-compressed,
// each frame normalised so loud passages do not dominate; the tuning offset is
// estimated from the peaks' distance to the nearest semitone and removed.
export function chroma(
	samples: Float32Array,
	sampleRate: number,
): { chroma: Float64Array; frames: number } | null {
	const fft = new FFT(SIZE);
	const win = new Float64Array(SIZE);
	for (let i = 0; i < SIZE; i++)
		win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SIZE - 1));
	const re = new Float64Array(SIZE);
	const im = new Float64Array(SIZE);
	const binHz = sampleRate / SIZE;
	const lo = Math.ceil(LOW_HZ / binHz);
	const hi = Math.min(SIZE / 2 - 2, Math.floor(HIGH_HZ / binHz));
	const mag = new Float64Array(SIZE / 2 + 1);
	const hop = SIZE / 2;

	// Pass 1 collects peaks (pitch in fractional semitones, weight) per frame.
	const peaks: Array<Array<[number, number]>> = [];
	const tuneHist = new Float64Array(20); // fractional part, 0.05 st bins
	for (let off = 0; off + SIZE <= samples.length; off += hop) {
		for (let i = 0; i < SIZE; i++) {
			re[i] = (samples[off + i] as number) * (win[i] as number);
			im[i] = 0;
		}
		fft.transform(re, im);
		for (let k = lo - 1; k <= hi + 1; k++)
			mag[k] = Math.hypot(re[k] as number, im[k] as number);
		const frame: Array<[number, number]> = [];
		let total = 0;
		for (let k = lo; k <= hi; k++) {
			const m = mag[k] as number;
			if (m > (mag[k - 1] as number) && m >= (mag[k + 1] as number) && m > 0) {
				// Parabolic interpolation of the peak position.
				const a = mag[k - 1] as number;
				const c = mag[k + 1] as number;
				const denom = a - 2 * m + c;
				const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
				const f = (k + delta) * binHz;
				const pitch = 69 + 12 * Math.log2(f / 440);
				const w = Math.sqrt(m);
				frame.push([pitch, w]);
				total += w;
			}
		}
		if (total <= 0) continue;
		for (const p of frame) {
			p[1] /= total;
			const frac = p[0] - Math.round(p[0]) + 0.5; // 0..1
			const slot = Math.min(19, Math.floor(frac * 20));
			tuneHist[slot] = (tuneHist[slot] as number) + p[1];
		}
		peaks.push(frame);
	}
	if (peaks.length === 0) return null;
	let tb = 0;
	for (let i = 1; i < 20; i++)
		if ((tuneHist[i] as number) > (tuneHist[tb] as number)) tb = i;
	// Offset of the dominant fractional pitch from the semitone grid.
	const tuning = (tb + 0.5) / 20 - 0.5;

	const out = new Float64Array(12);
	for (const frame of peaks) {
		for (const [pitch, w] of frame) {
			const adj = pitch - tuning;
			const nearest = Math.round(adj);
			if (Math.abs(adj - nearest) > 0.35) continue;
			const pc = ((nearest % 12) + 12) % 12;
			out[pc] = (out[pc] as number) + w;
		}
	}
	return { chroma: out, frames: peaks.length };
}

// Best key by the mean of Krumhansl and Temperley profile correlations.
export function keyFromChroma(c: ArrayLike<number>): {
	key: MusicalKey;
	score: number;
	runnerUp: number;
} {
	const ranked: Array<{ key: MusicalKey; score: number }> = [];
	for (let tonic = 0; tonic < 12; tonic++) {
		const rotated = Array.from(
			{ length: 12 },
			(_, i) => c[(i + tonic) % 12] as number,
		);
		for (const mode of ["major", "minor"] as const) {
			const kk = correlation(rotated, mode === "major" ? KK_MAJOR : KK_MINOR);
			const tp = correlation(rotated, mode === "major" ? TP_MAJOR : TP_MINOR);
			ranked.push({ key: { tonic, mode }, score: (kk + tp) / 2 });
		}
	}
	ranked.sort((a, b) => b.score - a.score);
	const best = ranked[0] as { key: MusicalKey; score: number };
	return {
		key: best.key,
		score: best.score,
		runnerUp: (ranked[1] as { score: number }).score,
	};
}

export function estimateKey(
	samples: Float32Array,
	sampleRate: number,
): Estimate<KeyEstimate> {
	const c = chroma(samples, sampleRate);
	if (!c) return none(samples.length < SIZE ? "too-short" : "silent");
	const { key, score, runnerUp } = keyFromChroma(c.chroma);
	const camelot = toCamelot(key);
	// Fit of the profile and the gap to the second-best key (often the relative
	// or the fifth, which are genuinely close in tonal music).
	const confidence = clamp01(
		0.6 * clamp01((score - 0.3) / 0.5) +
			0.4 * clamp01((score - runnerUp) / 0.1),
	);
	return {
		value: {
			key,
			camelot: camelotString(camelot),
			openKey: toOpenKey(camelot),
			musical: musicalName(key),
		},
		confidence,
	};
}
