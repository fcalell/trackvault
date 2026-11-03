import { onsetEnvelope } from "./onset.ts";
import { clamp01, type Estimate, none } from "./types.ts";

export interface TempoOptions {
	// DJ range the result is folded into. Default 70..180.
	minBpm?: number;
	maxBpm?: number;
	// Centre of the prior favouring common dance tempos. Default 125.
	priorBpm?: number;
}

// Tempo from the autocorrelation of the onset-strength envelope. Each candidate
// BPM is scored by the autocorrelation at its first four beat multiples
// (interpolated), so the fine resolution comes from the far multiples and a
// wrong octave loses its off-beat support. A broad log-normal prior then picks
// between octaves the signal cannot tell apart (87 vs 174 bpm stays a guess).
export function estimateTempo(
	samples: Float32Array,
	sampleRate: number,
	options: TempoOptions = {},
): Estimate<number> {
	const minBpm = options.minBpm ?? 70;
	const maxBpm = options.maxBpm ?? 180;
	const prior = options.priorBpm ?? 125;
	const { flux, hopSec } = onsetEnvelope(samples, sampleRate);
	if (flux.length < 4 / hopSec) return none("too-short");

	// Remove the slow-moving mean so the autocorrelation sees pulses, not level.
	const n = flux.length;
	const w = Math.round(0.5 / hopSec);
	const env = new Float64Array(n);
	let acc = 0;
	const prefix = new Float64Array(n + 1);
	for (let i = 0; i < n; i++)
		prefix[i + 1] = (prefix[i] as number) + (flux[i] as number);
	for (let i = 0; i < n; i++) {
		const a = Math.max(0, i - w);
		const b = Math.min(n, i + w + 1);
		const mean = ((prefix[b] as number) - (prefix[a] as number)) / (b - a);
		env[i] = Math.max(0, (flux[i] as number) - mean);
		acc += (env[i] as number) ** 2;
	}
	if (acc < 1e-9) return none("silent");

	const maxLag = Math.ceil((4 * 60) / (minBpm * hopSec)) + 2;
	const acf = new Float64Array(maxLag + 1);
	for (let lag = 0; lag <= maxLag; lag++) {
		let s = 0;
		for (let i = lag; i < n; i++)
			s += (env[i] as number) * (env[i - lag] as number);
		acf[lag] = s / (n - lag);
	}
	const norm = acf[0] as number;
	const at = (lag: number): number => {
		const i = Math.floor(lag);
		const f = lag - i;
		return (
			(acf[i] as number) * (1 - f) +
			(acf[Math.min(maxLag, i + 1)] as number) * f
		);
	};

	const step = 0.1;
	const count = Math.round((maxBpm - minBpm) / step) + 1;
	const scores = new Float64Array(count);
	let best = 0;
	for (let c = 0; c < count; c++) {
		const bpm = minBpm + c * step;
		const lag = 60 / bpm / hopSec;
		let s = 0;
		for (let k = 1; k <= 4; k++) s += at(k * lag) / (k === 1 ? 1 : 1.5);
		const octave = Math.log2(bpm / prior);
		scores[c] =
			Math.max(0, s / norm) * Math.exp(-(octave * octave) / (2 * 0.7 * 0.7));
		if ((scores[c] as number) > (scores[best] as number)) best = c;
	}
	const peak = scores[best] as number;
	if (!(peak > 0)) return none("silent");

	// Confidence: how far the winner stands above the typical score and above the
	// best score of a clearly different tempo (outside +-6%).
	let mean = 0;
	let rival = 0;
	const bpmBest = minBpm + best * step;
	for (let c = 0; c < count; c++) {
		mean += scores[c] as number;
		const bpm = minBpm + c * step;
		if (Math.abs(bpm / bpmBest - 1) > 0.06)
			rival = Math.max(rival, scores[c] as number);
	}
	mean /= count;
	const prominence = clamp01((peak / Math.max(mean, 1e-12) - 1) / 4);
	const margin = clamp01((peak - rival) / peak / 0.3);
	const strength = clamp01(peak / 0.5);
	const confidence = clamp01(0.5 * prominence + 0.3 * margin + 0.2 * strength);
	return { value: Math.round(bpmBest * 10) / 10, confidence };
}
