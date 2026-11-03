import type { MasterDb } from "./db.ts";

// Typed, batch readers: one query per table, joined in memory by maps. Each
// returns plain serialisable data (no Dates, no Maps in the public shapes that
// cross a process boundary, except where noted).

// "2025-04-12 19:11:29.274 +00:00" (what Rekordbox writes) to epoch ms.
const DATE_RE =
	/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s*(Z|[+-]\d{2}:\d{2})?/;

export function parseRbDate(value: string | null | undefined): number | null {
	if (!value) return null;
	const m = DATE_RE.exec(value);
	if (!m) return null;
	const ms = Date.parse(`${m[1]}T${m[2]}${m[3] ?? "Z"}`);
	return Number.isNaN(ms) ? null : ms;
}

// Stars 0..5 from the stored rating. Rekordbox's XML uses 0,51,..,255; the stored
// scale of master.db is not verified (VERIFY.md), so both are understood.
export function starsOf(raw: number | null): number {
	if (!raw || raw < 0) return 0;
	return raw <= 5 ? raw : Math.min(5, Math.round(raw / 51));
}

function nameMap(
	db: MasterDb,
	table: string,
	column = "Name",
): Map<string, string> {
	const map = new Map<string, string>();
	const rows = db
		.prepare(`SELECT ID, ${column} AS v FROM ${table}`)
		.raw()
		.all() as [string, string | null][];
	for (const [id, v] of rows) if (v !== null) map.set(String(id), v);
	return map;
}

export interface RbColor {
	id: string;
	name: string;
	code: number | null;
	sortKey: number | null;
}

export function readColors(db: MasterDb): RbColor[] {
	const rows = db
		.prepare(
			"SELECT ID, Commnt, ColorCode, SortKey FROM djmdColor ORDER BY SortKey",
		)
		.all() as {
		ID: string;
		Commnt: string | null;
		ColorCode: number | null;
		SortKey: number | null;
	}[];
	return rows.map((r) => ({
		id: String(r.ID),
		name: r.Commnt ?? "",
		code: r.ColorCode,
		sortKey: r.SortKey,
	}));
}

export interface RbMyTag {
	id: string;
	name: string;
	// "root" parents come back as null. A folder (group) of tags has `isGroup`.
	parentId: string | null;
	seq: number;
	isGroup: boolean;
}

export interface RbMyTags {
	tags: RbMyTag[];
	// contentId -> tag ids, in TrackNo order.
	byContent: Map<string, string[]>;
}

export function readMyTags(db: MasterDb): RbMyTags {
	const tagRows = db
		.prepare(
			"SELECT ID, Seq, Name, Attribute, ParentID FROM djmdMyTag ORDER BY Seq",
		)
		.all() as {
		ID: string;
		Seq: number | null;
		Name: string | null;
		Attribute: number | null;
		ParentID: string | null;
	}[];
	const tags = tagRows.map<RbMyTag>((r) => ({
		id: String(r.ID),
		name: r.Name ?? "",
		parentId: !r.ParentID || r.ParentID === "root" ? null : String(r.ParentID),
		seq: r.Seq ?? 0,
		isGroup: r.Attribute === 1,
	}));
	const byContent = new Map<string, string[]>();
	const rows = db
		.prepare(
			"SELECT ContentID, MyTagID FROM djmdSongMyTag ORDER BY ContentID, TrackNo",
		)
		.raw()
		.all() as [string, string][];
	for (const [contentId, tagId] of rows) {
		const list = byContent.get(String(contentId));
		if (list) list.push(String(tagId));
		else byContent.set(String(contentId), [String(tagId)]);
	}
	return { tags, byContent };
}

