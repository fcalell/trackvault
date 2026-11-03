// The model both sides share: what a USB export holds, with numeric ids as the players
// see them. Tracks carry the strings and numbers a CDJ shows; the rest is references.

export interface PdbTrack {
	id: number;
	title: string;
	artistId: number;
	albumId: number;
	genreId: number;
	labelId: number;
	keyId: number;
	remixerId: number;
	composerId: number;
	originalArtistId: number;
	artworkId: number;
	colorId: number;
	// 0..5
	rating: number;
	// beats per minute x 100
	tempo: number;
	durationSec: number;
	year: number;
	trackNumber: number;
	discNumber: number;
	playCount: number;
	sampleRate: number;
	sampleDepth: number;
	bitrate: number;
	fileSize: number;
	mixName: string;
	comment: string;
	dateAdded: string;
	releaseDate: string;
	analyzePath: string;
	analyzeDate: string;
	filename: string;
	filePath: string;
}

export interface PdbArtist {
	id: number;
	name: string;
}
export interface PdbAlbum {
	id: number;
	artistId: number;
	name: string;
}
export interface PdbNamed {
	id: number;
	name: string;
}
export interface PdbArtwork {
	id: number;
	path: string;
}
export interface PdbPlaylistNode {
	id: number;
	// 0 at the root
	parentId: number;
	sortOrder: number;
	isFolder: boolean;
	name: string;
}
export interface PdbPlaylistEntry {
	playlistId: number;
	trackId: number;
	// 1-based position
	index: number;
}

export interface PdbTableRef {
	type: number;
	emptyCandidate: number;
	firstPage: number;
	lastPage: number;
}

export interface Pdb {
	pageSize: number;
	sequence: number;
	nextUnusedPage: number;
	tables: PdbTableRef[];
	tracks: PdbTrack[];
	artists: PdbArtist[];
	albums: PdbAlbum[];
	genres: PdbNamed[];
	labels: PdbNamed[];
	keys: PdbNamed[];
	colors: PdbNamed[];
	artwork: PdbArtwork[];
	playlistTree: PdbPlaylistNode[];
	playlistEntries: PdbPlaylistEntry[];
}
