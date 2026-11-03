// What the R4 screens share with the hub.

export const PROPOSAL_STATE_LABELS = {
	pending: "Waiting",
	accepted: "Accepted",
	applied: "Applied",
	rejected: "Rejected",
	stale: "Changed since",
} as const;
export const PROPOSAL_VIEWS = [
	"pending",
	"applied",
	"rejected",
	"stale",
] as const;
export type ProposalView = (typeof PROPOSAL_VIEWS)[number];

export const AUTOTAG_POLICIES = ["fill-empty", "overwrite"] as const;

export const ANALYSIS_WINDOWS = ["60", "120", "whole"] as const;
export type AnalysisWindow = (typeof ANALYSIS_WINDOWS)[number];
export const ANALYSIS_WINDOW_LABELS = {
	"60": "60 seconds",
	"120": "120 seconds",
	whole: "Whole track",
} as const;

// The seconds the analysis reads from a track's middle; none for the whole track.
export const windowSecOf = (window: AnalysisWindow): number | undefined =>
	window === "whole" ? undefined : Number(window);
export const AUTOTAG_POLICY_LABELS = {
	"fill-empty": "Fill empty tags only",
	overwrite: "Overwrite differing tags",
} as const;

export const SOURCE_LABELS: Record<string, string> = {
	musicbrainz: "MusicBrainz",
	acoustid: "AcoustID",
	discogs: "Discogs",
	beatport: "Beatport",
	deezer: "Deezer",
};