export interface RbTrack {
	id: string;
	uuid: string | null;
	// As Rekordbox stores it (forward slashes on both platforms).
	path: string;
	fileName: string | null;
	title: string | null;
	artist: string | null;
	remixer: string | null;
	album: string | null;
	albumArtist: string | null;
	genre: string | null;
	label: string | null;
	// Musical key name as in djmdKey.ScaleName (notation follows the user's setting).
	key: string | null;
	// BPM / 100; null when unanalysed (0).
	bpm: number | null;
	// Stars 0..5 and the raw stored value.
	rating: number;
	ratingRaw: number | null;
	colorId: string | null;
	color: string | null;
	comment: string | null;
	myTagIds: string[];
	myTags: string[];
	year: number | null;
	trackNo: number | null;
	durationSec: number | null;
	bitrate: number | null;
	sampleRate: number | null;
	bitDepth: number | null;
	fileSize: number | null;
	fileType: number | null;
	playCount: number;
	// Relative to the library's `share` directory, e.g. "/PIONEER/USBANLZ/P016/0000875E/ANLZ0000.DAT".
	analysisDataPath: string | null;
	analysed: boolean;
	addedAt: number | null;
	createdAt: number | null;
	updatedAt: number | null;
}

type ContentRow = {
	ID: string;
	UUID: string | null;
	FolderPath: string | null;
	FileNameL: string | null;
	Title: string | null;
	ArtistID: string | null;
	RemixerID: string | null;
	AlbumID: string | null;
	GenreID: string | null;
	LabelID: string | null;
	KeyID: string | null;
	ColorID: string | null;
	BPM: number | null;
	Rating: number | null;
	Commnt: string | null;
	ReleaseYear: number | null;
	TrackNo: number | null;
	Length: number | null;
	BitRate: number | null;
	SampleRate: number | null;
	BitDepth: number | null;
	FileSize: number | null;
	FileType: number | null;
	DJPlayCount: string | number | null;
	AnalysisDataPath: string | null;
	Analysed: number | null;
	StockDate: string | null;
	created_at: string | null;
	updated_at: string | null;
};

const CONTENT_SQL = `SELECT ID, UUID, FolderPath, FileNameL, Title, ArtistID, RemixerID,
	AlbumID, GenreID, LabelID, KeyID, ColorID, BPM, Rating, Commnt, ReleaseYear, TrackNo,
	Length, BitRate, SampleRate, BitDepth, FileSize, FileType, DJPlayCount,
	AnalysisDataPath, Analysed, StockDate, created_at, updated_at
	FROM djmdContent`;

// The whole collection. Tracks the user never imported a file for (streaming
// rows without a FolderPath) are skipped.
export function readCollection(db: MasterDb): RbTrack[] {
	const artists = nameMap(db, "djmdArtist");
	const genres = nameMap(db, "djmdGenre");
	const labels = nameMap(db, "djmdLabel");
	const keys = nameMap(db, "djmdKey", "ScaleName");
	const colors = nameMap(db, "djmdColor", "Commnt");
	const albums = nameMap(db, "djmdAlbum");
	const albumArtistId = new Map<string, string>();
	for (const [id, artistId] of db
		.prepare(
			"SELECT ID, AlbumArtistID FROM djmdAlbum WHERE AlbumArtistID IS NOT NULL",
		)
		.raw()
		.all() as [string, string][]) {
		albumArtistId.set(String(id), String(artistId));
	}
	const myTags = readMyTags(db);
	const tagName = new Map(myTags.tags.map((t) => [t.id, t.name]));

	const tracks: RbTrack[] = [];
	for (const r of db
		.prepare(CONTENT_SQL)
		.iterate() as IterableIterator<ContentRow>) {
		if (!r.FolderPath) continue;
		const id = String(r.ID);
		const tagIds = myTags.byContent.get(id) ?? [];
		const albumId = r.AlbumID ? String(r.AlbumID) : null;
		const aaId = albumId ? albumArtistId.get(albumId) : undefined;
		tracks.push({
			id,
			uuid: r.UUID,
			path: r.FolderPath,
			fileName: r.FileNameL,
			title: r.Title,
			artist: r.ArtistID ? (artists.get(String(r.ArtistID)) ?? null) : null,
			remixer: r.RemixerID ? (artists.get(String(r.RemixerID)) ?? null) : null,
			album: albumId ? (albums.get(albumId) ?? null) : null,
			albumArtist: aaId ? (artists.get(aaId) ?? null) : null,
			genre: r.GenreID ? (genres.get(String(r.GenreID)) ?? null) : null,
			label: r.LabelID ? (labels.get(String(r.LabelID)) ?? null) : null,
			key: r.KeyID ? (keys.get(String(r.KeyID)) ?? null) : null,
			bpm: r.BPM ? r.BPM / 100 : null,
			rating: starsOf(r.Rating),
			ratingRaw: r.Rating,
			colorId: r.ColorID && r.ColorID !== "0" ? String(r.ColorID) : null,
			color: r.ColorID ? (colors.get(String(r.ColorID)) ?? null) : null,
			comment: r.Commnt,
			myTagIds: tagIds,
			myTags: tagIds.map((t) => tagName.get(t) ?? t),
			year: r.ReleaseYear || null,
			trackNo: r.TrackNo || null,
			durationSec: r.Length || null,
			bitrate: r.BitRate || null,
			sampleRate: r.SampleRate || null,
			bitDepth: r.BitDepth || null,
			fileSize: r.FileSize,
			fileType: r.FileType,
			playCount: Number(r.DJPlayCount) || 0,
			analysisDataPath: r.AnalysisDataPath,
			analysed: (r.Analysed ?? 0) > 0,
			addedAt: parseRbDate(r.StockDate),
			createdAt: parseRbDate(r.created_at),
			updatedAt: parseRbDate(r.updated_at),
		});
	}
	return tracks;
}

