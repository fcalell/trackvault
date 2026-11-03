import { run } from "../exec/index.ts";

export interface DecodeOptions {
	ffmpegPath?: string;
	// Seek in seconds (before -i: fast, keyframe-accurate enough for analysis).
	startSec?: number;
	// Seconds to decode; omitted decodes to the end.
	durationSec?: number;
	// Default 44100.
	sampleRate?: number;
	timeoutMs?: number;
}

// How long ffmpeg may take over `seconds` of audio: a floor for starting it and
// opening the file, plus one second per second of audio, so a decoder running no
// faster than real time (a busy, niced box) still finishes whatever the length.
export const decodeBudgetMs = (seconds: number): number =>
	120_000 + seconds * 1000;

export type DecodeResult =
	| { ok: true; samples: Float32Array; sampleRate: number }
	| { ok: false; reason: "unavailable" | "timeout" | "failed" };

// Mono float PCM through ffmpeg. One file per call.
export async function decodeMono(
	path: string,
	options: DecodeOptions = {},
): Promise<DecodeResult> {
	const rate = options.sampleRate ?? 44_100;
	const args = ["-nostdin", "-v", "error"];
	if (options.startSec) args.push("-ss", options.startSec.toFixed(2));
	if (options.durationSec) args.push("-t", String(options.durationSec));
	args.push(
		"-i",
		path,
		"-vn",
		"-ac",
		"1",
		"-ar",
		String(rate),
		"-f",
		"f32le",
		"-",
	);
	const r = await run(options.ffmpegPath ?? "ffmpeg", args, {
		timeoutMs: options.timeoutMs ?? decodeBudgetMs(options.durationSec ?? 0),
		maxStdoutBytes: options.durationSec
			? rate * 4 * (options.durationSec + 2)
			: undefined,
	});
	if (r.missing) return { ok: false, reason: "unavailable" };
	if (r.timedOut) return { ok: false, reason: "timeout" };
	const buf = r.stdout;
	if (buf.length < 4) return { ok: false, reason: "failed" };
	const samples = new Float32Array(
		buf.buffer.slice(
			buf.byteOffset,
			buf.byteOffset + buf.length - (buf.length % 4),
		),
	);
	return { ok: true, samples, sampleRate: rate };
}

export function rms(samples: Float32Array): number {
	let s = 0;
	for (let i = 0; i < samples.length; i++) s += (samples[i] as number) ** 2;
	return Math.sqrt(s / Math.max(1, samples.length));
}
