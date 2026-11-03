export {
	type Authenticity,
	type AuthenticityResult,
	assessAuthenticity,
} from "./authenticity.ts";
export {
	alreadyInLibrary,
	createMemoryLibraryIndex,
	type HaveStatus,
	type LibraryEntry,
	type LibraryIndex,
	type LibraryMatch,
	type LibraryTrackId,
	type LookupKeys,
	type MatchOptions,
	type WantLike,
	wantKeys,
} from "./library.ts";
export { type ParsedPath, parseCandidatePath } from "./parse.ts";
export {
	DEFAULT_FORMATS,
	type FormatRule,
	type RankedCandidate,
	type RankOptions,
	rankCandidates,
} from "./score.ts";
