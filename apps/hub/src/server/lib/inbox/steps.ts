import { stat } from "node:fs/promises";
import { analyzeFile } from "@trackvault/core/analyze";
import {
	classifyMix,
	compareFingerprints,
	fingerprintFile,
	fingerprintFromBytes,
	fingerprintToBytes,
} from "@trackvault/core/dedupe";
import { binaryAvailable } from "@trackvault/core/exec";
import {
	type ExistingFacts,
	type InboxDecision,
	type InboxMatch,
	type InboxStepId,
	inboxDecision,
	type StepOutcome,
} from "@trackvault/core/inbox";
import { ISSUE } from "@trackvault/core/issues";
import { composeTitle, normalizeTrack } from "@trackvault/core/normalize";
import { planMoves } from "@trackvault/core/organize";
import { safeJoin } from "@trackvault/core/paths";
import type { PlanField } from "@trackvault/core/providers";
import { checkBitrate } from "@trackvault/core/quality";
import { alreadyInLibrary, parseCandidatePath } from "@trackvault/core/ranking";
import {
	applyRules,
	RULE_FIELDS,
	type Rule,
	type RulePatch,
	type RuleTrack,
} from "@trackvault/core/rules";
import { formatOf } from "@trackvault/core/tags";
import { resolveName } from "@trackvault/core/taxonomy";
import { buildProviders, factsOf, planTrack, policyOf } from "../autotag.ts";
import { hubLibraryIndex } from "../library-index.ts";
import { losslessOf, qualityFormat } from "../lossless.ts";
import { freeName } from "../quarantine.ts";
import { statement } from "../raw.ts";
import type { SettingsRow } from "../settings.ts";
import type { Taxonomies } from "../taxonomy.ts";
import type { TagKey, TagValues } from "../track-fields.ts";
import {
	effectiveTags,
	type ItemRow,
	type MatchView,
	type Override,
	proposedOf,
	tagsOf,
} from "./items.ts";

// What every step of a pass shares, read once.
export interface StepEnv {
	root: string;
	settings: SettingsRow;
	rules: Rule[];
	taxonomies: Taxonomies;
	signal: AbortSignal;
}

// A step's verdict, and the columns it sets on the item.
export interface StepRun {
	outcome: StepOutcome;
	patch?: Partial<ItemRow>;
}

type Handler = (row: ItemRow, env: StepEnv) => Promise<StepRun>;

const abs = (row: ItemRow, env: StepEnv): string =>
	safeJoin(env.root, row.path);

// -- hash ------------------------------------------------------------------

const hash: Handler = async (row, env) => {
	if (!formatOf(row.path))
		return {
			outcome: {
				kind: "fail",
				error: `${extensionName(row.path)} files cannot be read yet`,
				retryable: false,
			},
		};
	const analysis = await analyzeFile(abs(row, env));
	if (analysis.size === 0)
		return {
			outcome: { kind: "fail", error: "The file is empty", retryable: false },
		};
	return {
		outcome: {
			kind: "done",
			output: {
				audioHash: analysis.audioHash,
				format: analysis.audio.format,
				bitrate: analysis.audio.bitrateKbps,
			},
		},
		patch: {
			audioHash: analysis.audioHash,
			fileHash: analysis.fileHash,
			size: analysis.size,
			format: analysis.audio.format,
			codec: analysis.audio.codec || null,
			bitrate: analysis.audio.bitrateKbps || null,
			sampleRate: analysis.audio.sampleRate || null,
			bitDepth: analysis.audio.bitDepth || null,
			durationMs: analysis.audio.durationMs || null,
			hasArt: analysis.hasArt,
			corrupt: !analysis.framesFound,
			tags: analysis.tags,
		},
	};
};

const extensionName = (path: string): string =>
	path.slice(path.lastIndexOf(".")).toLowerCase();

// -- fingerprint -----------------------------------------------------------

const fingerprint: Handler = async (row, env) => {
	if (!(await binaryAvailable("fpcalc", "-version")))
		return {
			outcome: {
				kind: "skip",
				reason: "needs fpcalc (Chromaprint) on the hub",
			},
		};
	const found = await fingerprintFile(abs(row, env));
	if (!found.ok)
		return { outcome: { kind: "skip", reason: `fpcalc ${found.reason}` } };
	return {
		outcome: { kind: "done", output: { items: found.fingerprint.length } },
		patch: { fingerprint: Buffer.from(fingerprintToBytes(found.fingerprint)) },
	};
};

