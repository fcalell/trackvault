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
