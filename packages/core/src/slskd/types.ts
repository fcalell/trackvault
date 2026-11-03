// Shapes of slskd's REST API (v0). Only the fields TrackVault reads are typed;
// slskd adds others freely. Verify against the running server's /swagger.

export interface SlskdSearch {
	id: string;
	searchText: string;
	// e.g. "Requested, InProgress", "Completed, TimedOut", "Completed, ResponseLimitReached".
	state: string;
	isComplete: boolean;
	responseCount: number;
	fileCount: number;
	lockedFileCount?: number;
	startedAt?: string;
	endedAt?: string | null;
	responses?: SlskdResponse[];
}

export interface SlskdSearchRequest {
	// A client-chosen GUID, so a retried create is the same search.
	id?: string;
	searchText: string;
	fileLimit?: number;
	filterResponses?: boolean;
	maximumPeerQueueLength?: number;
	minimumPeerUploadSpeed?: number;
	minimumResponseFileCount?: number;
	responseLimit?: number;
	// ms
	searchTimeout?: number;
}

export interface SlskdFile {
	filename: string;
	size: number;
	bitRate?: number | null;
	bitDepth?: number | null;
	sampleRate?: number | null;
	// seconds
	length?: number | null;
	isVariableBitRate?: boolean | null;
	extension?: string | null;
	code?: number;
	isLocked?: boolean;
}

export interface SlskdResponse {
	username: string;
	token?: number;
	hasFreeUploadSlot: boolean;
	// bytes per second
	uploadSpeed: number;
	queueLength: number;
	fileCount: number;
	files: SlskdFile[];
	lockedFileCount?: number;
	lockedFiles?: SlskdFile[];
}

export type SlskdTransferState = string;

export interface SlskdTransfer {
	id: string;
	username: string;
	direction: "Download" | "Upload";
	filename: string;
	size: number;
	// e.g. "Queued, Remotely", "InProgress", "Completed, Succeeded", "Completed, Cancelled".
	state: SlskdTransferState;
	requestedAt?: string;
	enqueuedAt?: string;
	startedAt?: string;
	endedAt?: string;
	bytesTransferred: number;
	averageSpeed: number;
	bytesRemaining?: number;
	percentComplete: number;
	exception?: string | null;
}

export interface SlskdTransferDirectory {
	directory: string;
	fileCount: number;
	files: SlskdTransfer[];
}

export interface SlskdUserTransfers {
	username: string;
	directories: SlskdTransferDirectory[];
}

export interface SlskdEnqueueFile {
	filename: string;
	size?: number;
}

export interface SlskdServerState {
	address?: string;
	state: string;
	isConnected: boolean;
	isLoggedIn: boolean;
	isTransitioning?: boolean;
	username?: string;
}

export interface SlskdUserInfo {
	description?: string;
	hasFreeUploadSlot?: boolean;
	queueLength?: number;
	uploadSlots?: number;
	hasPicture?: boolean;
}

export interface SlskdUserStatus {
	presence: string;
	isPrivileged: boolean;
}

// Normalised search hit (see normalize.ts).
export interface SoulseekFile {
	user: string;
	// As the peer reports it: Windows-style backslash path.
	path: string;
	size: number;
	bitrate: number | null;
	bitDepth: number | null;
	sampleRate: number | null;
	// seconds
	length: number | null;
	vbr: boolean | null;
	// Lower case, no dot.
	extension: string;
	isLocked: boolean;
	queueLength: number;
	freeUploadSlots: boolean;
	// bytes per second
	uploadSpeed: number;
}