// -- dedupe ----------------------------------------------------------------

interface Candidate {
	id: string;
	title: string | null;
	artist: string | null;
	mixName: string | null;
	remixer: string | null;
	format: string;
	codec: string | null;
	bitDepth: number | null;
	bitrate: number | null;
	sampleRate: number | null;
	verdict: string | null;
}

const CANDIDATE = `SELECT t.id, t.title, t.artist, t.mix_name AS mixName, t.remixer, t.format, t.codec, t.bit_depth AS bitDepth,
	t.bitrate, t.sample_rate AS sampleRate, h.bitrate_verdict AS verdict
	FROM tracks t LEFT JOIN health_checks h ON h.track_id = t.id`;

const candidateById = (id: string): Candidate | undefined =>
	statement(`${CANDIDATE} WHERE t.id = @id`).get({ id }) as
		| Candidate
		| undefined;

const label = (c: Pick<Candidate, "artist" | "title">): string =>
	[c.artist, c.title ?? "Untitled"].filter(Boolean).join(" - ");

const existingFacts = (c: Candidate): ExistingFacts => ({
	format: qualityFormat(c.format, c.codec),
	...(c.bitDepth ? { bitDepth: c.bitDepth } : {}),
	bitrateKbps: c.bitrate ?? 0,
	...(c.sampleRate ? { sampleRate: c.sampleRate } : {}),
	likelyTranscode: c.verdict === "fake",
});

// The title and artist the file carries, or what its name says when it has none.
export function identityOf(row: ItemRow): {
	artist: string;
	title: string;
} {
	const tags = effectiveTags(row);
	const named = parseCandidatePath(row.path);
	return {
		artist: String(tags.artist ?? named.artist ?? ""),
		title: String(tags.title ?? composeTitle(named.title, named.mixName)),
	};
}

async function cutoffOf(
	row: ItemRow,
	env: StepEnv,
): Promise<ItemRow["cutoff"]> {
	if (!row.needsCutoffCheck) return row.cutoff ?? null;
	if (row.cutoff) return row.cutoff;
	if (!(await binaryAvailable("ffmpeg", "-version")))
		return { verdict: "unknown", explanation: "needs ffmpeg on the hub" };
	const result = await checkBitrate(abs(row, env), {
		claimedKbps: row.bitrate ?? 0,
		lossless: losslessOf(row.format ?? "", row.codec),
		...(row.sampleRate ? { sampleRate: row.sampleRate } : {}),
	});
	return {
		verdict: result.verdict,
		cutoffHz: result.cutoffHz,
		likelySourceKbps: result.likelySourceKbps,
		explanation: result.explanation,
	};
}

