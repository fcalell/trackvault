import type { DuplicateGroup, TrackFacts, TrackId } from "./types.ts";

const LOSSLESS = new Set(["flac", "wav", "aiff", "aif", "alac", "ape", "wv"]);

export const isLossless = (format: string) =>
	LOSSLESS.has(format.toLowerCase());

const COMPLETENESS_FIELDS = [
	"title",
	"artist",
	"albumArtist",
	"album",
	"genre",
	"year",
	"label",
	"bpm",
	"key",
	"isrc",
] as const;

export function tagCompleteness(facts: TrackFacts): number {
	let n = facts.hasArt ? 1 : 0;
	for (const f of COMPLETENESS_FIELDS) {
		const v = facts.tags[f];
		if (v !== null && v !== undefined && v !== "" && v !== 0) n++;
	}
	return n;
}

interface Rule {
	name: string;
	// Positive: `a` is better.
	compare(a: TrackFacts, b: TrackFacts): number;
	explain(win: TrackFacts, lose: TrackFacts): string;
}

const RULES: Rule[] = [
	{
		name: "lossless",
		compare: (a, b) =>
			Number(isLossless(a.format)) - Number(isLossless(b.format)),
		explain: (w, l) => `lossless (${w.format}) over ${l.format}`,
	},
	{
		name: "bitrate",
		compare: (a, b) => a.bitrateKbps - b.bitrateKbps,
		explain: (w, l) =>
			`higher bitrate (${w.bitrateKbps} vs ${l.bitrateKbps} kbps)`,
	},
	{
		name: "cues",
		compare: (a, b) => Number(a.cueCount > 0) - Number(b.cueCount > 0),
		explain: (w) => `has Rekordbox cues (${w.cueCount}), the other has none`,
	},
	{
		name: "playlists",
		compare: (a, b) => a.playlistIds.length - b.playlistIds.length,
		explain: (w, l) =>
			`in more playlists (${w.playlistIds.length} vs ${l.playlistIds.length})`,
	},
	{
		name: "tags",
		compare: (a, b) => tagCompleteness(a) - tagCompleteness(b),
		explain: (w, l) =>
			`more complete tags (${tagCompleteness(w)} vs ${tagCompleteness(l)} fields)`,
	},
	{
		name: "older",
		compare: (a, b) => b.addedAt - a.addedAt,
		explain: () => "added earlier",
	},
];

export interface KeeperChoice {
	keeperId: TrackId;
	reason: string;
	// Every member best first, with the rule that put it behind the one above.
	ranking: Array<{ id: TrackId; lostOn: string | null }>;
}

function rank(a: TrackFacts, b: TrackFacts): number {
	for (const r of RULES) {
		const d = r.compare(b, a);
		if (d !== 0) return d > 0 ? 1 : -1;
	}
	return String(a.id) < String(b.id) ? -1 : 1;
}

// Picks the track to keep: lossless, then bitrate, Rekordbox cues, playlist
// memberships, tag completeness, then the older addedAt. The reason names the
// first rule that separates the keeper from the runner-up.
export function pickKeeper(
	group: Pick<DuplicateGroup, "trackIds">,
	facts: ReadonlyMap<TrackId, TrackFacts>,
): KeeperChoice {
	const members = group.trackIds.map((id) => {
		const f = facts.get(id);
		if (!f) throw new Error(`no facts for track ${id}`);
		return f;
	});
	if (members.length === 0) throw new Error("empty group");
	const sorted = [...members].sort(rank);
	const best = sorted[0] as TrackFacts;
	const lostOn = (
		above: TrackFacts,
		below: TrackFacts,
	): { rule: string; text: string } | null => {
		for (const r of RULES) {
			if (r.compare(above, below) > 0)
				return { rule: r.name, text: r.explain(above, below) };
		}
		return null;
	};
	const ranking = sorted.map((f, i) => ({
		id: f.id,
		lostOn:
			i === 0 ? null : (lostOn(sorted[i - 1] as TrackFacts, f)?.rule ?? "id"),
	}));
	const runnerUp = sorted[1];
	const why = runnerUp ? lostOn(best, runnerUp) : null;
	const reason = !runnerUp
		? "only track"
		: why
			? `kept ${why.text}`
			: "identical on every rule; kept the first by id";
	return { keeperId: best.id, reason, ranking };
}
