import type {
	ChipMark,
	IconName,
	StatusMark,
	Tone,
} from "@fcalell/ui-core/descriptors";

// What the acquisition places say of an inbox item, a download or a want, in words.

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
	"needs-review": { tone: "attention", label: "Needs you" },
	approved: { tone: "done", label: "Filed" },
	rejected: { tone: "idle", label: "Rejected" },
	failed: { tone: "failed", label: "Failed" },
};

export const DECISION: Record<string, ChipMark> = {
	accept: { family: "green", label: "New track" },
	"duplicate-of": { family: "neutral", label: "Duplicate" },
	"better-than-existing": { family: "teal", label: "Better copy" },
	"needs-review": { family: "amber", label: "Review" },
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

export const HAVE_LABELS: Record<string, string> = {
	have: "In the library",
	"other-version": "Another version in the library",
	maybe: "Maybe in the library",
};

export const IMPORT_STATUS: Record<string, ChipMark> = {
	matched: { family: "green", label: "In the library" },
	missing: { family: "red", label: "Missing" },
	uncertain: { family: "amber", label: "Not sure" },
	"other-version": { family: "teal", label: "Other mix" },
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

const MB = 1024 * 1024;

// 12.4 MB.
export function megabytes(bytes: number): string {
	return bytes >= 1024 * MB
		? `${(bytes / (1024 * MB)).toFixed(1)} GB`
		: `${(bytes / MB).toFixed(1)} MB`;
}

// 480 KB/s.
export function speed(bytesPerSecond: number): string {
	return bytesPerSecond >= MB
		? `${(bytesPerSecond / MB).toFixed(1)} MB/s`
		: `${Math.round(bytesPerSecond / 1024)} KB/s`;
}

export const nameOf = (parts: {
	artist: string | null;
	title: string | null;
}): string | null =>
	parts.title ? [parts.artist, parts.title].filter(Boolean).join(" - ") : null;

// "in 5 min", "in 3 h", "in 2 days": when something is due; "now" when it is.
export function until(date: Date | null, now = Date.now()): string | null {
	if (!date) return null;
	const minutes = Math.round((date.getTime() - now) / 60_000);
	if (minutes <= 0) return "now";
	if (minutes < 60) return `in ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `in ${hours} h`;
	return `in ${Math.round(hours / 24)} days`;
}

// "Artist - Title (Mix)" of a want.
export const wantName = (want: {
	artist: string;
	title: string;
	mix: string | null;
}): string =>
	`${want.artist} - ${want.title}${want.mix ? ` (${want.mix})` : ""}`;
