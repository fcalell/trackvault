import { ISSUE } from "@trackvault/core/issues";
import { statement } from "./raw.ts";
import { readSettings } from "./settings.ts";

// Each panel of the Stats place is one aggregate over `tracks` (a covering or
// partial-index scan, measured at 50k in scripts/bench-queries.ts). Answers are kept
// by library version for a minute: plays are refreshed without a version bump, so a
// count of plays may lag by that much.
const KEEP_MS = 60_000;
const kept = new Map<string, { version: number; at: number; value: unknown }>();

function cached<T>(name: string, compute: () => T): T {
	const version = readSettings().libraryVersion;
	const hit = kept.get(name);
	if (hit && hit.version === version && Date.now() - hit.at < KEEP_MS)
		return hit.value as T;
	const value = compute();
	kept.set(name, { version, at: Date.now(), value });
	return value;
}

// Quarantined tracks are out of every panel. While there are none (the usual case)
// the condition is dropped: it would make each panel read the table rows instead of
// one covering index. The check is the partial index on the quarantine bit.
function inLibrary(): string {
	const any = statement(
		`SELECT 1 AS x FROM tracks WHERE (issues & ${ISSUE.quarantined}) != 0 LIMIT 1`,
	).get();
	return any ? `(issues & ${ISSUE.quarantined}) = 0` : "1";
}

export function totals() {
	return cached("totals", () => {
		const row = statement(
			`SELECT count(*) AS tracks, coalesce(sum(duration_ms), 0) AS durationMs, coalesce(sum(size), 0) AS size,
			        count(DISTINCT artist) AS artists, coalesce(sum(CASE WHEN play_count = 0 THEN 1 ELSE 0 END), 0) AS neverPlayed
			 FROM tracks WHERE ${inLibrary()}`,
		).get() as {
			tracks: number;
			durationMs: number;
			size: number;
			artists: number;
			neverPlayed: number;
		};
		return row;
	});
}

export function formats() {
	return cached(
		"formats",
		() =>
			statement(
				`SELECT format, coalesce(codec, format) AS codec, count(*) AS count FROM tracks
				 WHERE ${inLibrary()} GROUP BY format, codec ORDER BY count DESC`,
			).all() as Array<{ format: string; codec: string; count: number }>,
	);
}

export function genres(limit = 15) {
	return cached("genres", () => {
		const rows = statement(
			`SELECT min(genre) AS genre, count(*) AS count FROM tracks
			 WHERE genre IS NOT NULL AND ${inLibrary()} GROUP BY genre COLLATE NOCASE ORDER BY count DESC LIMIT @n`,
		).all({ n: limit }) as Array<{ genre: string; count: number }>;
		const none = statement(
			`SELECT count(*) AS n FROM tracks WHERE genre IS NULL AND ${inLibrary()}`,
		).get() as { n: number };
		return { top: rows, untagged: none.n };
	});
}

// Tempo in bins of 5 BPM from the lowest to the highest tempo found (outliers under
// 60 and over 200 are one bin each at the ends).
export function bpmHistogram() {
	return cached("bpm", () => {
		const rows = statement(
			`SELECT CAST(min(max(bpm, 60), 200) / 5 AS INTEGER) * 5 AS bin, count(*) AS count FROM tracks
			 WHERE bpm > 0 AND ${inLibrary()} GROUP BY bin ORDER BY bin`,
		).all() as Array<{ bin: number; count: number }>;
		const byBin = new Map(rows.map((row) => [row.bin, row.count]));
		if (rows.length === 0) return [];
		const first = (rows[0] as { bin: number }).bin;
		const last = (rows[rows.length - 1] as { bin: number }).bin;
		const out: Array<{ bin: number; count: number }> = [];
		for (let bin = first; bin <= last; bin += 5)
			out.push({ bin, count: byBin.get(bin) ?? 0 });
		return out;
	});
}

