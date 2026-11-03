import { classifyMix } from "../dedupe/versions.ts";
import { fold, parseTitle, splitArtists } from "../normalize/index.ts";
import { ratio, tokenSetSimilarity } from "../similarity/index.ts";
import type { SoulseekFile } from "../slskd/types.ts";
import type { Want } from "../wishlist/types.ts";
import { type AuthenticityResult, assessAuthenticity } from "./authenticity.ts";
import { type ParsedPath, parseCandidatePath } from "./parse.ts";

// A format preference: first rule that matches decides the score (0..1).
export interface FormatRule {
	label: string;
	extensions: readonly string[];
	minBitrate?: number;
	// Matches only variable bitrate files (true) or constant (false).
	vbr?: boolean;
	score: number;
}

// lossless > 320 mp3 > V0 > the rest.
export const DEFAULT_FORMATS: readonly FormatRule[] = [
	{ label: "flac", extensions: ["flac"], score: 1 },
	{ label: "wav/aiff", extensions: ["wav", "aif", "aiff"], score: 0.95 },
	{ label: "alac/ape/wv", extensions: ["alac", "ape", "wv"], score: 0.9 },
	{ label: "mp3 320", extensions: ["mp3"], minBitrate: 315, score: 0.8 },
	{
		label: "mp3 V0",
		extensions: ["mp3"],
		minBitrate: 220,
		vbr: true,
		score: 0.72,
	},
	{ label: "mp3 256", extensions: ["mp3"], minBitrate: 250, score: 0.6 },
	{
		label: "m4a 256",
		extensions: ["m4a", "aac"],
		minBitrate: 250,
		score: 0.55,
	},
	{
		label: "mp3 192+",
		extensions: ["mp3", "m4a", "ogg"],
		minBitrate: 190,
		score: 0.35,
	},
	{
		label: "lossy",
		extensions: ["mp3", "m4a", "aac", "ogg", "opus", "wma"],
		score: 0.1,
	},
];

export interface RankOptions {
	formats?: readonly FormatRule[];
	// Reject below this format score (e.g. 0.5 refuses anything under 256). Default 0.
	minFormatScore?: number;
	// Title similarity under this rejects. Default 0.72.
	minTitleSimilarity?: number;
	// Artist similarity under this rejects when the file names an artist. Default 0.5.
	minArtistSimilarity?: number;
	// Reject peers whose queue is longer. Default none.
	maxQueue?: number;
	// Seconds of length slack before a duration mismatch counts. Default 8.
	durationSlackSec?: number;
	// Keep authenticity "fake" files in the list, flagged rejected. Always true;
	// callers filter on `rejected`.
	weights?: Partial<typeof WEIGHTS>;
}

const WEIGHTS = { match: 0.4, version: 0.15, format: 0.3, peer: 0.15 };

export interface RankedCandidate {
	file: SoulseekFile;
	parsed: ParsedPath;
	// 0..100; rejected candidates are ordered after the others.
	score: number;
	rejected: boolean;
	reasons: string[];
	parts: { match: number; version: number; format: number; peer: number };
	authenticity: AuthenticityResult;
	// Run the spectral cutoff check on the download before it is accepted.
	needsCutoffCheck: boolean;
}

function formatScore(
	f: SoulseekFile,
	rules: readonly FormatRule[],
): { score: number; label: string } {
	for (const r of rules) {
		if (!r.extensions.includes(f.extension)) continue;
		if (r.minBitrate !== undefined && (f.bitrate ?? 0) < r.minBitrate) continue;
		if (r.vbr !== undefined && (f.vbr === true) !== r.vbr) continue;
		return { score: r.score, label: r.label };
	}
	return { score: 0, label: f.extension || "unknown" };
}

function peerScore(f: SoulseekFile): number {
	const slot = f.freeUploadSlots ? 1 : 0;
	const queue = 1 / (1 + f.queueLength / 15);
	const speed = Math.min(f.uploadSpeed / 1_000_000, 1);
	return 0.45 * slot + 0.35 * queue + 0.2 * speed;
}

function wantMix(want: Pick<Want, "title" | "mix">) {
	const p = parseTitle(want.title);
	const name = want.mix?.trim() ? want.mix : p.mixName;
	return classifyMix(name, p.remixer);
}

// Penalty/verdict for the candidate's version against the wanted one.
function versionFit(
	want: ReturnType<typeof wantMix>,
	have: ReturnType<typeof classifyMix>,
): { score: number; reject: boolean; reason: string | null } {
	if (want.key === have.key) return { score: 1, reject: false, reason: null };
	const soft = new Set(["original", "extended", "radio", "club", "remaster"]);
	if (want.kind === "original") {
		if (soft.has(have.kind))
			return {
				score: 0.8,
				reject: false,
				reason: `${have.kind} cut of the original`,
			};
		return {
			score: 0,
			reject: true,
			reason: `wanted the original, file is ${have.kind}${have.remixer ? ` (${have.remixer})` : ""}`,
		};
	}
	if (want.kind === have.kind && want.kind !== "other") {
		// Same kind, other remixer: a different song for a DJ.
		return {
			score: 0,
			reject: true,
			reason: `different ${want.kind}: ${have.remixer ?? "?"} vs ${want.remixer ?? "?"}`,
		};
	}
	if (have.kind === "original")
		return {
			score: 0.1,
			reject: true,
			reason: `wanted ${want.kind}, file looks like the original`,
		};
	if (soft.has(want.kind) && soft.has(have.kind))
		return {
			score: 0.5,
			reject: false,
			reason: `${have.kind} instead of ${want.kind}`,
		};
	return {
		score: 0,
		reject: true,
		reason: `wanted ${want.kind}, file is ${have.kind}`,
	};
}

