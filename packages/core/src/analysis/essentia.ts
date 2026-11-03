/// <reference path="./essentia-js.d.ts" />
import lib from "essentia.js";
import {
	camelotString,
	musicalName,
	parseKey,
	toCamelot,
	toOpenKey,
} from "../harmonic/camelot.ts";
import type { KeyEstimate } from "./key.ts";
import { clamp01, type Estimate, none } from "./types.ts";

// Essentia's WASM build (AGPL-3.0, the WASM is inlined in the package's JS, so it
// bundles with no file lookup). One instance per thread; the C++ side is never freed
// before the thread ends.
export const ESSENTIA_RATE = 44_100;

interface Vector {
	delete(): void;
}
interface EssentiaApi {
	arrayToVector(a: Float32Array): Vector;
	vectorToArray(v: Vector): Float32Array;
	RhythmExtractor2013(
		signal: Vector,
		maxTempo: number,
		method: string,
		minTempo: number,
	): { bpm: number; confidence: number; ticks: Vector; estimates: Vector };
	KeyExtractor(
		audio: Vector,
		averageDetuningCorrection: boolean,
		frameSize: number,
		hopSize: number,
		hpcpSize: number,
		maxFrequency: number,
		maximumSpectralPeaks: number,
		minFrequency: number,
		pcpThreshold: number,
		profileType: string,
		sampleRate: number,
	): { key: string; scale: string; strength: number };
}

let instance: EssentiaApi | undefined;
function essentia(): EssentiaApi {
	instance ??= new lib.Essentia(lib.EssentiaWASM) as EssentiaApi;
	return instance;
}

export interface EssentiaTempo {
	bpm: number;
	confidence: number;
	// Beat positions in seconds from the start of the analysed signal.
	beats: Float32Array;
}

// Essentia's RhythmExtractor2013 confidence is about 0..5.3 (above 3.5 excellent).
const CONFIDENCE_FULL = 3.5;

export function essentiaTempo(
	samples: Float32Array,
	options: { minBpm?: number; maxBpm?: number } = {},
): Estimate<EssentiaTempo> {
	if (samples.length < ESSENTIA_RATE * 5) return none("too-short");
	const api = essentia();
	const signal = api.arrayToVector(samples);
	try {
		const r = api.RhythmExtractor2013(
			signal,
			options.maxBpm ?? 208,
			"multifeature",
			options.minBpm ?? 40,
		);
		const beats = api.vectorToArray(r.ticks);
		r.ticks.delete();
		r.estimates.delete();
		if (!(r.bpm > 0)) return none("silent");
		return {
			value: { bpm: r.bpm, confidence: r.confidence, beats },
			confidence: clamp01(r.confidence / CONFIDENCE_FULL),
		};
	} finally {
		signal.delete();
	}
}

export function essentiaKey(samples: Float32Array): Estimate<KeyEstimate> {
	if (samples.length < ESSENTIA_RATE * 5) return none("too-short");
	const api = essentia();
	const signal = api.arrayToVector(samples);
	try {
		// Essentia's defaults except the profile: edma suits electronic music.
		const r = api.KeyExtractor(
			signal,
			true,
			4096,
			4096,
			12,
			3500,
			60,
			25,
			0.2,
			"edma",
			ESSENTIA_RATE,
		);
		const key = parseKey(`${r.key} ${r.scale}`);
		if (!key) return none("silent");
		const camelot = toCamelot(key);
		return {
			value: {
				key,
				camelot: camelotString(camelot),
				openKey: toOpenKey(camelot),
				musical: musicalName(key),
			},
			confidence: clamp01(r.strength),
		};
	} finally {
		signal.delete();
	}
}