// Everything in the library that is this recording or this song: the same audio, the
// same sound by fingerprint, or the same artist and title.
async function findMatches(row: ItemRow): Promise<InboxMatch[]> {
	const found = new Map<string, InboxMatch>();
	const keep = (match: InboxMatch): void => {
		const was = found.get(String(match.trackId));
		const rank = { exact: 3, acoustic: 2, fuzzy: 1 } as const;
		if (
			!was ||
			rank[match.kind] > rank[was.kind] ||
			(match.kind === was.kind && match.confidence > was.confidence)
		)
			found.set(String(match.trackId), match);
	};
	const who = identityOf(row);
	const incoming = classifyMix(
		normalizeTrack({ title: who.title, artist: who.artist }).mixName,
		normalizeTrack({ title: who.title, artist: who.artist }).remixer,
	);

	if (row.audioHash)
		for (const c of statement(
			`${CANDIDATE} WHERE t.audio_hash = @h AND (t.issues & ${ISSUE.quarantined}) = 0`,
		).all({ h: row.audioHash }) as Candidate[])
			keep({
				trackId: c.id,
				kind: "exact",
				confidence: 1,
				version: "same",
				existing: existingFacts(c),
			});

	if (row.fingerprint && row.durationMs) {
		const print = fingerprintFromBytes(row.fingerprint);
		const near = statement(
			`SELECT t.id, f.data FROM tracks t JOIN fingerprints f ON f.track_id = t.id
			 WHERE t.duration_ms BETWEEN @lo AND @hi AND (t.issues & ${ISSUE.quarantined}) = 0 LIMIT 600`,
		).all({ lo: row.durationMs - 3000, hi: row.durationMs + 3000 }) as Array<{
			id: string;
			data: Buffer;
		}>;
		for (const other of near) {
			const best = compareFingerprints(print, fingerprintFromBytes(other.data));
			if (!best || best.ber > 0.25) continue;
			const c = candidateById(other.id);
			if (!c) continue;
			const theirs = normalizeTrack({ title: c.title, artist: c.artist });
			keep({
				trackId: c.id,
				kind: "acoustic",
				confidence: Math.max(0.5, Math.min(1, 1 - best.ber * 1.5)),
				version:
					classifyMix(theirs.mixName, theirs.remixer).key === incoming.key
						? "same"
						: "different",
				existing: existingFacts(c),
			});
		}
	}

	if (who.title) {
		const have = await alreadyInLibrary(
			{
				artist: who.artist,
				title: who.title,
				...(row.durationMs ? { durationSec: row.durationMs / 1000 } : {}),
			},
			hubLibraryIndex,
			{ haveAt: 0.78, maybeAt: 0.78 },
		);
		for (const entry of have.entries) {
			const c = candidateById(String(entry.id));
			if (!c) continue;
			keep({
				trackId: c.id,
				kind: "fuzzy",
				confidence: entry.confidence,
				version: entry.sameVersion ? "same" : "different",
				existing: existingFacts(c),
			});
		}
	}
	return [...found.values()];
}

function viewOf(match: InboxMatch): MatchView {
	const c = candidateById(String(match.trackId));
	return {
		trackId: String(match.trackId),
		label: c ? label(c) : String(match.trackId),
		kind: match.kind,
		confidence: Math.round(match.confidence * 100) / 100,
		version: match.version,
		format: match.existing.format,
		bitrate: match.existing.bitrateKbps || null,
	};
}

const dedupe: Handler = async (row, env) => {
	const cutoff = await cutoffOf(row, env);
	const patch: Partial<ItemRow> = { cutoff };

	// The same audio already waits in the inbox: the earlier one is the original.
	if (row.audioHash && !row.override) {
		const twin = statement(
			`SELECT id FROM inbox_items WHERE audio_hash = @h AND id != @id
			 AND state NOT IN ('rejected', 'approved', 'failed')
			 AND (created_at < @at OR (created_at = @at AND id < @id)) LIMIT 1`,
		).get({ h: row.audioHash, id: row.id, at: row.createdAt.getTime() }) as
			| { id: string }
			| undefined;
		if (twin) {
			const decision: InboxDecision = {
				kind: "duplicate-of",
				trackId: `inbox:${twin.id}`,
				reason: "same audio as another file in the inbox",
			};
			return {
				outcome: {
					kind: "halt",
					state: "duplicate",
					reason: decision.reason,
					output: decision,
				},
				patch: {
					...patch,
					decision,
					decisionKind: decision.kind,
					matches: [],
				},
			};
		}
	}

	const matches = await findMatches(row);
	const override = row.override as Override | null;
	const verdict = (cutoff as { verdict?: string } | null)?.verdict;
	let decision: InboxDecision;
	if (override?.kind === "replace") {
		decision = {
			kind: "better-than-existing",
			replaces: override.trackId,
			reason: "you chose to replace it",
		};
	} else if (override?.kind === "accept") {
		decision = { kind: "accept", reason: "you chose to keep it" };
	} else {
		decision = inboxDecision(
			{
				format: qualityFormat(row.format ?? "mp3", row.codec),
				...(row.bitDepth ? { bitDepth: row.bitDepth } : {}),
				bitrateKbps: row.bitrate ?? 0,
				...(row.sampleRate ? { sampleRate: row.sampleRate } : {}),
				...(row.durationMs ? { durationMs: row.durationMs } : {}),
				corrupt: row.corrupt,
				likelyTranscode: verdict === "fake",
				suspectedFake: verdict === "suspect",
			},
			matches,
			{
				bitrateMarginKbps: env.settings.inboxBitrateMarginKbps,
				fuzzyConfidence: env.settings.inboxFuzzyPercent / 100,
				acousticConfidence: env.settings.inboxAcousticPercent / 100,
			},
		);
	}
	Object.assign(patch, {
		decision,
		decisionKind: decision.kind,
		matches: matches.map(viewOf),
	});
	if (decision.kind === "duplicate-of")
		return {
			outcome: {
				kind: "halt",
				state: "duplicate",
				reason: decision.reason,
				output: decision,
			},
			patch,
		};
	if (decision.kind === "needs-review")
		return {
			outcome: {
				kind: "halt",
				state: "needs-review",
				reason: decision.reason,
				output: decision,
			},
			patch,
		};
	return { outcome: { kind: "done", output: decision }, patch };
};

