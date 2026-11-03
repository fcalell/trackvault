import { isLossless } from "../dedupe/keeper.ts";

export type TrackId = string | number;

export interface IncomingFacts {
	format: string;
	bitrateKbps: number;
	sampleRate?: number;
	bitDepth?: number;
	durationMs?: number | null;
	// Decode check failed.
	corrupt?: boolean;
	// Spectral cutoff check says the claim is a transcode.
	likelyTranscode?: boolean;
	// Metadata said fake (ranking/authenticity) and nothing disproved it.
	suspectedFake?: boolean;
}

export interface ExistingFacts {
	format: string;
	bitrateKbps: number;
	sampleRate?: number;
	bitDepth?: number;
	likelyTranscode?: boolean;
}

export interface InboxMatch {
	trackId: TrackId;
	// exact: same audio hash. acoustic: fingerprint. fuzzy: tags only.
	kind: "exact" | "acoustic" | "fuzzy";
	// 0..1
	confidence: number;
	// Mix/version comparison done by the caller (dedupe/versions classifyMix).
	// "different" matches are not duplicates and are ignored here.
	version: "same" | "different" | "unknown";
	existing: ExistingFacts;
}

export type InboxDecision =
	| { kind: "accept"; reason: string }
	| { kind: "duplicate-of"; trackId: TrackId; reason: string }
	| { kind: "better-than-existing"; replaces: TrackId; reason: string }
	| { kind: "needs-review"; reason: string; candidates: TrackId[] };

export interface DecisionOptions {
	// Lossy-vs-lossy: the incoming must beat the existing by this many kbps. Default 64.
	bitrateMarginKbps?: number;
	// Fuzzy matches under this need a person. Default 0.9.
	fuzzyConfidence?: number;
	// Acoustic matches under this need a person. Default 0.85.
	acousticConfidence?: number;
}

// 0 transcode/lossy-low .. higher is better. Lossless outranks any lossy;
// a transcode counts as the lossy file it really is (bitrate capped at 192).
function quality(f: IncomingFacts | ExistingFacts): number {
	const lossless = isLossless(f.format) && !f.likelyTranscode;
	if (lossless)
		return 10_000 + (f.bitDepth ?? 16) * 10 + (f.sampleRate ?? 44_100) / 1000;
	return f.likelyTranscode ? Math.min(f.bitrateKbps, 192) : f.bitrateKbps;
}

export function inboxDecision(
	item: IncomingFacts,
	matches: readonly InboxMatch[],
	options: DecisionOptions = {},
): InboxDecision {
	if (item.corrupt)
		return {
			kind: "needs-review",
			reason: "file fails the decode check",
			candidates: matches.map((m) => m.trackId),
		};
	const relevant = matches.filter((m) => m.version !== "different");
	const fuzzyAt = options.fuzzyConfidence ?? 0.9;
	const acousticAt = options.acousticConfidence ?? 0.85;
	const strong = relevant.filter(
		(m) =>
			m.kind === "exact" ||
			(m.kind === "acoustic" && m.confidence >= acousticAt) ||
			(m.kind === "fuzzy" && m.confidence >= fuzzyAt),
	);
	const weak = relevant.filter((m) => !strong.includes(m));

	if (strong.length === 0) {
		if (weak.length > 0)
			return {
				kind: "needs-review",
				reason: "possible duplicate, not certain",
				candidates: weak.map((m) => m.trackId),
			};
		if (item.likelyTranscode || item.suspectedFake)
			return {
				kind: "needs-review",
				reason: item.likelyTranscode
					? "looks like a transcode"
					: "bitrate claim looks fake",
				candidates: [],
			};
		return {
			kind: "accept",
			reason:
				matches.length > 0 ? "only other versions in the library" : "new track",
		};
	}

	const exact = strong.find((m) => m.kind === "exact");
	if (exact)
		return {
			kind: "duplicate-of",
			trackId: exact.trackId,
			reason: "identical audio",
		};

	// Several different tracks claim it: the library itself has duplicates here.
	const ids = [...new Set(strong.map((m) => m.trackId))];
	const best = [...strong].sort(
		(a, b) => quality(b.existing) - quality(a.existing),
	)[0] as InboxMatch;
	if (ids.length > 1)
		return {
			kind: "needs-review",
			reason: "matches several tracks",
			candidates: ids,
		};

	const margin = options.bitrateMarginKbps ?? 64;
	const inQ = quality(item);
	const exQ = quality(best.existing);
	const trusted = !item.likelyTranscode && !item.suspectedFake;
	const upgrade =
		trusted &&
		(exQ < 10_000 && inQ >= 10_000
			? true
			: inQ >= 10_000 && exQ >= 10_000
				? inQ - exQ >= 20
				: inQ - exQ >= margin);
	if (upgrade)
		return {
			kind: "better-than-existing",
			replaces: best.trackId,
			reason: `${item.format} ${item.bitrateKbps} kbps beats ${best.existing.format} ${best.existing.bitrateKbps} kbps`,
		};
	return {
		kind: "duplicate-of",
		trackId: best.trackId,
		reason:
			best.kind === "acoustic"
				? "same recording, no better"
				: "same song, no better",
	};
}
