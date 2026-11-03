import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// A track's waveform: this many values (0..255, the loudest stretch 255), one byte
// each, from the first sample to the last. A small file beside the database.
export const PEAK_VALUES = 1000;

// Decoded at this rate, mono: the shape of a waveform needs no more.
const DECODE_RATE = 4000;

// Where a track's peaks live: a folder per two characters of the id keeps the
// directories short at 50k tracks.
export function peaksPath(trackId: string): string {
	const file = process.env.DB_FILE;
	if (!file) throw new Error("DB_FILE is not set");
	return join(
		dirname(file),
		"peaks",
		trackId.slice(0, 2).replace(/[^\w-]/g, "_"),
		`${trackId.replace(/[^\w-]/g, "_")}.bin`,
	);
}

export const hasPeaks = (trackId: string): boolean =>
	existsSync(peaksPath(trackId));

let ffmpegFound: boolean | undefined;

// Peaks are made by ffmpeg, which must be on the hub's PATH.
export function hasFfmpeg(): boolean {
	ffmpegFound ??=
		spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
	return ffmpegFound;
}

// Decodes `file` and reduces it to `PEAK_VALUES` magnitudes. Runs at the lowest
// CPU priority (`nice`) so a scan and the browser are not slowed by it.
export function computePeaks(
	file: string,
	signal: AbortSignal,
): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			"nice",
			[
				"-n",
				"19",
				"ffmpeg",
				"-v",
				"error",
				"-i",
				file,
				"-vn",
				"-ac",
				"1",
				"-ar",
				String(DECODE_RATE),
				"-f",
				"s16le",
				"-",
			],
			{ stdio: ["ignore", "pipe", "pipe"], signal },
		);
		const chunks: Buffer[] = [];
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => {
			if (stderr.length < 500) stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`));
				return;
			}
			const pcm = Buffer.concat(chunks);
			const samples = Math.floor(pcm.length / 2);
			if (samples === 0) {
				reject(new Error("no audio decoded"));
				return;
			}
			const peaks = new Float64Array(PEAK_VALUES);
			for (let i = 0; i < samples; i++) {
				const bucket = Math.min(
					PEAK_VALUES - 1,
					Math.floor((i * PEAK_VALUES) / samples),
				);
				const value = Math.abs(pcm.readInt16LE(i * 2));
				if (value > (peaks[bucket] as number)) peaks[bucket] = value;
			}
			const loudest = Math.max(...peaks, 1);
			resolve(
				Uint8Array.from(peaks, (value) => Math.round((value / loudest) * 255)),
			);
		});
	});
}
