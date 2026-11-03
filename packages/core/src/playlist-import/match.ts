import {
	alreadyInLibrary,
	type HaveStatus,
	type LibraryIndex,
	type LibraryTrackId,
	type MatchOptions,
} from "../ranking/library.ts";
import type { Want } from "../wishlist/types.ts";

export interface WantMatch {
	want: Want;
	status: HaveStatus;
	trackIds: LibraryTrackId[];
	confidence: number;
}

export interface MatchResult {
	// In the library in the wanted version (or likely so).
	matched: WantMatch[];
	// Not in the library; these go to the wishlist. Includes wants whose song is
	// only owned in another version (see `otherVersions`).
	missing: Want[];
	// Subset of `missing`: the song exists in the library as a different mix.
	otherVersions: WantMatch[];
	// Wants whose match is below the confident threshold; kept in `missing` too
	// unless `maybeIsMatch`.
	uncertain: WantMatch[];
}

export interface MatchWantsOptions extends MatchOptions {
	// Count "maybe" as matched. Default false: better to search than to miss a track.
	maybeIsMatch?: boolean;
}

export async function matchWants(
	wants: readonly Want[],
	index: LibraryIndex,
	options: MatchWantsOptions = {},
): Promise<MatchResult> {
	const out: MatchResult = {
		matched: [],
		missing: [],
		otherVersions: [],
		uncertain: [],
	};
	for (const want of wants) {
		const m = await alreadyInLibrary(want, index, options);
		const entry: WantMatch = {
			want,
			status: m.status,
			trackIds: m.entries.map((e) => e.id),
			confidence: m.confidence,
		};
		if (m.status === "have" || (m.status === "maybe" && options.maybeIsMatch)) {
			out.matched.push(entry);
			continue;
		}
		out.missing.push(want);
		if (m.status === "other-version") out.otherVersions.push(entry);
		if (m.status === "maybe") out.uncertain.push(entry);
	}
	return out;
}
