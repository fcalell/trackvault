import type {
	ChipMark,
	IconName,
	StatusMark,
	Tone,
} from "@fcalell/ui-core/descriptors";
import { trackTitle } from "./track.ts";

// What the acquisition places say of an inbox item, a download or a wishlist item, in words.

export const SOURCE_LABELS = {
	upload: "Upload",
	soulseek: "Soulseek",
	watch: "Dropped",
	agent: "Device",
} as const;

export const INBOX_STATE: Record<string, StatusMark> = {
	queued: { tone: "waiting", label: "Waiting" },
	processing: { tone: "running", label: "Processing" },
	"awaiting-approval": { tone: "active", label: "Ready" },
	duplicate: { tone: "attention", label: "Duplicate" },
	"needs-review": { tone: "attention", label: "Needs a look" },
	approved: { tone: "done", label: "Filed" },
	rejected: { tone: "idle", label: "Rejected" },
	failed: { tone: "failed", label: "Failed" },
};

export const DECISION: Record<string, ChipMark> = {
	accept: { family: "green", label: "New track" },
	"duplicate-of": { family: "neutral", label: "Duplicate" },
	"better-than-existing": { family: "teal", label: "Better copy" },
	"needs-review": { family: "amber", label: "Needs a look" },
};

export const STEP_TONE: Record<string, Tone> = {
	pending: "waiting",
	running: "running",
	done: "done",
	skipped: "idle",
	failed: "failed",
};

export const TRANSFER_STATE: Record<string, StatusMark> = {
	requested: { tone: "waiting", label: "Asking" },
	queued: { tone: "waiting", label: "Queued" },
	downloading: { tone: "running", label: "Downloading" },
	completed: { tone: "active", label: "Finishing" },
	imported: { tone: "done", label: "In the inbox" },
	failed: { tone: "failed", label: "Failed" },
	cancelled: { tone: "idle", label: "Cancelled" },
};

export const WANT_STATE: Record<string, StatusMark> = {
	wanted: { tone: "waiting", label: "Wanted" },
	searching: { tone: "running", label: "Searching" },
	found: { tone: "active", label: "Found" },
	downloading: { tone: "running", label: "Downloading" },
	downloaded: { tone: "active", label: "In the inbox" },
	"in-library": { tone: "done", label: "In the library" },
	"gave-up": { tone: "failed", label: "Gave up" },
	ignored: { tone: "idle", label: "Ignored" },
};

export const WANT_SOURCES: Record<string, string> = {
	manual: "Added by hand",
	text: "Pasted list",
	m3u: "M3U playlist",
	rekordbox: "Rekordbox XML",
	spotify: "Spotify",
	beatport: "Beatport",
	"1001tracklists": "1001Tracklists",
	youtube: "YouTube",
};

export const STEP_ICON: Record<string, IconName> = {
	hash: "Hash",
	fingerprint: "Fingerprint",
	dedupe: "Copy",
	rules: "WandSparkles",
	taxonomy: "Replace",
	autotag: "Sparkles",
	organise: "FolderTree",
	approve: "Check",
};

// One vocabulary for whether the library has a track, in every place that asks: a
// search result, an import row, a wishlist item. The keys are the hub's `have` marks.
export const MATCH = {
	have: { family: "green", label: "In the library" },
	"other-version": { family: "teal", label: "Other mix" },
	maybe: { family: "amber", label: "Not sure" },
	none: { family: "red", label: "Missing" },
} as const satisfies Record<string, ChipMark>;

// An import row's result in that vocabulary.
export const IMPORT_MATCH = {
	matched: "have",
	"other-version": "other-version",
	uncertain: "maybe",
	missing: "none",
} as const satisfies Record<string, keyof typeof MATCH>;

// How a library copy differs in mix from the file in hand.
export const VERSION: Record<string, string> = {
	same: "Same mix",
	different: MATCH["other-version"].label,
	unknown: "Mix not known",
};

// "Artist - Title (Mix)" of a wishlist item.
export const wantName = (want: { artist: string; title: string }): string =>
	`${want.artist} - ${trackTitle(want)}`;

// slskd's own state strings (and the same strings a failed transfer keeps as its
// error), in words. Anything else is the peer's or slskd's own sentence and stands.
const SLSKD_STATE: Record<string, string> = {
	Requested: "Asking the peer",
	Initializing: "Starting",
	"Queued, Remotely": "Waiting in the peer's queue",
	"Queued, Locally": "Waiting its turn here",
	InProgress: "Downloading",
	"Completed, Succeeded": "Finished",
	"Completed, TimedOut": "The peer did not answer in time",
	"Completed, Errored": "The transfer broke off",
	"Completed, Rejected": "The peer refused it",
	"Completed, Cancelled": "Cancelled",
	"Completed, Aborted": "The peer stopped it",
};

export const transferWords = (raw: string): string => SLSKD_STATE[raw] ?? raw;
