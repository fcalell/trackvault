// The TrackVault sync protocol, version 1: everything an agent and the hub's `/sync`
// service say to each other. Pure data and validators, no I/O. The hub mounts the
// routes (`routes.ts`) with `http.mount("/sync", ...)`; the agent is the only client.
//
// Conventions
//  - Auth: every request carries `Authorization: Bearer stk_...` (a device key) and
//    `x-tv-protocol: 1`. The hub answers 401 (`unauthorized`) for a missing, revoked or
//    expired key and 426 (`protocol-unsupported`) for a protocol it does not speak.
//  - JSON bodies are `application/json`, validated with the `Check`s below. Unknown keys
//    are ignored, so a newer peer can add fields without a version bump.
//  - Times are ISO strings, except `*Ms` / `playedAt` (epoch milliseconds).
//  - Hashes are lower-case hex. `audioHash` is the audio-frame identity of the track,
//    `fileHash` the whole file (core `hashFile`); `anlz` blob hashes are the sha256 of
//    the blob bytes.
//  - A track is addressed by the hub's `trackId` (a UUID). Rekordbox ids (`contentId`,
//    playlist ids) are per install and only appear next to the device they came from.
//  - Errors: `ErrorBody` with the status noted per route.

import {
	arr,
	bool,
	type Check,
	custom,
	type Infer,
	int,
	nullable,
	obj,
	oneOf,
	optional,
	record,
	str,
	variants,
} from "./check.ts";

export const PROTOCOL_VERSION = 1;

// ---- errors -------------------------------------------------------------------------

