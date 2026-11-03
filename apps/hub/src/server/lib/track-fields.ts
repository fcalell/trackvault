import type { FileAnalysis } from "@trackvault/core/analyze";
import { ISSUE, issuesOf } from "@trackvault/core/issues";
import { normalizeTrack } from "@trackvault/core/normalize";
import type { tracks } from "../../schema/index.ts";

export type TrackRow = typeof tracks.$inferSelect;

// The columns a file decides: scanning rewrites these and nothing else of a
// track (its id, added date, colour, loudness and the like are the library's).
export const FILE_FIELDS = [
	"title",
	"artist",
	"artists",
	"remixer",
	"mixName",
	"album",
	"albumArtist",
	"label",
	"genre",
	"year",
	"isrc",
	"bpm",
	"key",
	"energy",
	"rating",
	"comment",
	"format",
	"bitrate",
	"sampleRate",
	"durationMs",
	"size",
	"hasArt",
	"issues",
	"blockKey",
	"searchText",
] as const satisfies ReadonlyArray<keyof TrackRow>;

export type FileField = (typeof FILE_FIELDS)[number];
export type FileFields = Pick<TrackRow, FileField>;

// The text columns that follow from the title, artist, album and label.
export function derivedText(input: {
	title: string | null;
	artist: string | null;
	album: string | null;
	label: string | null;
	remixer: string | null;
}) {
	const normalized = normalizeTrack(input);
	return {
		artists: normalized.artistsKey || null,
		mixName: normalized.mixName,
		remixer: input.remixer ?? normalized.remixer,
		blockKey: normalized.blockKey === "|" ? null : normalized.blockKey,
		searchText: normalized.searchText || null,
	};
}

export function fieldsFromAnalysis(
	a: FileAnalysis,
	lowBitrateKbps: number,
): FileFields {
	const t = a.tags;
	return {
		title: t.title,
		artist: t.artist,
		album: t.album,
		albumArtist: t.albumArtist,
		label: t.label,
		genre: t.genre,
		year: t.year,
		isrc: t.isrc,
		bpm: t.bpm,
		key: t.key,
		energy: t.energy,
		rating: t.rating,
		comment: t.comment,
		format: a.audio.format,
		bitrate: a.audio.bitrateKbps || null,
		sampleRate: a.audio.sampleRate || null,
		durationMs: a.audio.durationMs || null,
		size: a.size,
		hasArt: a.hasArt,
		issues: issuesOf(
			{
				title: t.title,
				artist: t.artist,
				genre: t.genre,
				bpm: t.bpm,
				key: t.key,
				hasArt: a.hasArt,
				bitrateKbps: a.audio.bitrateKbps,
				framesFound: a.framesFound,
			},
			lowBitrateKbps,
		),
		...derivedText({
			title: t.title,
			artist: t.artist,
			album: t.album,
			label: t.label,
			remixer: t.remixer,
		}),
	};
}

// Issue bits after a tag edit: the tag-driven ones are recomputed, the ones a
// scan decides (undecodable, missing file) are kept.
export function issuesAfterEdit(row: TrackRow, lowBitrateKbps: number): number {
	const kept = row.issues & (ISSUE.undecodable | ISSUE.missingFile);
	return (
		kept |
		issuesOf(
			{
				title: row.title,
				artist: row.artist,
				genre: row.genre,
				bpm: row.bpm,
				key: row.key,
				hasArt: row.hasArt,
				bitrateKbps: row.bitrate ?? 0,
				framesFound: true,
			},
			lowBitrateKbps,
		)
	);
}

export interface FieldChange {
	field: string;
	before: unknown;
	after: unknown;
}

export function diffFields<K extends string>(
	before: Record<K, unknown>,
	after: Record<K, unknown>,
	keys: readonly K[],
): FieldChange[] {
	const out: FieldChange[] = [];
	for (const key of keys) {
		const a = before[key] ?? null;
		const b = after[key] ?? null;
		if (a !== b) out.push({ field: key, before: a, after: b });
	}
	return out;
}
