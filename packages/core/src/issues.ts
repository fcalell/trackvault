// Quality flags of a track, one bit each in `tracks.issues`. A bit is cleared
// by fixing the track (a tag edit, a rescan), never stored apart from the track.
export const ISSUE = {
	lowBitrate: 1,
	noTitle: 2,
	noArtist: 4,
	noGenre: 8,
	noBpm: 16,
	noKey: 32,
	noArt: 64,
	undecodable: 128,
	// Set by the scanner: no file of the track is on disk.
	missingFile: 256,
	// Set by the integrity check: ffmpeg could not decode the file to its end.
	corrupt: 512,
	// Set by the bitrate check: the audio ends at the lowpass of a lower bitrate.
	fakeBitrate: 1024,
	// Every file of the track sits in the quarantine; the library list hides it.
	quarantined: 2048,
} as const;

// The bits a health check or the quarantine decides: a rescan or a tag edit keeps them.
export const KEPT_ISSUES: number =
	ISSUE.undecodable |
	ISSUE.missingFile |
	ISSUE.corrupt |
	ISSUE.fakeBitrate |
	ISSUE.quarantined;

export type IssueName = keyof typeof ISSUE;

export interface IssueInput {
	title: string | null;
	artist: string | null;
	genre: string | null;
	bpm: number | null;
	key: string | null;
	hasArt: boolean;
	bitrateKbps: number;
	framesFound: boolean;
}

// `lowBitrateKbps`: a track under it is flagged (0 turns the check off).
export function issuesOf(input: IssueInput, lowBitrateKbps: number): number {
	let bits = 0;
	if (
		input.framesFound &&
		lowBitrateKbps > 0 &&
		input.bitrateKbps > 0 &&
		input.bitrateKbps < lowBitrateKbps
	) {
		bits |= ISSUE.lowBitrate;
	}
	if (!input.title) bits |= ISSUE.noTitle;
	if (!input.artist) bits |= ISSUE.noArtist;
	if (!input.genre) bits |= ISSUE.noGenre;
	if (!input.bpm) bits |= ISSUE.noBpm;
	if (!input.key) bits |= ISSUE.noKey;
	if (!input.hasArt) bits |= ISSUE.noArt;
	if (!input.framesFound) bits |= ISSUE.undecodable;
	return bits;
}
