import { fold, parseTitle, splitArtists } from "../normalize/index.ts";

export interface ParsedPath {
	artist: string | null;
	title: string;
	mixName: string | null;
	remixer: string | null;
	// Folder names, nearest first: a hint when the filename has no artist.
	folders: string[];
}

const TRACK_NUMBER = /^(?:\(?\d{1,3}\)?[\s._)-]+|[A-D]\d{1,2}[\s._)-]+)/;

// Peers share Windows-style paths. Handles "01 - Artist - Title.mp3",
// "Artist_-_Title.flac", "A1. Title.wav", and a bare "Title.mp3" whose artist is
// in the folder ("Artist - Album (2019)").
export function parseCandidatePath(path: string): ParsedPath {
	const segments = path.split(/[\\/]+/).filter(Boolean);
	const file = (segments.pop() ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
	const folders = segments.reverse();
	let name = file.replace(/_/g, " ").replace(/\s+/g, " ").trim();
	name = name.replace(TRACK_NUMBER, "");
	const parts = name
		.split(/\s+[-–—]\s+/)
		.map((p) => p.trim())
		.filter(Boolean);
	let artist: string | null = null;
	let titleRaw = name;
	if (parts.length >= 2) {
		// "Artist - Title - Mix" is read as the title carrying a mix suffix.
		artist = parts[0] as string;
		titleRaw = parts.slice(1).join(" - ");
	} else {
		const folderArtist = folders
			.map((f) => /^(.+?)\s+[-–—]\s+/.exec(f)?.[1])
			.find(Boolean);
		artist = folderArtist ?? null;
	}
	const title = parseTitle(titleRaw);
	return {
		artist,
		title: title.base || titleRaw,
		mixName: title.mixName,
		remixer: title.remixer,
		folders,
	};
}

export const artistWords = (artists: string | null | undefined): string =>
	splitArtists(artists).map(fold).join(" ");