export const ERROR_CODES = [
	"unauthorized", // 401
	"protocol-unsupported", // 426
	"bad-request", // 400, the body failed validation
	"not-found", // 404, unknown track / upload / blob
	"file-changed", // 409, the file's fileHash is not the one the agent asked for
	"offset-mismatch", // 409, a chunk offset is not the hub's `received`; body carries it
	"hash-mismatch", // 422, the finished upload or blob does not hash to what was declared
	"cursor-expired", // 410, the cursor is unknown: restart from `null`
	"base-mismatch", // 409, the Rekordbox base the batch was diffed against is not the hub's
	"too-large", // 413
	"busy", // 429 / 503, retry later (honour Retry-After)
	"internal", // 500
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ErrorBody = obj({
	error: obj({
		code: oneOf(...ERROR_CODES),
		message: str,
		// Code-specific extra data: `{ received }` for offset-mismatch,
		// `{ expected: SnapshotRef }` for base-mismatch.
		detail: optional(
			record(
				custom<string | number | boolean | null>("scalar", (v) =>
					v === null ||
					typeof v === "string" ||
					typeof v === "number" ||
					typeof v === "boolean"
						? v
						: undefined,
				),
			),
		),
	}),
});
export type ErrorBody = Infer<typeof ErrorBody>;

// ---- hello / register -----------------------------------------------------------------

export const PLATFORMS = ["darwin", "win32", "linux"] as const;

export const WRITE_SUPPORT = [
	"supported", // schema known and DBVersion on the allowlist
	"pending-verification", // the allowlist is empty: writes wait for the R2 spike
	"unsupported-schema", // a schema or DBVersion the writer does not know
	"cloud-sync", // Rekordbox Cloud Library Sync looks on: export refused
	"unknown",
] as const;
export type WriteSupport = (typeof WRITE_SUPPORT)[number];

export const RekordboxStatus = obj({
	installed: bool,
	// The Rekordbox application version when it could be read (best effort), else null.
	appVersion: nullable(str),
	// `DjmdProperty.DBVersion` of the install's master.db.
	dbVersion: nullable(str),
	running: nullable(bool),
	writeSupport: oneOf(...WRITE_SUPPORT),
	exportState: oneOf(
		"idle",
		"waiting-for-rekordbox",
		"applying",
		"blocked",
		"error",
	),
	// Export changes the hub holds for this device that are not applied yet.
	pendingExport: int,
	lastImportAt: nullable(str),
	lastExportAt: nullable(str),
	message: nullable(str),
});
export type RekordboxStatus = Infer<typeof RekordboxStatus>;

export const SnapshotRef = obj({
	// Random id of one lineage of bases. A new id means the agent started over.
	id: str,
	// 0 = the agent has no base (first import). Each accepted import or export
	// advances it by one.
	version: int,
});
export type SnapshotRef = Infer<typeof SnapshotRef>;

export const DeviceHello = obj({
	protocol: int,
	agentVersion: str,
	// Human name from the pairing (the device key's name by default).
	name: str,
	platform: oneOf(...PLATFORMS),
	hostname: optional(str),
	// Absolute path of the replica root on the device.
	localRoot: nullable(str),
	freeDiskBytes: nullable(int),
	totalDiskBytes: nullable(int),
	// What this agent does: "replica" mirrors the library, "upload" watches folders.
	modes: arr(oneOf("replica", "upload", "rekordbox")),
	rekordbox: RekordboxStatus,
	// The manifest cursor and Rekordbox base this agent holds.
	manifestCursor: nullable(str),
	rekordboxBase: nullable(SnapshotRef),
});
export type DeviceHello = Infer<typeof DeviceHello>;

export const HubSettings = obj({
	// Entries per manifest page the hub prefers.
	manifestPageSize: int,
	// Upload chunk size in bytes.
	chunkSize: int,
	// Seconds between polls when the live channel is quiet.
	pollSeconds: int,
	// Concurrent file downloads the hub is happy to serve one device.
	maxDownloads: int,
});
export type HubSettings = Infer<typeof HubSettings>;

export const HelloResponse = obj({
	protocol: int,
	// The hub's id for this device (the device key's record).
	deviceId: str,
	serverTime: str,
	libraryVersion: int,
	settings: HubSettings,
	// False when the hub does not want Rekordbox changes from this device (feature off).
	rekordboxEnabled: bool,
});
export type HelloResponse = Infer<typeof HelloResponse>;

// ---- manifest ---------------------------------------------------------------------------

export const ManifestRequest = obj({
	// `null` asks for everything. Otherwise the `cursor` of the last page applied.
	cursor: nullable(str),
	limit: optional(int),
});
export type ManifestRequest = Infer<typeof ManifestRequest>;

export const ManifestEntry = obj({
	trackId: str,
	audioHash: str,
	fileHash: str,
	size: int,
	// Path under the library root, "/" separators, already safe (no "..", not absolute).
	relPath: str,
});
export type ManifestEntry = Infer<typeof ManifestEntry>;

export const ManifestPage = obj({
	// Opaque. Where to resume after this page; send it back as `ManifestRequest.cursor`.
	cursor: str,
	hasMore: bool,
	// New tracks, changed files (a different fileHash) and moves (a different relPath).
	upserts: arr(ManifestEntry),
	// Tracks removed from the library (quarantined or deleted).
	deletes: arr(str),
	libraryVersion: int,
});
export type ManifestPage = Infer<typeof ManifestPage>;

// ---- files (GET /sync/files/:trackId) -----------------------------------------------------

// The download is a plain GET with `Range: bytes=N-` for a resume. The hub answers
//   200 / 206 with `Accept-Ranges: bytes`, `ETag: "<fileHash>"`, `x-tv-file-hash`,
//   `x-tv-audio-hash`, `Content-Length`; `If-Range: "<fileHash>"` is honoured (a
//   mismatch answers 200 with the whole current file); 404 for an unknown track;
//   409 `file-changed` when the query `?fileHash=` is given and no longer current.
export const FILE_HEADERS = {
	fileHash: "x-tv-file-hash",
	audioHash: "x-tv-audio-hash",
} as const;

// ---- device state ---------------------------------------------------------------------------

export const FILE_STATES = [
	"pending", // wanted, not on disk
	"downloading",
	"ok", // on disk, fileHash verified
	"failed", // retrying with backoff
	"trashed", // removed locally after a hub delete
	"missing", // was ok, the file vanished from disk (will be fetched again)
] as const;
export type FileState = (typeof FILE_STATES)[number];

export const FileStateEntry = obj({
	trackId: str,
	state: oneOf(...FILE_STATES),
	// The fileHash the device holds (ok) or is working toward.
	fileHash: nullable(str),
	error: optional(str),
	at: str,
});
export type FileStateEntry = Infer<typeof FileStateEntry>;

export const DeviceStatus = obj({
	at: str,
	freeDiskBytes: nullable(int),
	replica: nullable(
		obj({
			pending: int,
			downloading: int,
			failed: int,
			ok: int,
			bytesPending: int,
			paused: nullable(str),
		}),
	),
	upload: nullable(
		obj({ queued: int, uploading: int, failed: int, done: int }),
	),
	rekordbox: nullable(RekordboxStatus),
});
export type DeviceStatus = Infer<typeof DeviceStatus>;

// POST /sync/state: file state changes since the last report plus the device status.
export const StateReport = obj({
	files: arr(FileStateEntry),
	status: DeviceStatus,
});
export type StateReport = Infer<typeof StateReport>;

export const Ok = obj({ ok: bool });
export type Ok = Infer<typeof Ok>;

// ---- inbox upload -----------------------------------------------------------------------------

// POST /sync/inbox/check: which of these does the hub already hold (library, inbox,
// quarantine)? The agent does not upload those.
export const InboxCheckRequest = obj({
	items: arr(obj({ audioHash: str, fileHash: str })),
});
export type InboxCheckRequest = Infer<typeof InboxCheckRequest>;

export const InboxCheckResponse = obj({
	// audioHashes the hub knows.
	known: arr(str),
});
export type InboxCheckResponse = Infer<typeof InboxCheckResponse>;

// POST /sync/inbox/uploads. Idempotent on (device, fileHash): the same init returns the
// same upload with its `received` offset, so a restarted agent resumes.
export const UploadInit = obj({
	audioHash: str,
	fileHash: str,
	size: int,
	// File name, and the path below the watched folder ("/" separators, no "..") as a
	// hint for the organiser. Never an absolute path.
	name: str,
	sourceRelPath: optional(str),
	mtimeMs: int,
});
export type UploadInit = Infer<typeof UploadInit>;

export const UploadInitResponse = obj({
	uploadId: str,
	// "exists": the hub already has this audio; nothing to send (uploadId is "").
	status: oneOf("new", "resumed", "exists"),
	received: int,
	chunkSize: int,
});
export type UploadInitResponse = Infer<typeof UploadInitResponse>;

// PUT /sync/inbox/uploads/:uploadId?offset=N with the raw chunk as the body. N must equal
// the hub's `received` (409 `offset-mismatch` with `detail.received` otherwise); a chunk
// that restarts at 0 truncates. GET on the same URL answers `UploadStatus`.
export const UploadChunkResponse = obj({ received: int });
export type UploadChunkResponse = Infer<typeof UploadChunkResponse>;

export const UploadStatus = obj({
	received: int,
	size: int,
	state: oneOf("receiving", "complete", "aborted"),
});
export type UploadStatus = Infer<typeof UploadStatus>;

// POST /sync/inbox/uploads/:uploadId/complete. The hub hashes what it received; 422
// `hash-mismatch` tells the agent to DELETE the upload and start again.
export const UploadComplete = obj({ fileHash: str, audioHash: str });
export type UploadComplete = Infer<typeof UploadComplete>;

export const UploadCompleteResponse = obj({
	status: oneOf("accepted", "duplicate"),
	inboxId: nullable(str),
	trackId: nullable(str),
});
export type UploadCompleteResponse = Infer<typeof UploadCompleteResponse>;

// ---- Rekordbox: shared shapes --------------------------------------------------------------------

// Owned track fields (core `OWNED_TRACK_FIELDS`): the value of one field.
export type FieldValue = string | number | string[] | null;
export const FieldValue: Check<FieldValue> = custom<FieldValue>(
	"string, number, string[] or null",
	(v) => {
		if (v === null || typeof v === "string") return v;
		if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
		if (Array.isArray(v) && v.every((x) => typeof x === "string"))
			return v as string[];
		return undefined;
	},
);

// The fields TrackVault owns on a track. `rating` is stars 0..5, `color` a Rekordbox
// colour name, `myTags` tag names (a set).
export const TRACK_FIELDS = [
	"title",
	"artist",
	"remixer",
	"album",
	"genre",
	"label",
	"year",
	"comment",
	"rating",
	"color",
	"myTags",
] as const;
export type TrackField = (typeof TRACK_FIELDS)[number];

export const TrackFields = record(FieldValue);
export type TrackFields = Infer<typeof TrackFields>;

export const CueEntry = obj({
	// 0 memory cue, 1.. hot cue (1 = A).
	kind: int,
	startMs: int,
	// Loop end; null for a plain cue.
	endMs: nullable(int),
	color: nullable(int),
	colorTableIndex: nullable(int),
	comment: nullable(str),
	activeLoop: bool,
	beatLoopSize: nullable(int),
});
export type CueEntry = Infer<typeof CueEntry>;

export const ANLZ_KINDS = ["DAT", "EXT", "2EX"] as const;
export const AnlzRef = obj({
	trackId: str,
	kind: oneOf(...ANLZ_KINDS),
	// sha256 of the file bytes.
	hash: str,
	size: int,
});
export type AnlzRef = Infer<typeof AnlzRef>;

// ---- Rekordbox: import (agent -> hub) -------------------------------------------------------------

export const ImportLink = obj({
	contentId: str,
	trackId: str,
	via: oneOf("path", "hash"),
});
export type ImportLink = Infer<typeof ImportLink>;

export const ImportPlaylist = obj({
	// The device's playlist id.
	playlistId: str,
	change: oneOf("added", "changed", "removed"),
	kind: oneOf("playlist", "folder", "smart"),
	name: optional(obj({ before: str, after: str })),
	// Device playlist ids of the folder.
	parent: optional(obj({ before: nullable(str), after: nullable(str) })),
	seq: optional(obj({ before: int, after: int })),
	rules: optional(obj({ before: nullable(str), after: nullable(str) })),
	// Membership in hub trackIds (tracks the hub does not know are left out).
	addedTracks: arr(str),
	removedTracks: arr(str),
	reordered: bool,
	// The playlist's whole current order, for a merge that replays it.
	order: arr(str),
});
export type ImportPlaylist = Infer<typeof ImportPlaylist>;

export const ImportBatch = obj({
	// Idempotency key of the whole import; every part shares it.
	batchId: str,
	part: int,
	parts: int,
	// The base this diff was computed against, and the base the agent keeps if the
	// hub accepts (`version` + 1). `base.version === 0` is a first import: the "added"
	// lists then hold the device's entire collection.
	base: SnapshotRef,
	next: SnapshotRef,
	takenAt: int,
	rekordbox: obj({ appVersion: nullable(str), dbVersion: nullable(str) }),
	// New or changed contentId <-> trackId links (matched by local path, then audio hash).
	links: arr(ImportLink),
	// Tracks in Rekordbox the hub has no match for (capped; `unmatchedCount` is the total).
	unmatched: arr(
		obj({
			contentId: str,
			path: str,
			title: nullable(str),
			artist: nullable(str),
		}),
	),
	unmatchedCount: int,
	tracks: obj({
		// Owned values of linked tracks new in the collection (every linked track on a first
		// import).
		added: arr(obj({ contentId: str, trackId: str, fields: TrackFields })),
		changed: arr(
			obj({
				contentId: str,
				trackId: str,
				fields: arr(obj({ field: str, before: FieldValue, after: FieldValue })),
			}),
		),
		// Gone from this device's collection only; never a library delete.
		removed: arr(obj({ contentId: str, trackId: str })),
	}),
	playlists: arr(ImportPlaylist),
	// The full cue set of each track whose cues changed (latest wins on the hub).
	cues: arr(obj({ trackId: str, cues: arr(CueEntry) })),
	// ANLZ files of tracks that are new or whose files changed.
	anlz: arr(AnlzRef),
	// Plays since the last import.
	plays: arr(obj({ trackId: str, playedAt: int })),
});
export type ImportBatch = Infer<typeof ImportBatch>;

export const ConflictNotice = obj({
	id: str,
	entity: oneOf("track", "playlist"),
	// trackId or hub playlistId.
	refId: str,
	field: nullable(str),
	deviceValue: FieldValue,
	hubValue: FieldValue,
	winner: oneOf("device", "hub"),
	at: str,
});
export type ConflictNotice = Infer<typeof ConflictNotice>;

export const ImportResult = obj({
	batchId: str,
	part: int,
	// True once the last part is merged and the base is recorded.
	committed: bool,
	// The hub's record of the device's base after this part.
	base: SnapshotRef,
	// ANLZ blob hashes the hub does not have: the agent PUTs them.
	wantBlobs: arr(str),
	conflicts: arr(ConflictNotice),
});
export type ImportResult = Infer<typeof ImportResult>;

// ---- Rekordbox: export (hub -> agent) -------------------------------------------------------------

// Every change carries the hub's `seq` (its change-log position): the agent applies a
// page in order and acks the page's cursor.
export const ExportChange = variants("kind", {
	// A track to put in the collection, with everything the agent needs to create it.
	"track.add": obj({
		seq: int,
		kind: oneOf("track.add"),
		trackId: str,
		relPath: str,
		audioHash: str,
		fileHash: str,
		fields: TrackFields,
		cues: arr(CueEntry),
		anlz: arr(AnlzRef),
	}),
	"track.update": obj({
		seq: int,
		kind: oneOf("track.update"),
		trackId: str,
		// Only the fields that changed.
		fields: TrackFields,
	}),
	// Remove from this device's collection (a library delete; the file goes to the
	// replica's trash through the manifest).
	"track.remove": obj({ seq: int, kind: oneOf("track.remove"), trackId: str }),
	// The track's whole cue set; replaces what the install has.
	"cues.set": obj({
		seq: int,
		kind: oneOf("cues.set"),
		trackId: str,
		cues: arr(CueEntry),
		anlz: arr(AnlzRef),
	}),
	// The whole playlist as it should be. Smart playlists arrive as "playlist" with
	// their rule result.
	"playlist.set": obj({
		seq: int,
		kind: oneOf("playlist.set"),
		// The hub's id.
		playlistId: str,
		// This device's playlist id when the hub knows it.
		deviceRef: nullable(str),
		type: oneOf("playlist", "folder"),
		name: str,
		// The hub's id of the folder, null at the top level.
		parentId: nullable(str),
		// 1-based position among its siblings.
		position: int,
		// Ordered hub trackIds (folders: empty).
		tracks: arr(str),
	}),
	"playlist.remove": obj({
		seq: int,
		kind: oneOf("playlist.remove"),
		playlistId: str,
		deviceRef: nullable(str),
	}),
});
export type ExportChange = Infer<typeof ExportChange>;

export const ExportRequest = obj({
	// `null` asks for the device's whole desired state.
	cursor: nullable(str),
	// 0 asks only for `pending` (the agent polls it while Rekordbox is running).
	limit: optional(int),
	base: nullable(SnapshotRef),
});
export type ExportRequest = Infer<typeof ExportRequest>;

export const ExportPage = obj({
	cursor: str,
	hasMore: bool,
	changes: arr(ExportChange),
	// Changes after the request's cursor that this page does not hold.
	pending: int,
});
export type ExportPage = Infer<typeof ExportPage>;

// POST /sync/rekordbox/ack: the agent applied every change up to `cursor`.
export const ExportAck = obj({
	cursor: str,
	// The base the agent now keeps (it re-read master.db after writing).
	base: SnapshotRef,
	applied: int,
	// Track adds waiting for their file to arrive in the replica.
	deferred: int,
	// Links created by the export: new contents and playlists, and contents removed.
	links: obj({
		tracks: arr(ImportLink),
		playlists: arr(obj({ rbPlaylistId: str, playlistId: str })),
		removedTracks: arr(str),
	}),
	rekordbox: RekordboxStatus,
});
export type ExportAck = Infer<typeof ExportAck>;

// ---- ANLZ blobs ------------------------------------------------------------------------------------

// GET /sync/anlz/:hash answers the raw bytes (404 when unknown). HEAD answers 200/404.
// PUT /sync/anlz/:hash?trackId=&kind= takes the raw bytes; the hub checks sha256(body)
// equals :hash (422 `hash-mismatch` otherwise) and answers `Ok`.
