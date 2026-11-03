import { FFT } from "../audio/index.ts";

export interface OnsetEnvelope {
	// Half-wave rectified log-magnitude spectral flux per frame.
	flux: Float32Array;
	// Seconds per frame.
	hopSec: number;
	// Mean frame RMS-ish level (linear), for the energy score.
	frameRms: Float32Array;
}

const SIZE = 1024;
const HOP = 128;
const MAX_HZ = 5000;

// Spectral-flux onset strength: log-compressed magnitudes, positive frame
// differences summed over the bins below 5 kHz (where kicks, snares and hats live).
export function onsetEnvelope(
	samples: Float32Array,
	sampleRate: number,
): OnsetEnvelope {
	const frames = Math.max(0, Math.floor((samples.length - SIZE) / HOP) + 1);
	const fft = new FFT(SIZE);
	const window = new Float64Array(SIZE);
	for (let i = 0; i < SIZE; i++)
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SIZE - 1));
	const bins = Math.min(SIZE / 2, Math.floor((MAX_HZ * SIZE) / sampleRate));
	const re = new Float64Array(SIZE);
	const im = new Float64Array(SIZE);
	let prev = new Float64Array(bins);
	let cur = new Float64Array(bins);
	const flux = new Float32Array(frames);
	const frameRms = new Float32Array(frames);
	for (let f = 0; f < frames; f++) {
		const off = f * HOP;
		let energy = 0;
		for (let i = 0; i < SIZE; i++) {
			const v = samples[off + i] as number;
			re[i] = v * (window[i] as number);
			im[i] = 0;
			energy += v * v;
		}
		frameRms[f] = Math.sqrt(energy / SIZE);
		fft.transform(re, im);
		let sum = 0;
		for (let k = 0; k < bins; k++) {
			const mag = Math.hypot(re[k] as number, im[k] as number);
			const v = Math.log1p(mag * 100);
			cur[k] = v;
			if (f > 0) {
				const d = v - (prev[k] as number);
				if (d > 0) sum += d;
			}
		}
		flux[f] = sum;
		[prev, cur] = [cur, prev];
	}
	return { flux, hopSec: HOP / sampleRate, frameRms };
}