// ---- playlists ----------------------------------------------------------------

export type RbPlaylistKind = "playlist" | "folder" | "smart";

export interface RbPlaylist {
	id: string;
	// null at the top level (Rekordbox's "root").
	parentId: string | null;
	name: string;
	kind: RbPlaylistKind;
	seq: number;
	// The smart playlist's rule XML as stored, for smart playlists.
	smartList: string | null;
	// Rekordbox's own hidden lists (100000 Cloud Library Sync, 200000 CUE Analysis).
	special: boolean;
	updatedAt: number | null;
}

export interface RbPlaylists {
	// Sorted by (parent, seq): a children list is a contiguous filter away.
	nodes: RbPlaylist[];
	// playlistId -> ordered content ids. Smart playlists have none stored (Rekordbox
	// evaluates the rule itself).
	tracks: Map<string, string[]>;
}

const SPECIAL_PLAYLIST_IDS = new Set(["100000", "200000"]);

export function readPlaylists(db: MasterDb): RbPlaylists {
	const rows = db
		.prepare(
			"SELECT ID, ParentID, Name, Attribute, Seq, SmartList, updated_at FROM djmdPlaylist ORDER BY ParentID, Seq",
		)
		.all() as {
		ID: string;
		ParentID: string | null;
		Name: string | null;
		Attribute: number | null;
		Seq: number | null;
		SmartList: string | null;
		updated_at: string | null;
	}[];
	const nodes = rows.map<RbPlaylist>((r) => ({
		id: String(r.ID),
		parentId: !r.ParentID || r.ParentID === "root" ? null : String(r.ParentID),
		name: r.Name ?? "",
		kind:
			r.Attribute === 1 ? "folder" : r.Attribute === 4 ? "smart" : "playlist",
		seq: r.Seq ?? 0,
		smartList: r.SmartList || null,
		special: SPECIAL_PLAYLIST_IDS.has(String(r.ID)),
		updatedAt: parseRbDate(r.updated_at),
	}));
	const tracks = new Map<string, string[]>();
	const songs = db
		.prepare(
			"SELECT PlaylistID, ContentID FROM djmdSongPlaylist ORDER BY PlaylistID, TrackNo",
		)
		.raw()
		.all() as [string, string][];
	for (const [playlistId, contentId] of songs) {
		const list = tracks.get(String(playlistId));
		if (list) list.push(String(contentId));
		else tracks.set(String(playlistId), [String(contentId)]);
	}
	return { nodes, tracks };
}

export interface RbPlaylistNode extends RbPlaylist {
	children: RbPlaylistNode[];
	trackIds: string[];
}

// The tree for display: top-level nodes with `children` and ordered `trackIds`.
export function playlistTree(
	playlists: RbPlaylists,
	options: { includeSpecial?: boolean } = {},
): RbPlaylistNode[] {
	const byId = new Map<string, RbPlaylistNode>();
	for (const n of playlists.nodes) {
		if (n.special && !options.includeSpecial) continue;
		byId.set(n.id, {
			...n,
			children: [],
			trackIds: playlists.tracks.get(n.id) ?? [],
		});
	}
	const roots: RbPlaylistNode[] = [];
	for (const node of byId.values()) {
		const parent = node.parentId ? byId.get(node.parentId) : undefined;
		(parent ? parent.children : roots).push(node);
	}
	return roots;
}

