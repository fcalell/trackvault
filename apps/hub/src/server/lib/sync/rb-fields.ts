import type { CueEntry, TrackField } from "@trackvault/core/sync";
import { statement } from "../raw.ts";
import type { TagKey, TrackRow } from "../track-fields.ts";

// The fields TrackVault and Rekordbox share on a track, as values both sides can
// compare: text trimmed (empty is none), whole numbers, 0 stars and no year are none,
// tag names a sorted set.

export type Norm = string | number | string[] | null;

export const TEXT_FIELDS = [
	"title",
	"artist",
	"remixer",
	"album",
	"genre",
	"label",
	"comment",
] as const;
// The fields that live in a file's tags and go through `applyPatches`.
export const TAG_FIELDS: ReadonlySet<string> = new Set<TrackField>([
	...TEXT_FIELDS,
	"year",
	"rating",
]);

export function norm(field: string, value: unknown): Norm {
	if (value === null || value === undefined)
		return field === "myTags" ? [] : null;
	if (field === "myTags") {
		const names = Array.isArray(value) ? value : [String(value)];
		const seen = new Map<string, string>();
		for (const name of names) {
			const text = String(name).trim();
			if (text) seen.set(text.toLowerCase(), text);
		}
		return [...seen.values()].sort((a, b) => a.localeCompare(b));
	}
	if (field === "year" || field === "rating") {
		const n = Number(value);
		return Number.isFinite(n) && Math.round(n) !== 0 ? Math.round(n) : null;
	}
	const text = String(value).trim();
	return text === "" ? null : text;
}

export const same = (a: Norm, b: Norm): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

export function hubValue(
	row: TrackRow,
	field: string,
	tagNames: readonly string[],
): Norm {
	switch (field) {
		case "color":
			return norm(field, row.colour);
		case "myTags":
			return norm(field, tagNames);
		default:
			return norm(field, (row as unknown as Record<string, unknown>)[field]);
	}
}

// What a hub value is as the protocol's `FieldValue`: no zero stars, an empty tag set.
export const asWire = (
	field: string,
	value: Norm,
): string | number | string[] | null =>
	field === "rating" && value === null ? 0 : value;

export const tagKeyOf = (field: string): TagKey => field as TagKey;

export function tracksById(ids: readonly string[]): Map<string, TrackRow> {
	const out = new Map<string, TrackRow>();
	for (let i = 0; i < ids.length; i += 800) {
		const rows = statement(
			"SELECT * FROM tracks WHERE id IN (SELECT value FROM json_each(@ids))",
		).all({ ids: JSON.stringify(ids.slice(i, i + 800)) }) as Array<
			Record<string, unknown>
		>;
		for (const raw of rows) {
			const row = rowFromRaw(raw);
			out.set(row.id, row);
		}
	}
	return out;
}

// better-sqlite3 gives column names; the app's rows are camelCase with dates.
function rowFromRaw(raw: Record<string, unknown>): TrackRow {
	const camel = (name: string) =>
		name.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(raw)) {
		const name = camel(key);
		out[name] =
			(name === "addedAt" || name === "updatedAt" || name === "lastPlayedAt") &&
			typeof value === "number"
				? new Date(value)
				: name === "hasArt"
					? Boolean(value)
					: value;
	}
	return out as unknown as TrackRow;
}

export function tagNamesOf(ids: readonly string[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (let i = 0; i < ids.length; i += 800) {
		const rows = statement(
			`SELECT tt.track_id AS id, t.name AS name FROM track_tags tt JOIN tags t ON t.id = tt.tag_id
			 WHERE tt.track_id IN (SELECT value FROM json_each(@ids))`,
		).all({ ids: JSON.stringify(ids.slice(i, i + 800)) }) as Array<{
			id: string;
			name: string;
		}>;
		for (const row of rows) {
			const list = out.get(row.id) ?? [];
			list.push(row.name);
			out.set(row.id, list);
		}
	}
	return out;
}

export const signatureOf = (cue: CueEntry): string =>
	`${cue.kind}:${cue.startMs}:${cue.endMs ?? ""}:${cue.color ?? ""}:${cue.comment ?? ""}`;

export function cuesOf(ids: readonly string[]): Map<string, CueEntry[]> {
	const out = new Map<string, CueEntry[]>();
	for (let i = 0; i < ids.length; i += 800) {
		const rows = statement(
			`SELECT track_id AS id, kind, start_ms AS startMs, end_ms AS endMs, color,
				color_table_index AS colorTableIndex, comment, active_loop AS activeLoop, beat_loop_size AS beatLoopSize
			 FROM cues WHERE track_id IN (SELECT value FROM json_each(@ids)) ORDER BY track_id, idx`,
		).all({ ids: JSON.stringify(ids.slice(i, i + 800)) }) as Array<
			{ id: string; activeLoop: number } & Omit<CueEntry, "activeLoop">
		>;
		for (const { id, activeLoop, ...cue } of rows) {
			const list = out.get(id) ?? [];
			list.push({ ...cue, activeLoop: activeLoop !== 0 });
			out.set(id, list);
		}
	}
	return out;
}

// The ANLZ files a track has, newest per kind, those of other devices first (the
// device that made them needs nothing back).
export function analysisOf(ids: readonly string[], deviceId: string) {
	const out = new Map<
		string,
		Array<{
			trackId: string;
			kind: "DAT" | "EXT" | "2EX";
			hash: string;
			size: number;
		}>
	>();
	for (let i = 0; i < ids.length; i += 800) {
		const rows = statement(
			`SELECT track_id AS trackId, kind, hash, size FROM track_analysis
			 WHERE track_id IN (SELECT value FROM json_each(@ids)) AND device_id != @d ORDER BY at DESC`,
		).all({
			ids: JSON.stringify(ids.slice(i, i + 800)),
			d: deviceId,
		}) as Array<{
			trackId: string;
			kind: "DAT" | "EXT" | "2EX";
			hash: string;
			size: number;
		}>;
		for (const row of rows) {
			const list = out.get(row.trackId) ?? [];
			if (!list.some((each) => each.kind === row.kind)) list.push(row);
			out.set(row.trackId, list);
		}
	}
	return out;
}