// -- rules -----------------------------------------------------------------

const _RULE_NUMBERS = new Set(["year", "bpm", "rating", "energy"]);
const TAG_KEY_SET = new Set<string>([
	"title",
	"artist",
	"albumArtist",
	"album",
	"remixer",
	"label",
	"genre",
	"isrc",
	"key",
	"comment",
	"year",
	"bpm",
	"energy",
	"rating",
]);

function ruleTrackOf(tags: Record<string, string | number | null>): RuleTrack {
	const out: RuleTrack = {};
	for (const field of RULE_FIELDS) {
		if (field === "featured") continue;
		out[field] = tags[field] ?? null;
	}
	return out;
}

function addProposed(
	proposed: TagValues,
	patch: RulePatch,
): Array<{ field: string; before: unknown; after: unknown }> {
	const changed: Array<{ field: string; before: unknown; after: unknown }> = [];
	for (const [field, value] of Object.entries(patch)) {
		if (!TAG_KEY_SET.has(field)) continue;
		(proposed as Record<string, unknown>)[field] = value;
		changed.push({ field, before: null, after: value });
	}
	return changed;
}

const rules: Handler = async (row, env) => {
	const raw = tagsOf(row) as Record<string, string | number | null>;
	const proposed: TagValues = { ...proposedOf(row) };
	const notes: string[] = [];

	// A file with no tags is named by its file name.
	if (!raw.title && !raw.artist) {
		const named = parseCandidatePath(row.path);
		const patch: RulePatch = {};
		if (named.artist) patch.artist = named.artist;
		patch.title = composeTitle(named.title, named.mixName);
		addProposed(proposed, patch);
		notes.push("tags read from the file name");
	}
	if (env.rules.length === 0 && notes.length === 0)
		return {
			outcome: { kind: "skip", reason: "no cleanup rules are switched on" },
		};

	const current = { ...raw, ...proposed } as Record<
		string,
		string | number | null
	>;
	let matched: string[] = [];
	if (env.rules.length > 0) {
		const result = applyRules(ruleTrackOf(current), env.rules, {
			taxonomies: env.taxonomies,
		});
		addProposed(proposed, result.patch);
		matched = result.matched;
	}
	const changes = Object.keys(proposed).length;
	return {
		outcome: {
			kind: "done",
			output: { rules: matched, fields: changes, notes },
		},
		patch: { proposed },
	};
};

// -- taxonomy --------------------------------------------------------------

const taxonomy: Handler = async (row, env) => {
	const proposed: TagValues = { ...proposedOf(row) };
	const current = effectiveTags({ tags: row.tags, proposed });
	const names: Array<{ field: string; before: string; after: string }> = [];
	for (const field of ["genre", "artist", "label"] as const) {
		const value = current[field];
		if (typeof value !== "string" || value === "") continue;
		const resolved = resolveName(value, env.taxonomies[field], {
			fuzzy: field === "genre",
		});
		if (resolved.name !== null && resolved.name !== value) {
			proposed[field as TagKey] = resolved.name;
			names.push({ field, before: value, after: resolved.name });
		}
	}
	return {
		outcome: { kind: "done", output: { names } },
		patch: { proposed },
	};
};

// -- autotag ---------------------------------------------------------------

const AUTOTAG_FIELDS: readonly PlanField[] = [
	"title",
	"artist",
	"albumArtist",
	"album",
	"genre",
	"year",
	"label",
	"isrc",
	"bpm",
	"key",
	"remixer",
];

