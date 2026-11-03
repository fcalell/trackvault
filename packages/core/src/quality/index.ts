import {
	decodeMono,
	meanSpectrum,
	rms,
	type Spectrum,
} from "../audio/index.ts";
import { binaryAvailable, run } from "../exec/index.ts";

export { FFT, meanSpectrum } from "../audio/index.ts";

export interface FfmpegOptions {
	ffmpegPath?: string;
}

export function ffmpegAvailable(path = "ffmpeg"): Promise<boolean> {
	return binaryAvailable(path, "-version");
}

// -- decode check ----------------------------------------------------------

export type IntegrityStatus =
	| "ok"
	// Decoded to the end but ffmpeg complained.
	| "warnings"
	| "corrupt"
	| "timeout"
	| "unavailable";

export interface IntegrityResult {
	status: IntegrityStatus;
	// Distinct ffmpeg error lines, at most 20.
	errors: string[];
	errorCount: number;
}

export interface IntegrityOptions extends FfmpegOptions {
	// Default 120000.
	timeoutMs?: number;
}

const BENIGN =
	/estimating duration from bitrate|invalid return value 0 for stream protocol/i;

// `ffmpeg -v error -i file -f null -`: decodes the whole file; any line on
// stderr is a decode problem. One file per call.
export async function checkIntegrity(
	path: string,
	options: IntegrityOptions = {},
): Promise<IntegrityResult> {
	const bin = options.ffmpegPath ?? "ffmpeg";
	const r = await run(
		bin,
		["-nostdin", "-v", "error", "-i", path, "-f", "null", "-"],
		{ timeoutMs: options.timeoutMs ?? 120_000 },
	);
	if (r.missing) return { status: "unavailable", errors: [], errorCount: 0 };
	if (r.timedOut) return { status: "timeout", errors: [], errorCount: 0 };
	const lines = r.stderr
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const real = lines.filter((l) => !BENIGN.test(l));
	const errors = [...new Set(real)].slice(0, 20);
	if (r.code !== 0)
		return { status: "corrupt", errors, errorCount: real.length || 1 };
	return {
		status: real.length === 0 ? "ok" : "warnings",
		errors,
		errorCount: real.length,
	};
}

// -- spectral cutoff -------------------------------------------------------

export interface CutoffOptions extends FfmpegOptions {
	// Needed to place the sample offsets; without it the file's start is used.
	durationSec?: number;
	// Seconds decoded per offset. Default 4.
	clipSec?: number;
	// Where the clips start as fractions of the duration. Default 0.2/0.5/0.8.
	offsets?: number[];
	timeoutMs?: number;
}

export interface CutoffEstimate {
	// Highest frequency with sustained energy, or null when nothing could be measured.
	cutoffHz: number | null;
	// Band levels in dB (re the 1-4 kHz body), 172 Hz bands: for plotting.
	bandsDb: number[];
	clips: number;
	reason: "ok" | "unavailable" | "decode-failed" | "silent";
}

const RATE = 44_100;
const FFT_SIZE = 4096;
const BAND_BINS = 16;
// Energy this far below the 1-4 kHz body is "nothing there".
const FLOOR_DB = -72;

async function decodeClip(
	path: string,
	startSec: number,
	clipSec: number,
	bin: string,
	timeoutMs: number,
): Promise<{ samples: Float32Array } | { missing: true } | null> {
	const r = await decodeMono(path, {
		ffmpegPath: bin,
		startSec,
		durationSec: clipSec,
		sampleRate: RATE,
		timeoutMs,
	});
	if (!r.ok) return r.reason === "unavailable" ? { missing: true } : null;
	return r.samples.length < FFT_SIZE * 2 ? null : { samples: r.samples };
}

// Pure part: from a mean power spectrum to the cutoff.
export function cutoffFromSpectrum(spectrum: Spectrum): {
	cutoffHz: number | null;
	bandsDb: number[];
} {
	const bands: number[] = [];
	for (let k = 0; k + BAND_BINS <= spectrum.power.length - 1; k += BAND_BINS) {
		let sum = 0;
		for (let j = 0; j < BAND_BINS; j++) sum += spectrum.power[k + j] as number;
		bands.push(sum / BAND_BINS);
	}
	const bandHz = BAND_BINS * spectrum.binHz;
	const from = Math.floor(1000 / bandHz);
	const to = Math.ceil(4000 / bandHz);
	let body = 0;
	for (let i = from; i < to; i++) body += bands[i] as number;
	body /= Math.max(1, to - from);
	if (!(body > 0)) return { cutoffHz: null, bandsDb: [] };
	const db = bands.map((p) => 10 * Math.log10(Math.max(p, 1e-30) / body));
	const active = db.map((v) => v > FLOOR_DB);
	// The first run of 3 active bands from the top is the edge of the content.
	let edge = -1;
	for (let i = active.length - 3; i >= 0; i--) {
		if (active[i] && active[i + 1] && active[i + 2]) {
			edge = i + 2;
			break;
		}
	}
	if (edge < 0) return { cutoffHz: null, bandsDb: db };
	// Walk up past a lone inactive band to the true edge.
	return { cutoffHz: Math.round((edge + 1) * bandHz), bandsDb: db };
}

