import { decodeBudgetMs, decodeMono } from "../audio/index.ts";
import { run } from "../exec/index.ts";
import { energyScore } from "./energy.ts";
import { estimateKey, type KeyEstimate } from "./key.ts";
import { type Loudness, measureLoudness } from "./loudness.ts";
import { estimateTempo } from "./tempo.ts";
import { type Estimate, none } from "./types.ts";

export { energyScore } from "./energy.ts";
export {
	ESSENTIA_RATE,
	type EssentiaTempo,
	essentiaKey,
	essentiaTempo,
} from "./essentia.ts";
export { chroma, estimateKey, type KeyEstimate, keyFromChroma } from "./key.ts";
export { type Loudness, measureLoudness, parseEbur128 } from "./loudness.ts";
export { onsetEnvelope } from "./onset.ts";
export { estimateTempo, type TempoOptions } from "./tempo.ts";
export type { Estimate } from "./types.ts";

export interface AnalysisOptions {
	ffmpegPath?: string;
	// Known duration; probed with ffmpeg when omitted.
	durationSec?: number;
	// Seconds analysed from the middle of the track; absent analyses the whole track.
	windowSec?: number;
	// Skip parts: all on by default.
	only?: Array<"bpm" | "key" | "energy" | "loudness">;
	timeoutMs?: number;
}

export interface TrackAnalysis {
	bpm: Estimate<number>;
	key: Estimate<KeyEstimate>;
	energy: Estimate<number>;
	loudness: Estimate<Loudness>;
	durationSec: number | null;
}

const RATE = 11_025;

export async function probeDuration(
	path: string,
	ffmpegPath = "ffmpeg",
): Promise<number | null> {
	const r = await run(ffmpegPath, ["-nostdin", "-hide_banner", "-i", path], {
		timeoutMs: 15_000,
	});
	const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
	return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

// BPM, key and energy from one mono decode at 11025 Hz, of the window of seconds
// taken from the middle of the track or else the whole track, plus EBU R128 loudness over the whole file. Every part
// degrades to { value: null, reason } (ffmpeg missing, undecodable, silent).
export async function analyseTrack(
	path: string,
	options: AnalysisOptions = {},
): Promise<TrackAnalysis> {
	const want = new Set(options.only ?? ["bpm", "key", "energy", "loudness"]);
	const { windowSec } = options;
	const bin = options.ffmpegPath ?? "ffmpeg";
	const result: TrackAnalysis = {
		bpm: none("unavailable"),
		key: none("unavailable"),
		energy: none("unavailable"),
		loudness: none("unavailable"),
		durationSec: options.durationSec ?? null,
	};
	result.durationSec ??= await probeDuration(path, bin);
	if (want.has("loudness"))
		result.loudness = await measureLoudness(path, {
			ffmpegPath: bin,
			timeoutMs: options.timeoutMs,
			...(result.durationSec ? { durationSec: result.durationSec } : {}),
		});
	if (!want.has("bpm") && !want.has("key") && !want.has("energy"))
		return result;

	const duration = result.durationSec;
	const startSec =
		windowSec && duration && duration > windowSec
			? (duration - windowSec) / 2
			: 0;
	const pcm = await decodeMono(path, {
		ffmpegPath: bin,
		startSec,
		durationSec: windowSec,
		sampleRate: RATE,
		timeoutMs:
			options.timeoutMs ??
			decodeBudgetMs(
				windowSec && duration
					? Math.min(windowSec, duration)
					: (windowSec ?? duration ?? 0),
			),
	});
	if (!pcm.ok) {
		const reason =
			pcm.reason === "unavailable" ? "unavailable" : "decode-failed";
		if (want.has("bpm")) result.bpm = none(reason);
		if (want.has("key")) result.key = none(reason);
		if (want.has("energy")) result.energy = none(reason);
		return result;
	}
	if (want.has("bpm")) result.bpm = estimateTempo(pcm.samples, RATE);
	if (want.has("key")) result.key = estimateKey(pcm.samples, RATE);
	if (want.has("energy")) result.energy = energyScore(pcm.samples, RATE);
	return result;
}
