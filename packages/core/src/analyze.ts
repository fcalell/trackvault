import { hashFile } from "./hash/index.ts";
import { type AudioInfo, readTags, type TrackTags } from "./tags/index.ts";

export interface FileAnalysis {
	tags: TrackTags;
	audio: AudioInfo;
	hasArt: boolean;
	audioHash: string;
	fileHash: string;
	size: number;
	framesFound: boolean;
}

// Everything the scanner learns about one file: tags, audio properties and
// both hashes. A file the tag reader rejects still gets its hashes, with empty
// tags and `framesFound` false, so it is flagged rather than lost.
export async function analyzeFile(path: string): Promise<FileAnalysis> {
	const identity = await hashFile(path);
	let read: Awaited<ReturnType<typeof readTags>> | null = null;
	try {
		read = await readTags(path);
	} catch {
		read = null;
	}
	return {
		tags: read?.tags ?? EMPTY_TAGS,
		audio: read?.audio ?? {
			format: "mp3",
			bitrateKbps: 0,
			sampleRate: 0,
			channels: 0,
			durationMs: 0,
		},
		hasArt: read?.hasArt ?? false,
		audioHash: identity.audioHash,
		fileHash: identity.fileHash,
		size: identity.size,
		framesFound: identity.framesFound && read !== null,
	};
}

const EMPTY_TAGS: TrackTags = {
	title: null,
	artist: null,
	albumArtist: null,
	album: null,
	genre: null,
	year: null,
	label: null,
	isrc: null,
	bpm: null,
	key: null,
	comment: null,
	rating: 0,
	energy: null,
	remixer: null,
};
