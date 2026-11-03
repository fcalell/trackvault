import { DEFAULT_FORMATS } from "@trackvault/core/ranking";

// What "the quality I want" setting means for the ranking (core/ranking `FormatRule`
// scores: lossless 0.9 and up, mp3 320 0.8, mp3 256 0.6, V0 0.72).
export const WANTED_QUALITY = ["any", "good", "high", "lossless"] as const;
export type WantedQuality = (typeof WANTED_QUALITY)[number];

export const WANTED_QUALITY_FLOOR: Record<WantedQuality, number> = {
	any: 0,
	good: 0.55,
	high: 0.72,
	lossless: 0.9,
};

export const WANTED_QUALITY_LABELS: Record<WantedQuality, string> = {
	any: "Any format",
	good: "Good: mp3 256 and up",
	high: "High: mp3 320, V0 or lossless",
	lossless: "Lossless only",
};

// The format score of a file as the ranking would give it (0 when no rule fits).
export function formatScoreOf(
	extension: string,
	bitrate: number | null,
	vbr: boolean | null = null,
): number {
	for (const rule of DEFAULT_FORMATS) {
		if (!rule.extensions.includes(extension.toLowerCase())) continue;
		if (rule.minBitrate !== undefined && (bitrate ?? 0) < rule.minBitrate)
			continue;
		if (rule.vbr !== undefined && (vbr === true) !== rule.vbr) continue;
		return rule.score;
	}
	return 0;
}

export const INBOX_GROUPS = ["ready", "review", "processing", "done"] as const;
export type InboxGroup = (typeof INBOX_GROUPS)[number];

// What a list or a selection can be of: one group, or "waiting", the two the owner
// acts on (Ready and Needs you), which the selection bar counts and Select all takes.
export const INBOX_FILTERS = [...INBOX_GROUPS, "waiting"] as const;
export type InboxFilterGroup = (typeof INBOX_FILTERS)[number];

export const INBOX_GROUP_LABELS: Record<InboxGroup, string> = {
	ready: "Ready",
	review: "Needs you",
	processing: "Processing",
	done: "Done",
};

export const STEP_LABELS = {
	hash: "Hash",
	fingerprint: "Fingerprint",
	dedupe: "Duplicate check",
	rules: "Clean up tags",
	taxonomy: "Unify genres and names",
	autotag: "Auto-tag",
	organise: "Choose target path",
	approve: "Approve",
} as const;

export const WISHLIST_VIEWS = ["active", "found", "done", "closed"] as const;
export type WishlistView = (typeof WISHLIST_VIEWS)[number];

export const WISHLIST_VIEW_LABELS: Record<WishlistView, string> = {
	active: "Wanted",
	found: "Found, to review",
	done: "In the library",
	closed: "Given up or ignored",
};
