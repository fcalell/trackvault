import { run } from "../exec/index.ts";
import { type Estimate, none } from "./types.ts";

export interface Loudness {
	// Integrated loudness, LUFS.
	integratedLufs: number;
	// Loudness range, LU.
	lra: number;
	// True peak, dBTP.
	truePeakDb: number;
}

export interface LoudnessOptions {
	ffmpegPath?: string;
	timeoutMs?: number;
}

// Parses the summary ffmpeg's ebur128 filter prints on stderr.
export function parseEbur128(stderr: string): Loudness | null {
	const at = stderr.lastIndexOf("Summary:");
	const text = at >= 0 ? stderr.slice(at) : stderr;
	const num = (re: RegExp): number | null => {
		const m = re.exec(text);
		return m ? Number(m[1]) : null;
	};
	const integratedLufs = num(/\bI:\s+(-?[\d.]+|-?inf)\s+LUFS/);
	const lra = num(/\bLRA:\s+(-?[\d.]+)\s+LU\b/);
	const truePeakDb = num(/\bPeak:\s+(-?[\d.]+)\s+dBFS/);
	if (integratedLufs === null || !Number.isFinite(integratedLufs)) return null;
	return {
		integratedLufs,
		lra: lra ?? 0,
		truePeakDb: truePeakDb ?? Number.NaN,
	};
}

// EBU R128 over the whole file (a full decode: ~1 s for a 6 minute track).
export async function measureLoudness(
	path: string,
	options: LoudnessOptions = {},
): Promise<Estimate<Loudness>> {
	const r = await run(
		options.ffmpegPath ?? "ffmpeg",
		[
			"-nostdin",
			"-nostats",
			"-hide_banner",
			"-i",
			path,
			"-vn",
			"-af",
			"ebur128=peak=true",
			"-f",
			"null",
			"-",
		],
		{
			timeoutMs: options.timeoutMs ?? 120_000,
			maxStderrBytes: 8 * 1024 * 1024,
		},
	);
	if (r.missing) return none("unavailable");
	if (r.timedOut) return none("decode-failed");
	const parsed = parseEbur128(r.stderr);
	return parsed ? { value: parsed, confidence: 1 } : none("decode-failed");
}