// Measures where the audio's spectrum ends by decoding a few short clips and
// averaging their power spectra. One file per call (3 ffmpeg runs, ~100 ms
// each); the caller pools files.
export async function estimateCutoff(
	path: string,
	options: CutoffOptions = {},
): Promise<CutoffEstimate> {
	const bin = options.ffmpegPath ?? "ffmpeg";
	const clipSec = options.clipSec ?? 4;
	const timeoutMs = options.timeoutMs ?? 30_000;
	const duration = options.durationSec ?? 0;
	const fractions = options.offsets ?? [0.2, 0.5, 0.8];
	const starts =
		duration > clipSec * 3
			? fractions.map((f) =>
					Math.max(0, Math.min(duration - clipSec, duration * f)),
				)
			: [0];

	let spectrum: Spectrum | undefined;
	let clips = 0;
	let silent = 0;
	let failed = 0;
	for (const start of starts) {
		const clip = await decodeClip(path, start, clipSec, bin, timeoutMs);
		if (clip && "missing" in clip)
			return { cutoffHz: null, bandsDb: [], clips: 0, reason: "unavailable" };
		if (!clip) {
			failed++;
			continue;
		}
		if (rms(clip.samples) < 1e-4) {
			silent++;
			continue;
		}
		spectrum = meanSpectrum(
			clip.samples,
			RATE,
			FFT_SIZE,
			FFT_SIZE / 2,
			spectrum,
		);
		clips++;
	}
	if (!spectrum || clips === 0)
		return {
			cutoffHz: null,
			bandsDb: [],
			clips: 0,
			reason: silent > 0 && failed === 0 ? "silent" : "decode-failed",
		};
	const { cutoffHz, bandsDb } = cutoffFromSpectrum(spectrum);
	return {
		cutoffHz,
		bandsDb,
		clips,
		reason: cutoffHz === null ? "silent" : "ok",
	};
}

// -- verdict ---------------------------------------------------------------

export type BitrateVerdict = "ok" | "suspect" | "fake" | "unknown";

export interface BitrateAssessment {
	verdict: BitrateVerdict;
	cutoffHz: number | null;
	// The bitrate whose encoder lowpass matches the measured cutoff.
	likelySourceKbps: number | null;
	claimedKbps: number;
	explanation: string;
}

// Typical lowpass of common MP3 encoders (LAME CBR): a file whose audio ends
// at the lowpass of a lower bitrate was probably encoded from that bitrate.
const LOWPASS_KBPS: Array<[maxCutoffHz: number, kbps: number]> = [
	[15_200, 96],
	[16_600, 128],
	[17_800, 160],
	[19_200, 192],
	[19_900, 256],
	[Infinity, 320],
];

export function sourceBitrateForCutoff(cutoffHz: number): number {
	for (const [max, kbps] of LOWPASS_KBPS) if (cutoffHz < max) return kbps;
	return 320;
}

export interface AssessInput {
	cutoffHz: number | null;
	// The file's claimed bitrate; ignored for lossless.
	claimedKbps: number;
	lossless?: boolean;
	sampleRate?: number;
}

export function assessBitrate(input: AssessInput): BitrateAssessment {
	const claimed = input.lossless ? 320 : input.claimedKbps;
	const base = { cutoffHz: input.cutoffHz, claimedKbps: input.claimedKbps };
	if (input.cutoffHz === null || claimed <= 0)
		return {
			...base,
			verdict: "unknown",
			likelySourceKbps: null,
			explanation: "no measurable spectrum",
		};
	if (input.sampleRate && input.sampleRate < 44_100)
		return {
			...base,
			verdict: "unknown",
			likelySourceKbps: null,
			explanation: `sample rate ${input.sampleRate} Hz limits the spectrum`,
		};
	const source = sourceBitrateForCutoff(input.cutoffHz);
	const khz = (input.cutoffHz / 1000).toFixed(1);
	const what = input.lossless
		? "lossless file"
		: `${input.claimedKbps} kbps file`;
	const ratio = source / claimed;
	if (ratio <= 0.5)
		return {
			...base,
			verdict: "fake",
			likelySourceKbps: source,
			explanation: `${what} with content ending at ${khz} kHz: looks upscaled from about ${source} kbps`,
		};
	if (ratio < 0.75)
		return {
			...base,
			verdict: "suspect",
			likelySourceKbps: source,
			explanation: `${what} with content ending at ${khz} kHz: may come from about ${source} kbps`,
		};
	return {
		...base,
		verdict: "ok",
		likelySourceKbps: source,
		explanation: `content reaches ${khz} kHz, in line with ${claimed} kbps`,
	};
}

// Cutoff measurement and verdict in one call.
export async function checkBitrate(
	path: string,
	input: {
		claimedKbps: number;
		lossless?: boolean;
		sampleRate?: number;
	} & CutoffOptions,
): Promise<BitrateAssessment & { clips: number }> {
	const est = await estimateCutoff(path, input);
	return {
		...assessBitrate({ ...input, cutoffHz: est.cutoffHz }),
		clips: est.clips,
	};
}
