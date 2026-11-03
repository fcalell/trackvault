import type { CueInput, FieldInput, RbCue } from "@trackvault/core/rekordbox";
import type { CueEntry, FieldValue, TrackFields } from "@trackvault/core/sync";

// Conversions between the protocol's shapes and core's Rekordbox shapes.

export function cueEntryOf(cue: RbCue): CueEntry {
	return {
		kind: cue.kind,
		startMs: cue.startMs,
		endMs: cue.endMs,
		color: cue.color,
		colorTableIndex: cue.colorTableIndex,
		comment: cue.comment,
		activeLoop: cue.activeLoop,
		beatLoopSize: cue.beatLoopSize,
	};
}

export function cueInputOf(cue: CueEntry): CueInput {
	return {
		kind: cue.kind,
		startMs: cue.startMs,
		endMs: cue.endMs,
		color: cue.color,
		colorTableIndex: cue.colorTableIndex,
		comment: cue.comment,
		activeLoop: cue.activeLoop,
		beatLoopSize: cue.beatLoopSize,
	};
}

function text(v: FieldValue | undefined): string | null | undefined {
	if (v === undefined) return undefined;
	if (v === null) return null;
	return Array.isArray(v) ? v.join(", ") : String(v);
}

function number(v: FieldValue | undefined): number | null | undefined {
	if (v === undefined) return undefined;
	if (v === null) return null;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

// The writer's field input for the fields present in `fields` (absent ones stay
// untouched). `myTags` is written separately with `setMyTags`.
export function fieldInputOf(fields: TrackFields): FieldInput {
	const out: FieldInput = {};
	for (const key of [
		"title",
		"artist",
		"remixer",
		"album",
		"genre",
		"label",
		"comment",
	] as const) {
		const v = text(fields[key]);
		if (v !== undefined) out[key] = v;
	}
	const year = number(fields.year);
	if (year !== undefined) out.year = year;
	const rating = number(fields.rating);
	if (rating !== undefined && rating !== null)
		out.rating = Math.max(0, Math.min(5, Math.round(rating)));
	const color = text(fields.color);
	if (color !== undefined) out.color = color;
	return out;
}

export function myTagsOf(fields: TrackFields): string[] | null {
	const v = fields.myTags;
	if (v === undefined) return null;
	if (Array.isArray(v)) return v;
	return v === null ? [] : [String(v)];
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}