// Folded filename + folders, for the "artist is somewhere in the path" fallback.
const pathText = (p: string) => fold(p.replace(/\.[A-Za-z0-9]{1,5}$/, ""));

export function rankCandidates(
	want: Pick<Want, "artist" | "title" | "mix" | "durationSec">,
	files: readonly SoulseekFile[],
	options: RankOptions = {},
): RankedCandidate[] {
	const formats = options.formats ?? DEFAULT_FORMATS;
	const minTitle = options.minTitleSimilarity ?? 0.72;
	const minArtist = options.minArtistSimilarity ?? 0.5;
	const w = { ...WEIGHTS, ...options.weights };
	const wantTitleKey = fold(parseTitle(want.title).base);
	const wantArtistKey = splitArtists(want.artist).map(fold).join(" ");
	const wMix = wantMix(want);
	const slack = options.durationSlackSec ?? 8;

	const ranked = files.map((file): RankedCandidate => {
		const reasons: string[] = [];
		let rejected = false;
		const reject = (why: string) => {
			rejected = true;
			reasons.push(`rejected: ${why}`);
		};
		const parsed = parseCandidatePath(file.path);
		if (file.isLocked) reject("locked file");

		// Title: the parsed title, or the whole file name when parsing left junk.
		const candTitle = fold(parsed.title);
		const full = pathText(file.path);
		const containsTitle =
			wantTitleKey !== "" && ` ${full} `.includes(` ${wantTitleKey} `);
		const titleSim = Math.max(
			ratio(wantTitleKey, candTitle),
			tokenSetSimilarity(wantTitleKey, candTitle),
			containsTitle ? 0.8 : 0,
		);
		const candArtist = splitArtists(parsed.artist).map(fold).join(" ");
		let artistSim: number;
		if (candArtist !== "") {
			const wt = wantArtistKey.split(" ");
			artistSim = wt.every((t) => candArtist.includes(t))
				? 1
				: tokenSetSimilarity(wantArtistKey, candArtist);
		} else {
			const tokens = wantArtistKey.split(" ").filter(Boolean);
			const inPath = tokens.length > 0 && tokens.every((t) => full.includes(t));
			artistSim = inPath ? 0.75 : 0.3;
			if (!inPath) reasons.push("artist not found in path");
		}
		if (titleSim < minTitle) reject(`title mismatch (${titleSim.toFixed(2)})`);
		if (candArtist !== "" && artistSim < minArtist)
			reject(`artist mismatch (${artistSim.toFixed(2)})`);
		const match = 0.65 * titleSim + 0.35 * artistSim;
		if (titleSim >= 0.95 && artistSim >= 0.95)
			reasons.push("title and artist match");

		const mixName = parsed.mixName ?? mixFromPath(file.path);
		const fit = versionFit(wMix, classifyMix(mixName, parsed.remixer));
		if (fit.reason) reasons.push(fit.reason);
		if (fit.reject) reject("wrong version");

		const fmt = formatScore(file, formats);
		reasons.push(`format ${fmt.label}`);
		if (fmt.score < (options.minFormatScore ?? 0))
			reject(`format ${fmt.label} below preference`);

		const authenticity = assessAuthenticity(file);
		reasons.push(...authenticity.reasons);
		let authFactor = 1;
		if (authenticity.verdict === "fake") reject("likely fake or truncated");
		else if (authenticity.verdict === "suspect") authFactor = 0.7;
		else if (authenticity.verdict === "unverifiable") authFactor = 0.9;

		if (want.durationSec && file.length) {
			const diff = Math.abs(want.durationSec - file.length);
			if (diff > slack && diff / want.durationSec > 0.1) {
				reasons.push(
					`length ${Math.round(file.length)}s vs wanted ${Math.round(want.durationSec)}s`,
				);
				if (diff / want.durationSec > 0.3) reject("length far from wanted");
				else authFactor *= 0.8;
			}
		}

		if (options.maxQueue !== undefined && file.queueLength > options.maxQueue)
			reject(`queue ${file.queueLength}`);
		const peer = peerScore(file);
		reasons.push(
			file.freeUploadSlots ? "free slot" : `queue ${file.queueLength}`,
		);

		const score =
			100 *
			authFactor *
			(w.match * match +
				w.version * fit.score +
				w.format * fmt.score +
				w.peer * peer);
		return {
			file,
			parsed,
			score: Math.round(score * 10) / 10,
			rejected,
			reasons,
			parts: { match, version: fit.score, format: fmt.score, peer },
			authenticity,
			needsCutoffCheck: authenticity.needsCutoffCheck,
		};
	});
	return ranked.sort(
		(a, b) => Number(a.rejected) - Number(b.rejected) || b.score - a.score,
	);
}

// A mix named only in a folder ("... (Extended Mix)") still counts.
function mixFromPath(path: string): string | null {
	const dir = path.split(/[\\/]+/).slice(-2, -1)[0] ?? "";
	return parseTitle(dir).mixName;
}