// The providers fill what the settings allow into the item's proposed tags (the inbox
// is the review: the owner sees tags before and after when approving).
const autotag: Handler = async (row, env) => {
	if (!env.settings.autotagInbox)
		return { outcome: { kind: "skip", reason: "auto-tag is off in Settings" } };
	const set = buildProviders(env.settings);
	if (set.providers.length === 0)
		return {
			outcome: { kind: "skip", reason: "no auto-tag provider is ready" },
		};
	const tags = effectiveTags(row);
	const named = identityOf(row);
	const num = (key: string): number | null =>
		typeof tags[key] === "number" ? (tags[key] as number) : null;
	const text = (key: string): string | null =>
		typeof tags[key] === "string" ? (tags[key] as string) : null;
	const facts = await factsOf(
		{
			title: named.title || null,
			artist: named.artist || null,
			album: text("album"),
			durationMs: row.durationMs,
			isrc: text("isrc"),
			label: text("label"),
			year: num("year"),
			bpm: num("bpm"),
		},
		set,
		abs(row, env),
	);
	const plan = await planTrack(
		set,
		facts,
		Object.fromEntries(AUTOTAG_FIELDS.map((f) => [f, tags[f] ?? null])),
		policyOf(env.settings),
		env.taxonomies,
		env.signal,
	);
	const proposed: TagValues = { ...proposedOf(row) };
	for (const change of plan.changes) {
		const numeric = change.field === "year" || change.field === "bpm";
		(proposed as Record<string, unknown>)[change.field] = numeric
			? Number(change.after)
			: change.after;
	}
	if (
		plan.candidates.length === 0 &&
		plan.errors.length === set.providers.length
	)
		return {
			outcome: {
				kind: "fail",
				error: `Providers failed: ${plan.errors.map((e) => `${e.provider} ${e.error}`).join("; ")}`,
				retryable: true,
			},
		};
	return {
		outcome: {
			kind: "done",
			output: {
				fields: plan.changes.map((c) => ({
					field: c.field,
					source: c.source,
					confidence: Math.round(c.confidence * 100) / 100,
				})),
			},
		},
		patch: { proposed },
	};
};

// -- organise --------------------------------------------------------------

export async function targetFor(
	row: ItemRow,
	env: Pick<StepEnv, "root" | "settings">,
): Promise<string> {
	const tags = effectiveTags(row);
	const text = (key: string): string | null =>
		typeof tags[key] === "string" ? (tags[key] as string) : null;
	const num = (key: string): number | null =>
		typeof tags[key] === "number" ? (tags[key] as number) : null;
	const plan = planMoves(
		[
			{
				id: row.id,
				path: row.path,
				title: text("title") ?? parseCandidatePath(row.path).title,
				artist: text("artist"),
				albumArtist: text("albumArtist"),
				album: text("album"),
				genre: text("genre"),
				year: num("year"),
				bpm: num("bpm"),
				key: text("key"),
				label: text("label"),
				remixer: text("remixer"),
			},
		],
		env.settings.organiseTemplate,
		env.root,
	);
	const move = plan.moves[0];
	const skipped = plan.skipped[0];
	if (skipped) throw new Error(skipped.reason);
	if (!move) throw new Error("The template names no path for this file");
	// Landing on a file the library already has numbers the name.
	return freeName(env.root, move.to, (path) => {
		const hit = statement(
			"SELECT 1 AS x FROM files WHERE path = @p LIMIT 1",
		).get({
			p: path,
		});
		return hit !== undefined;
	});
}

const organise: Handler = async (row, env) => {
	try {
		const target = await targetFor(row, env);
		return {
			outcome: { kind: "done", output: { target } },
			patch: { target },
		};
	} catch (error) {
		return {
			outcome: {
				kind: "fail",
				error: error instanceof Error ? error.message : String(error),
				retryable: false,
			},
		};
	}
};

// Approval is the owner's (or the settings'): the runner parks the item there.
const approve: Handler = async () => ({
	outcome: { kind: "skip", reason: "waits for approval" },
});

export const HANDLERS: Record<InboxStepId, Handler> = {
	hash,
	fingerprint,
	dedupe,
	rules,
	taxonomy,
	autotag,
	organise,
	approve,
};

// Gone files are noticed here rather than as a crash in a step.
export async function fileExists(row: ItemRow, env: StepEnv): Promise<boolean> {
	return stat(abs(row, env)).then(
		(s) => s.isFile(),
		() => false,
	);
}
