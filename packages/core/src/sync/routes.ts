// The hub's `/sync` routes, one place for both sides. The hub mounts `SYNC_PREFIX`
// with `http.mount`; every route needs a device key (`Authorization: Bearer stk_...`).

export const SYNC_PREFIX = "/sync";
export const PROTOCOL_HEADER = "x-tv-protocol";
export const KEY_PREFIX = "stk_";

const enc = encodeURIComponent;

export const routes = {
	// POST DeviceHello -> HelloResponse (an idempotent register / heartbeat)
	hello: `${SYNC_PREFIX}/hello`,
	// POST ManifestRequest -> ManifestPage
	manifest: `${SYNC_PREFIX}/manifest`,
	// GET (Range, If-Range) -> file bytes
	file: (trackId: string) => `${SYNC_PREFIX}/files/${enc(trackId)}`,
	// POST StateReport -> Ok
	state: `${SYNC_PREFIX}/state`,
	// POST InboxCheckRequest -> InboxCheckResponse
	inboxCheck: `${SYNC_PREFIX}/inbox/check`,
	// POST UploadInit -> UploadInitResponse
	uploads: `${SYNC_PREFIX}/inbox/uploads`,
	// GET -> UploadStatus; PUT ?offset=N (raw chunk) -> UploadChunkResponse; DELETE -> Ok
	upload: (uploadId: string) => `${SYNC_PREFIX}/inbox/uploads/${enc(uploadId)}`,
	// POST UploadComplete -> UploadCompleteResponse
	uploadComplete: (uploadId: string) =>
		`${SYNC_PREFIX}/inbox/uploads/${enc(uploadId)}/complete`,
	// POST ImportBatch -> ImportResult
	rekordboxImport: `${SYNC_PREFIX}/rekordbox/import`,
	// POST ExportRequest -> ExportPage
	rekordboxExport: `${SYNC_PREFIX}/rekordbox/export`,
	// POST ExportAck -> Ok
	rekordboxAck: `${SYNC_PREFIX}/rekordbox/ack`,
	// HEAD / GET -> bytes; PUT ?trackId=&kind= (raw bytes) -> Ok
	anlz: (hash: string) => `${SYNC_PREFIX}/anlz/${enc(hash)}`,
} as const;

// The live channels the agent subscribes to over `/ws` (see `channels.ts` in the agent).
export const CHANNELS = {
	// Hub broadcast after each committed library write: { ids, version, all }.
	library: "library",
	// Per-device: { wake: { scope, reason } } and { conflict: ConflictNotice }.
	devices: "devices",
} as const;
