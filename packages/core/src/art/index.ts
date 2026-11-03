import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../exec/index.ts";
import { TokenBucket } from "../providers/http.ts";
import type { Candidate } from "../providers/types.ts";
import { type CoverPicture, readPicture, writeTags } from "../tags/index.ts";
import { type ImageInfo, imageInfo } from "./image.ts";

export { type ImageInfo, imageInfo } from "./image.ts";

export interface CoverImage extends ImageInfo {
	data: Uint8Array;
	url: string;
	// Where the URL came from.
	source: string;
}

export interface CoverPolicy {
	// Smallest acceptable side. Default 500.
	minSide?: number;
	// Largest side worth keeping before a resize is suggested. Default 1600.
	maxSide?: number;
	// Width/height may differ by this fraction and still be "square". Default 0.02.
	squareTolerance?: number;
}

const isSquare = (i: ImageInfo, tol: number): boolean =>
	Math.abs(i.width - i.height) / Math.max(i.width, i.height) <= tol;

// Best image: square and at least minSide, closest to (but not above) maxSide,
// JPEG over PNG at equal size (embedded PNG covers are several times larger).
// When nothing qualifies, the largest image of any shape, flagged `acceptable: false`.
export function chooseCover<T extends ImageInfo>(
	images: readonly T[],
	policy: CoverPolicy = {},
): { best: T; acceptable: boolean } | null {
	const min = policy.minSide ?? 500;
	const max = policy.maxSide ?? 1600;
	const tol = policy.squareTolerance ?? 0.02;
	const side = (i: ImageInfo) => Math.min(i.width, i.height);
	const good = images.filter((i) => isSquare(i, tol) && side(i) >= min);
	if (good.length > 0) {
		const score = (i: ImageInfo) => {
			const s = side(i);
			return (
				(s > max ? max - (s - max) * 0.5 : s) +
				(i.mime === "image/jpeg" ? 1 : 0)
			);
		};
		return {
			best: [...good].sort((a, b) => score(b) - score(a))[0] as T,
			acceptable: true,
		};
	}
	const largest = [...images].sort((a, b) => side(b) - side(a))[0];
	return largest ? { best: largest, acceptable: false } : null;
}

export interface CoverFetchOptions {
	fetch?: typeof fetch;
	// e.g. "TrackVault/1.0 (you@example.com)"; Cover Art Archive asks for one.
	userAgent: string;
	// Cap on bytes per image. Default 8 MB.
	maxBytes?: number;
	signal?: AbortSignal;
}

// The URLs candidates offer: their own coverUrl claims, then the Cover Art
// Archive's 1200 px front image for each MusicBrainz release id.
export function coverUrls(
	candidates: readonly Candidate[],
): Array<{ url: string; source: string }> {
	const seen = new Set<string>();
	const out: Array<{ url: string; source: string }> = [];
	const add = (url: string, source: string) => {
		if (!seen.has(url)) {
			seen.add(url);
			out.push({ url, source });
		}
	};
	const sorted = [...candidates].sort(
		(a, b) => b.matchConfidence - a.matchConfidence,
	);
	for (const c of sorted) {
		const rel = c.fields.releaseMbid?.value;
		if (typeof rel === "string")
			add(
				`https://coverartarchive.org/release/${rel}/front-1200`,
				"coverartarchive",
			);
		const url = c.fields.coverUrl?.value;
		if (typeof url === "string") add(url, c.provider);
	}
	return out;
}

const limiter = new TokenBucket(2, 4);

// Downloads and measures each source (best candidate first), then chooses.
// Unreachable or non-image URLs are skipped.
export async function fetchBestCover(
	candidates: readonly Candidate[],
	options: CoverFetchOptions & CoverPolicy,
): Promise<{ cover: CoverImage | null; acceptable: boolean; tried: number }> {
	const doFetch = options.fetch ?? fetch;
	const found: CoverImage[] = [];
	let tried = 0;
	for (const { url, source } of coverUrls(candidates).slice(0, 5)) {
		tried++;
		await limiter.take();
		try {
			const res = await doFetch(url, {
				headers: { "user-agent": options.userAgent },
				signal: options.signal,
			});
			if (!res.ok) continue;
			const data = new Uint8Array(await res.arrayBuffer());
			if (data.length > (options.maxBytes ?? 8 * 1024 * 1024)) continue;
			const info = imageInfo(data);
			if (info) found.push({ ...info, data, url, source });
		} catch {
			// next source
		}
		// Stop at the first image that already meets the policy.
		const pick = chooseCover(found, options);
		if (pick?.acceptable) return { cover: pick.best, acceptable: true, tried };
	}
	const pick = chooseCover(found, options);
	return {
		cover: pick?.best ?? null,
		acceptable: pick?.acceptable ?? false,
		tried,
	};
}

// Scales to at most `maxSide` and re-encodes as JPEG via ffmpeg (no pure-JS
// image codec is light enough to carry). Returns the input unchanged when
// ffmpeg is missing or the image is already small enough.
export async function resizeCover(
	cover: Pick<CoverImage, "data" | "width" | "height" | "mime">,
	maxSide = 1000,
	ffmpegPath = "ffmpeg",
): Promise<CoverPicture & ImageInfo> {
	const unchanged = {
		mime: cover.mime,
		data: cover.data,
		width: cover.width,
		height: cover.height,
	};
	if (Math.max(cover.width, cover.height) <= maxSide) return unchanged;
	const dir = await mkdtemp(join(tmpdir(), "tvcover-"));
	try {
		const input = join(dir, cover.mime === "image/png" ? "in.png" : "in.jpg");
		const output = join(dir, "out.jpg");
		await writeFile(input, cover.data);
		const r = await run(
			ffmpegPath,
			[
				"-nostdin",
				"-v",
				"error",
				"-i",
				input,
				"-vf",
				`scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease`,
				"-q:v",
				"3",
				"-y",
				output,
			],
			{ timeoutMs: 30_000 },
		);
		if (r.missing || r.code !== 0) return unchanged;
		const data = new Uint8Array(await readFile(output));
		const info = imageInfo(data);
		return info ? { ...info, data } : unchanged;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

// Embeds the picture as the file's front cover, replacing any others.
export function embedCover(path: string, picture: CoverPicture): Promise<void> {
	return writeTags(path, { picture });
}

export function removeCover(path: string): Promise<void> {
	return writeTags(path, { picture: null });
}

// The embedded picture of a file (any format), with its measured size; null when none.
export async function readEmbeddedCover(
	path: string,
): Promise<CoverImage | null> {
	const picture = await readPicture(path);
	if (!picture) return null;
	const info = imageInfo(picture.data);
	return info
		? { ...info, data: picture.data, url: "", source: "embedded" }
		: null;
}
