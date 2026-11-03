import { onsetEnvelope } from "./onset.ts";
import { clamp01, type Estimate, none } from "./types.ts";

// 1..10 from three cheap cues, each mapped to 0..1 over a range typical of
// dance music: loudness of the body (RMS dBFS -32..-10), spectral flux (how much
// the spectrum changes per frame) and onset density (peaks per second, 0.5..6).
// It is a heuristic rank, not Mixed In Key's number: confidence stays modest.
export function energyScore(
	samples: Float32Array,
	sampleRate: number,
): Estimate<number> {
	const { flux, frameRms, hopSec } = onsetEnvelope(samples, sampleRate);
	if (flux.length < 2 / hopSec) return none("too-short");
	let sumSq = 0;
	for (const v of frameRms) sumSq += v * v;
	const rmsDb = 10 * Math.log10(Math.max(sumSq / frameRms.length, 1e-12));
	if (rmsDb < -60) return none("silent");

	let fluxMean = 0;
	for (const v of flux) fluxMean += v;
	fluxMean /= flux.length;

	// Peak picking: local maxima above mean + 1 sd, at least 80 ms apart.
	let sd = 0;
	for (const v of flux) sd += (v - fluxMean) ** 2;
	sd = Math.sqrt(sd / flux.length);
	const gap = Math.max(1, Math.round(0.08 / hopSec));
	let onsets = 0;
	let last = -gap;
	for (let i = 1; i < flux.length - 1; i++) {
		const v = flux[i] as number;
		if (
			v > fluxMean + sd &&
			v >= (flux[i - 1] as number) &&
			v > (flux[i + 1] as number) &&
			i - last >= gap
		) {
			onsets++;
			last = i;
		}
	}
	const density = onsets / (flux.length * hopSec);

	const loud = clamp01((rmsDb + 32) / 22);
	const fl = clamp01((fluxMean - 2) / 14);
	const dens = clamp01((density - 0.5) / 5.5);
	const x = 0.45 * loud + 0.3 * fl + 0.25 * dens;
	return {
		value: Math.max(1, Math.min(10, Math.round(1 + 9 * x))),
		confidence: 0.5,
	};
}
