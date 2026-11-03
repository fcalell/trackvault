export {
	type AcousticItem,
	type AcousticOptions,
	type AcousticPair,
	type Alignment,
	berAtOffset,
	compareFingerprints,
	type FingerprintOptions,
	type FingerprintResult,
	findAcousticPairs,
	fingerprintFile,
	fingerprintFromBytes,
	fingerprintToBytes,
} from "./acoustic.ts";
export type { FuzzyOptions } from "./fuzzy.ts";
export { type DedupeOptions, groupDuplicates } from "./group.ts";
export {
	COMPLETENESS_SLOTS,
	isLossless,
	type KeeperChoice,
	pickKeeper,
	tagCompleteness,
} from "./keeper.ts";
export {
	type FieldMerge,
	type MembershipTransfer,
	type MergePlan,
	mergePlan,
} from "./merge.ts";
export * from "./types.ts";
export { classifyMix, type MixClass } from "./versions.ts";