// ---- cues -------------------------------------------------------------------

export interface RbCue {
	id: string;
	contentId: string;
	// Raw djmdCue.Kind: 0 memory cue, >0 hot cue (see VERIFY.md for the loop encoding).
	kind: number;
	type: "memory" | "hotcue" | "loop";
	// 1 = A .. 8 = H for hot cues, else null.
	hotCue: number | null;
	startMs: number;
	// The loop end, null for a plain cue (stored as -1).
	endMs: number | null;
	// Raw djmdCue.Color (-1: none) and the palette index.
	color: number | null;
	colorTableIndex: number | null;
	comment: string | null;
	activeLoop: boolean;
	beatLoopSize: number | null;
}

export function readCues(db: MasterDb): Map<string, RbCue[]> {
	const out = new Map<string, RbCue[]>();
	const rows = db
		.prepare(
			`SELECT ID, ContentID, Kind, InMsec, OutMsec, Color, ColorTableIndex, ActiveLoop,
				Comment, BeatLoopSize FROM djmdCue ORDER BY ContentID, InMsec`,
		)
		.iterate() as IterableIterator<{
		ID: string;
		ContentID: string;
		Kind: number | null;
		InMsec: number | null;
		OutMsec: number | null;
		Color: number | null;
		ColorTableIndex: number | null;
		ActiveLoop: number | null;
		Comment: string | null;
		BeatLoopSize: number | null;
	}>;
	for (const r of rows) {
		const kind = r.Kind ?? 0;
		const endMs = r.OutMsec !== null && r.OutMsec >= 0 ? r.OutMsec : null;
		const cue: RbCue = {
			id: String(r.ID),
			contentId: String(r.ContentID),
			kind,
			type: endMs !== null ? "loop" : kind > 0 ? "hotcue" : "memory",
			hotCue: kind > 0 ? kind : null,
			startMs: r.InMsec ?? 0,
			endMs,
			color: r.Color !== null && r.Color >= 0 ? r.Color : null,
			colorTableIndex: r.ColorTableIndex,
			comment: r.Comment || null,
			activeLoop: (r.ActiveLoop ?? 0) > 0,
			beatLoopSize: r.BeatLoopSize,
		};
		const list = out.get(cue.contentId);
		if (list) list.push(cue);
		else out.set(cue.contentId, [cue]);
	}
	return out;
}

// ---- play history -------------------------------------------------------------

export interface RbHistorySession {
	id: string;
	parentId: string | null;
	name: string;
	// Folders (e.g. a year) hold sessions; a session holds plays.
	isFolder: boolean;
	seq: number;
	dateCreated: string | null;
	plays: { contentId: string; trackNo: number; playedAt: number | null }[];
}

export function readHistory(db: MasterDb): RbHistorySession[] {
	const rows = db
		.prepare(
			"SELECT ID, Seq, Name, Attribute, ParentID, DateCreated FROM djmdHistory ORDER BY Seq",
		)
		.all() as {
		ID: string;
		Seq: number | null;
		Name: string | null;
		Attribute: number | null;
		ParentID: string | null;
		DateCreated: string | null;
	}[];
	const sessions = new Map<string, RbHistorySession>();
	for (const r of rows) {
		sessions.set(String(r.ID), {
			id: String(r.ID),
			parentId:
				!r.ParentID || r.ParentID === "root" ? null : String(r.ParentID),
			name: r.Name ?? "",
			isFolder: r.Attribute === 1,
			seq: r.Seq ?? 0,
			dateCreated: r.DateCreated,
			plays: [],
		});
	}
	const songs = db
		.prepare(
			"SELECT HistoryID, ContentID, TrackNo, created_at FROM djmdSongHistory ORDER BY HistoryID, TrackNo",
		)
		.iterate() as IterableIterator<{
		HistoryID: string;
		ContentID: string;
		TrackNo: number | null;
		created_at: string | null;
	}>;
	for (const s of songs) {
		sessions.get(String(s.HistoryID))?.plays.push({
			contentId: String(s.ContentID),
			trackNo: s.TrackNo ?? 0,
			playedAt: parseRbDate(s.created_at),
		});
	}
	return [...sessions.values()];
}
