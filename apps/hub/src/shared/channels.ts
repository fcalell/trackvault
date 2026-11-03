import { z } from "@fcalell/plugin-api/schema";
import { defineChannel } from "@fcalell/plugin-node/ws";

export const jobViewSchema = z.object({
	id: z.string(),
	kind: z.string(),
	state: z.enum(["queued", "running", "done", "failed", "cancelled"]),
	done: z.number(),
	total: z.number(),
	message: z.string().nullable(),
	error: z.string().nullable(),
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
	// The job wrote a batch of changes, which History shows under the job's id.
	batch: z.boolean(),
});
export type JobView = z.infer<typeof jobViewSchema>;

// Live job progress: the recent jobs on subscribe, then each job as it changes.
export const jobsChannel = defineChannel("jobs", {
	server: {
		snapshot: z.object({ jobs: z.array(jobViewSchema) }),
		upsert: jobViewSchema,
	},
	client: {},
});

// Library changes: after each committed batch, the ids of the tracks that changed
// and the library version they carry. `all` says the batch is too wide to list
// (a setting changed every track): refetch whatever is loaded.
export const libraryChannel = defineChannel("library", {
	server: {
		snapshot: z.object({ version: z.number() }),
		changed: z.object({
			ids: z.array(z.string()),
			version: z.number(),
			all: z.boolean(),
		}),
	},
	client: {},
});

// The per-device channel of the sync service: the hub sends to the connection of a device
// key (see server/lib/sync/wake). `wake` says work is waiting (scope "replica": the
// manifest moved, "rekordbox": export changes are waiting); `conflict` that a merge kept
// one side. The agent mirrors this definition in `apps/agent/src/hub/channels.ts`.
export const devicesChannel = defineChannel("devices", {
	server: {
		snapshot: z.object({ deviceId: z.string() }),
		wake: z.object({
			scope: z.enum(["replica", "rekordbox", "all"]),
			reason: z.string().optional(),
		}),
		conflict: z.object({
			id: z.string(),
			entity: z.enum(["track", "playlist"]),
			refId: z.string(),
			field: z.string().nullable(),
			winner: z.enum(["device", "hub"]),
			at: z.string(),
		}),
	},
	client: {},
});

export const transferStates = [
	"requested",
	"queued",
	"downloading",
	"completed",
	"imported",
	"failed",
	"cancelled",
] as const;

export const transferViewSchema = z.object({
	id: z.string(),
	username: z.string(),
	// The peer's file name without its folders.
	name: z.string(),
	artist: z.string().nullable(),
	title: z.string().nullable(),
	format: z.string().nullable(),
	bitrate: z.number().nullable(),
	state: z.enum(transferStates),
	rawState: z.string().nullable(),
	size: z.number(),
	bytes: z.number(),
	speed: z.number(),
	error: z.string().nullable(),
	wantId: z.number().nullable(),
	// What the want is called: its artist, title and mix.
	want: z.string().nullable(),
	inboxItemId: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type TransferView = z.infer<typeof transferViewSchema>;

// Soulseek downloads, live: the recent ones on subscribe, then each as slskd moves it.
export const transfersChannel = defineChannel("transfers", {
	server: {
		snapshot: z.object({ transfers: z.array(transferViewSchema) }),
		upsert: transferViewSchema,
		remove: z.object({ id: z.string() }),
	},
	client: {},
});