// The Camelot wheel, 1A to 12B, every key listed (zero when unused).
export function keyWheel() {
	return cached("keys", () => {
		const rows = statement(
			`SELECT upper(key) AS key, count(*) AS count FROM tracks WHERE key IS NOT NULL AND ${inLibrary()} GROUP BY upper(key)`,
		).all() as Array<{ key: string; count: number }>;
		const byKey = new Map(rows.map((row) => [row.key, row.count]));
		const out: Array<{ key: string; count: number }> = [];
		for (let n = 1; n <= 12; n++)
			for (const letter of ["A", "B"])
				out.push({
					key: `${n}${letter}`,
					count: byKey.get(`${n}${letter}`) ?? 0,
				});
		return out;
	});
}

// Tracks added per month, the last `months` months (empty months included).
export function addedPerMonth(months = 24) {
	return cached("added", () => {
		const rows = statement(
			`SELECT strftime('%Y-%m', added_at / 1000, 'unixepoch') AS month, count(*) AS count FROM tracks
			 WHERE ${inLibrary()} GROUP BY month ORDER BY month DESC LIMIT @n`,
		).all({ n: months }) as Array<{ month: string; count: number }>;
		if (rows.length === 0) return [];
		const byMonth = new Map(rows.map((row) => [row.month, row.count]));
		const [lastYear, lastMonth] = (rows[0] as { month: string }).month
			.split("-")
			.map(Number) as [number, number];
		const out: Array<{ month: string; count: number }> = [];
		for (let i = Math.min(months, rows.length + 12) - 1; i >= 0; i--) {
			const d = new Date(Date.UTC(lastYear, lastMonth - 1 - i, 1));
			const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
			if (out.length === 0 && !byMonth.has(month)) continue;
			out.push({ month, count: byMonth.get(month) ?? 0 });
		}
		return out;
	});
}

export interface PlayedRow {
	id: string;
	title: string | null;
	artist: string | null;
	playCount: number;
	lastPlayedAt: number | null;
}

export function played(limit = 10) {
	return cached("played", () => {
		const base = `SELECT id, title, artist, play_count AS playCount, last_played_at AS lastPlayedAt FROM tracks`;
		return {
			most: statement(
				`${base} WHERE play_count > 0 AND ${inLibrary()} ORDER BY play_count DESC, id LIMIT @n`,
			).all({ n: limit }) as PlayedRow[],
			// Played, but least and longest ago.
			least: statement(
				`${base} WHERE play_count > 0 AND ${inLibrary()} ORDER BY play_count ASC, last_played_at ASC, id LIMIT @n`,
			).all({ n: limit }) as PlayedRow[],
		};
	});
}

const DAY = 86_400_000;

// When tracks were last played: within a month, three, six, a year, longer ago, never.
export function freshness() {
	return cached("freshness", () => {
		const now = Date.now();
		const row = statement(
			`SELECT
				coalesce(sum(CASE WHEN last_played_at >= @d30 THEN 1 ELSE 0 END), 0) AS d30,
				coalesce(sum(CASE WHEN last_played_at < @d30 AND last_played_at >= @d90 THEN 1 ELSE 0 END), 0) AS d90,
				coalesce(sum(CASE WHEN last_played_at < @d90 AND last_played_at >= @d180 THEN 1 ELSE 0 END), 0) AS d180,
				coalesce(sum(CASE WHEN last_played_at < @d180 AND last_played_at >= @d365 THEN 1 ELSE 0 END), 0) AS d365,
				coalesce(sum(CASE WHEN last_played_at < @d365 THEN 1 ELSE 0 END), 0) AS older,
				coalesce(sum(CASE WHEN last_played_at IS NULL THEN 1 ELSE 0 END), 0) AS never
			 FROM tracks WHERE ${inLibrary()}`,
		).get({
			d30: now - 30 * DAY,
			d90: now - 90 * DAY,
			d180: now - 180 * DAY,
			d365: now - 365 * DAY,
		}) as Record<"d30" | "d90" | "d180" | "d365" | "older" | "never", number>;
		return [
			{ bucket: "Last month", count: row.d30 },
			{ bucket: "1 to 3 months", count: row.d90 },
			{ bucket: "3 to 6 months", count: row.d180 },
			{ bucket: "6 to 12 months", count: row.d365 },
			{ bucket: "Over a year", count: row.older },
			{ bucket: "Never", count: row.never },
		];
	});
}
