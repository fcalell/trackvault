import {
	camelotString,
	compatibleKeys,
	type MixTrack,
	nextTrackSuggestions,
	parseCamelot,
	type Suggestion,
	type SuggestOptions,
	setFlow,
} from "@trackvault/core/harmonic";
import { ISSUE } from "@trackvault/core/issues";
import { statement } from "./raw.ts";

const DRAFT = "current";
export const SET_LIMIT = 500;

export function readDraft(): string[] {
	const row = statement(
		"SELECT track_ids AS ids FROM set_drafts WHERE id = @id",
	).get({ id: DRAFT }) as { ids: string } | undefined;
	return row ? (JSON.parse(row.ids) as string[]) : [];
}

export function writeDraft(ids: readonly string[]): void {
	statement(
		`INSERT INTO set_drafts (id, name, track_ids, updated_at) VALUES (@id, 'Set', @ids, @now)
		 ON CONFLICT (id) DO UPDATE SET track_ids = excluded.track_ids, updated_at = excluded.updated_at`,
	).run({ id: DRAFT, ids: JSON.stringify(ids), now: Date.now() });
}

interface MixRow {
	id: string;
	title: string | null;
	artist: string | null;
	bpm: number | null;
	key: string | null;
	energy: number | null;
	genre: string | null;
	lastPlayedAt: number | null;
	playCount: number;
	hasArt: number;
}

const COLUMNS = `id, title, artist, bpm, key, energy, genre, last_played_at AS lastPlayedAt, play_count AS playCount, has_art AS hasArt`;

export type SetTrack = MixTrack & {
	id: string;
	title: string | null;
	artist: string | null;
	hasArt: boolean;
};

const asMix = (row: MixRow): SetTrack => ({
	id: row.id,
	title: row.title,
	artist: row.artist,
	bpm: row.bpm,
	key: row.key,
	energy: row.energy,
	genre: row.genre,
	lastPlayedAt: row.lastPlayedAt,
	playCount: row.playCount,
	hasArt: row.hasArt === 1,
});

// The tracks of `ids` in that order (a track the library lost is skipped).
export function mixTracks(ids: readonly string[]): SetTrack[] {
	if (ids.length === 0) return [];
	const rows = statement(
		`SELECT ${COLUMNS} FROM tracks WHERE id IN (SELECT value FROM json_each(@ids))`,
	).all({ ids: JSON.stringify(ids) }) as MixRow[];
	const byId = new Map(rows.map((row) => [row.id, asMix(row)]));
	return ids.flatMap((id) => {
		const found = byId.get(id);
		return found ? [found] : [];
	});
}

export interface FlowOptions {
	pitchRangePercent?: number;
	energyDirection?: "up" | "down" | "flat";
}

// The set's transitions, scored (freshness is left out: it is about the library).
export function flowOf(tracks: readonly SetTrack[], options: FlowOptions = {}) {
	const flow = setFlow(tracks, options);
	return {
		average: flow.average,
		weak: flow.weak,
		curve: flow.curve,
		transitions: flow.transitions.map((t) => ({
			index: t.index,
			score: t.score,
			explanation: t.explanation,
		})),
	};
}

export interface SuggestionRow {
	track: SetTrack;
	score: number;
	explanation: string;
	parts: Suggestion["parts"];
}

// Tracks that could follow `current`: the library narrowed in SQL to the keys that
// do not clash and the tempos within the pitch range (half and double time too), the
// least recently played first, then scored in memory by core/harmonic (key, tempo,
// energy, genre, freshness) with the reasons.
export function suggestAfter(
	current: SetTrack,
	exclude: readonly string[],
	options: SuggestOptions & { pool?: number } = {},
): SuggestionRow[] {
	const pitch = (options.pitchRangePercent ?? 8) / 100;
	const where: string[] = [
		`(issues & ${ISSUE.quarantined}) = 0`,
		"id NOT IN (SELECT value FROM json_each(@exclude))",
	];
	const params: Record<string, unknown> = {
		exclude: JSON.stringify(exclude),
		pool: options.pool ?? 600,
	};
	const camelot = parseCamelot(current.key);
	if (camelot) {
		const keys = compatibleKeys(camelot, { includeBoosts: true }).map((k) =>
			camelotString(k.key),
		);
		where.push(`key IN (SELECT value FROM json_each(@keys))`);
		params.keys = JSON.stringify(keys);
	}
	if (current.bpm) {
		const ranges = [1, 0.5, 2].map((m) => {
			const target = current.bpm as number;
			return [target / (m * (1 + pitch)), target / (m * (1 - pitch))];
		});
		where.push(
			`(${ranges.map((_, i) => `bpm BETWEEN @lo${i} AND @hi${i}`).join(" OR ")})`,
		);
		ranges.forEach(([lo, hi], i) => {
			params[`lo${i}`] = lo;
			params[`hi${i}`] = hi;
		});
	}
	const rows = statement(
		`SELECT ${COLUMNS} FROM tracks WHERE ${where.join(" AND ")}
		 ORDER BY coalesce(last_played_at, 0), id LIMIT @pool`,
	).all(params) as MixRow[];
	const pool = rows.map(asMix);
	return nextTrackSuggestions(current, pool, {
		...options,
		limit: options.limit ?? 15,
	}).map((s) => ({
		track: s.track as SetTrack,
		score: s.score,
		explanation: s.explanation,
		parts: s.parts,
	}));
}
