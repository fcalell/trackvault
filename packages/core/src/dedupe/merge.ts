import type { TrackTags } from "../tags/types.ts";
import type { TrackFacts, TrackId } from "./types.ts";

export interface FieldMerge {
	field: keyof TrackTags;
	value: string | number;
	from: TrackId;
}

export interface MembershipTransfer {
	playlistId: TrackId;
	from: TrackId;
}

export interface MergePlan {
	keeperId: TrackId;
	// Tags the keeper lacks, filled from the first other that has them.
	fieldMerges: FieldMerge[];
	// Playlists the keeper is not in yet; each moves once.
	memberships: MembershipTransfer[];
	// Cues come along only when the keeper has none (grids differ per file).
	cueSource: TrackId | null;
	customTags: Array<{ tagId: TrackId; from: TrackId }>;
	art: TrackId | null;
	// Files of the others, for quarantine (never deleted).
	quarantine: Array<{ trackId: TrackId; path: string }>;
}

const FILLABLE: ReadonlyArray<keyof TrackTags> = [
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
	"comment",
	"rating",
	"energy",
	"remixer",
];

const blank = (v: unknown) =>
	v === null || v === undefined || v === "" || v === 0;

// What merging `others` into the keeper moves across. `others` are ordered
// best first: the earlier one wins a field both could fill.
export function mergePlan(
	keeper: TrackFacts,
	others: readonly TrackFacts[],
): MergePlan {
	const fieldMerges: FieldMerge[] = [];
	for (const field of FILLABLE) {
		if (!blank(keeper.tags[field])) continue;
		for (const o of others) {
			const v = o.tags[field];
			if (!blank(v)) {
				fieldMerges.push({ field, value: v as string | number, from: o.id });
				break;
			}
		}
	}
	const inLists = new Set(keeper.playlistIds);
	const memberships: MembershipTransfer[] = [];
	for (const o of others) {
		for (const playlistId of o.playlistIds) {
			if (inLists.has(playlistId)) continue;
			inLists.add(playlistId);
			memberships.push({ playlistId, from: o.id });
		}
	}
	const keeperTags = new Set(keeper.customTagIds ?? []);
	const customTags: MergePlan["customTags"] = [];
	for (const o of others) {
		for (const tagId of o.customTagIds ?? []) {
			if (keeperTags.has(tagId)) continue;
			keeperTags.add(tagId);
			customTags.push({ tagId, from: o.id });
		}
	}
	return {
		keeperId: keeper.id,
		fieldMerges,
		memberships,
		cueSource:
			keeper.cueCount > 0
				? null
				: (others.find((o) => o.cueCount > 0)?.id ?? null),
		customTags,
		art: keeper.hasArt ? null : (others.find((o) => o.hasArt)?.id ?? null),
		quarantine: others.flatMap((o) =>
			o.files.map((path) => ({ trackId: o.id, path })),
		),
	};
}
