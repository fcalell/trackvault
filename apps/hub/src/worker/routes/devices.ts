import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { selector, z } from "@fcalell/plugin-api/schema";
import { resolveConflicts } from "../../server/lib/conflicts.ts";
import { db } from "../../server/lib/db.ts";
import { statement } from "../../server/lib/raw.ts";
import { connectedDevices, sendToDevice } from "../../server/lib/sync/wake.ts";

const IDLE_MS = 5 * 60_000;

interface DeviceRow {
	id: string;
	name: string | null;
	keyName: string | null;
	keyStart: string | null;
	createdAt: number | null;
	expiresAt: number | null;
	hasKey: number;
	platform: string | null;
	hostname: string | null;
	localRoot: string | null;
	agentVersion: string | null;
	modes: string | null;
	freeDiskBytes: number | null;
	totalDiskBytes: number | null;
	rekordbox: string | null;
	activity: string | null;
	lastSeenAt: number | null;
	exportCursor: string | null;
}

const rekordboxStatus = z.object({
	installed: z.boolean(),
	appVersion: z.string().nullable(),
	dbVersion: z.string().nullable(),
	running: z.boolean().nullable(),
	writeSupport: z.string(),
	exportState: z.string(),
	pendingExport: z.number(),
	lastImportAt: z.string().nullable(),
	lastExportAt: z.string().nullable(),
	message: z.string().nullable(),
});

const deviceView = z.object({
	id: z.string(),
	name: z.string(),
	// online: connected now; idle: seen within five minutes; offline: longer;
	// waiting: the key exists and the agent has not said hello; revoked: the key is gone.
	state: z.enum(["online", "idle", "offline", "waiting", "revoked"]),
	platform: z.string().nullable(),
	hostname: z.string().nullable(),
	agentVersion: z.string().nullable(),
	modes: z.array(z.string()),
	localRoot: z.string().nullable(),
	keyStart: z.string().nullable(),
	createdAt: z.date().nullable(),
	expiresAt: z.date().nullable(),
	lastSeenAt: z.date().nullable(),
	freeDiskBytes: z.number().nullable(),
	files: z.object({ ok: z.number(), pending: z.number(), failed: z.number() }),
	rekordbox: rekordboxStatus.nullable(),
	openConflicts: z.number(),
	unmatched: z.number().nullable(),
	lastImportAt: z.date().nullable(),
	lastExportAt: z.date().nullable(),
});

const conflictView = z.object({
	id: z.number(),
	deviceId: z.string(),
	device: z.string(),
	entity: z.enum(["track", "playlist"]),
	refId: z.string(),
	// A track's title and mix name and its artist; a playlist's name is the title.
	title: z.string(),
	artist: z.string().nullable(),
	field: z.string().nullable(),
	deviceValue: z.string().nullable(),
	hubValue: z.string().nullable(),
	winner: z.enum(["device", "hub"]),
	at: z.date(),
});

const unmatchedView = z.object({
	contentId: z.string(),
	path: z.string(),
	title: z.string().nullable(),
	artist: z.string().nullable(),
});

const asDate = (value: number | null | undefined) =>
	value ? new Date(value) : null;

// The tracks both orders hold in the same sequence (the longest increasing run of the
// other order's places). The rest of the common tracks moved.
function longestShared(
	order: readonly string[],
	other: readonly string[],
): number {
	const at = new Map(other.map((id, index) => [id, index]));
	const tails: number[] = [];
	for (const id of order) {
		const index = at.get(id);
		if (index === undefined) continue;
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if ((tails[mid] as number) < index) low = mid + 1;
			else high = mid;
		}
		tails[low] = index;
	}
	return tails.length;
}

const tracksIn = (count: number) =>
	`${count} ${count === 1 ? "track" : "tracks"}`;

// Rekordbox's order against the hub's: what moved, was added and was removed.
function orderChange(hub: readonly string[], device: readonly string[]) {
	const hubHas = new Set(hub);
	const deviceHas = new Set(device);
	const added = device.filter((id) => !hubHas.has(id)).length;
	const removed = hub.filter((id) => !deviceHas.has(id)).length;
	const moved = hub.length - removed - longestShared(hub, device);
	const parts = [
		moved > 0 ? `${moved} moved` : null,
		added > 0 ? `${added} added` : null,
		removed > 0 ? `${removed} removed` : null,
	].filter((part) => part !== null);
	return {
		hubValue: tracksIn(hub.length),
		deviceValue: parts.join(", ") || tracksIn(device.length),
	};
}

// A conflict value as a short phrase: a list is its items.
function phrase(raw: string | null): string | null {
	if (raw === null) return null;
	const value = JSON.parse(raw) as unknown;
	if (value === null || value === "") return null;
	if (Array.isArray(value)) return value.join(", ") || null;
	return String(value);
}

function sides(row: {
	field: string | null;
	deviceValue: string | null;
	hubValue: string | null;
}) {
	if (row.field === "order" && row.deviceValue && row.hubValue)
		return orderChange(
			JSON.parse(row.hubValue) as string[],
			JSON.parse(row.deviceValue) as string[],
		);
	return {
		hubValue: phrase(row.hubValue),
		deviceValue: phrase(row.deviceValue),
	};
}

// The machines that have a key or have said hello: their status, what they hold and
// whether Rekordbox on them is ready to be written.
function allDevices(): z.infer<typeof deviceView>[] {
	const rows = statement(
		`SELECT coalesce(d.id, k.id) AS id, d.name AS name, k.name AS keyName, k.start AS keyStart,
			k.created_at AS createdAt, k.expires_at AS expiresAt, (k.id IS NOT NULL) AS hasKey,
			d.platform AS platform, d.hostname AS hostname, d.local_root AS localRoot,
			d.agent_version AS agentVersion, d.modes AS modes, d.free_disk_bytes AS freeDiskBytes,
			d.total_disk_bytes AS totalDiskBytes, d.rekordbox AS rekordbox, d.activity AS activity,
			d.last_seen_at AS lastSeenAt, d.export_cursor AS exportCursor
		 FROM devices d LEFT JOIN apikey k ON k.id = d.id
		 UNION ALL
		 SELECT k.id, NULL, k.name, k.start, k.created_at, k.expires_at, 1, NULL, NULL, NULL, NULL, NULL,
			NULL, NULL, NULL, NULL, NULL, NULL
		 FROM apikey k WHERE k.id NOT IN (SELECT id FROM devices)
		 ORDER BY 1`,
	).all() as DeviceRow[];
	const files = new Map<
		string,
		{ ok: number; pending: number; failed: number }
	>();
	for (const f of statement(
		"SELECT device_id AS d, state, count(*) AS n FROM device_files GROUP BY device_id, state",
	).all() as Array<{ d: string; state: string; n: number }>) {
		const entry = files.get(f.d) ?? { ok: 0, pending: 0, failed: 0 };
		if (f.state === "ok") entry.ok += f.n;
		else if (f.state === "failed") entry.failed += f.n;
		else if (
			f.state === "pending" ||
			f.state === "downloading" ||
			f.state === "missing"
		)
			entry.pending += f.n;
		files.set(f.d, entry);
	}
	const conflicts = new Map(
		(
			statement(
				"SELECT device_id AS d, count(*) AS n FROM conflicts WHERE state = 'open' GROUP BY device_id",
			).all() as Array<{ d: string; n: number }>
		).map((row) => [row.d, row.n]),
	);
	const online = new Set(connectedDevices());
	const now = Date.now();
	return rows.map((row) => {
		const activity = row.activity
			? (JSON.parse(row.activity) as {
					import?: { at?: number; unmatched?: number };
					export?: { at?: number };
				})
			: {};
		const state = !row.hasKey
			? ("revoked" as const)
			: row.lastSeenAt === null
				? ("waiting" as const)
				: online.has(row.id)
					? ("online" as const)
					: now - row.lastSeenAt < IDLE_MS
						? ("idle" as const)
						: ("offline" as const);
		return {
			id: row.id,
			name: row.name ?? row.keyName ?? "Device",
			state,
			platform: row.platform,
			hostname: row.hostname,
			agentVersion: row.agentVersion,
			modes: row.modes ? (JSON.parse(row.modes) as string[]) : [],
			localRoot: row.localRoot,
			keyStart: row.keyStart,
			createdAt: asDate(row.createdAt),
			expiresAt: asDate(row.expiresAt),
			lastSeenAt: asDate(row.lastSeenAt),
			freeDiskBytes: row.freeDiskBytes,
			files: files.get(row.id) ?? { ok: 0, pending: 0, failed: 0 },
			rekordbox: row.rekordbox
				? (JSON.parse(row.rekordbox) as z.infer<typeof rekordboxStatus>)
				: null,
			openConflicts: conflicts.get(row.id) ?? 0,
			unmatched: activity.import?.unmatched ?? null,
			lastImportAt: asDate(activity.import?.at),
			lastExportAt: asDate(activity.export?.at),
		};
	});
}

export const devices = {
	list: procedure({
		auth: true,
		reads: ["devices", "deviceFiles", "conflicts", "apikey"],
	})
		.output(z.array(deviceView))
		.query(allDevices),

	// One device.
	get: procedure({
		auth: true,
		reads: ["devices", "deviceFiles", "conflicts", "apikey"],
	})
		.input(z.object({ id: z.string() }))
		.output(deviceView)
		.query(({ input }) => {
			const found = allDevices().find((device) => device.id === input.id);
			if (!found) throw new ApiError("NOT_FOUND");
			return found;
		}),

	// The Rekordbox tracks the hub found no match for, as the device's last import saw them.
	unmatched: procedure({ auth: true, reads: ["devices"] })
		.input(z.object({ id: z.string() }))
		.output(z.array(unmatchedView))
		.query(({ input }) => {
			const row = statement("SELECT activity FROM devices WHERE id = @id").get({
				id: input.id,
			}) as { activity: string | null } | undefined;
			if (!row) throw new ApiError("NOT_FOUND");
			const activity: { unmatched?: z.infer<typeof unmatchedView>[] } =
				row.activity ? JSON.parse(row.activity) : {};
			return activity.unmatched ?? [];
		}),

	// Forgets a device that is revoked or retired: its row, its file states and its
	// links (a later pairing starts as a new device). Its open conflicts are closed.
	forget: procedure({
		auth: true,
		writes: ["devices", "deviceFiles", "rekordboxLinks", "conflicts"],
	})
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) => {
			const params = { id: input.id };
			const alive = statement("SELECT 1 AS x FROM apikey WHERE id = @id").get(
				params,
			);
			if (alive)
				throw new ApiError("BAD_REQUEST", { message: "Revoke the key first" });
			db().transaction(() => {
				statement("DELETE FROM device_files WHERE device_id = @id").run(params);
				statement("DELETE FROM rekordbox_links WHERE device_id = @id").run(
					params,
				);
				statement(
					"UPDATE conflicts SET state = 'resolved', resolved_at = @now WHERE device_id = @id AND state = 'open'",
				).run({
					id: input.id,
					now: Date.now(),
				});
				statement("DELETE FROM devices WHERE id = @id").run(params);
			});
		}),

	// Asks a connected device to sync now.
	wake: procedure({ auth: true })
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) => {
			if (!connectedDevices().includes(input.id))
				throw new ApiError("BAD_REQUEST", {
					message: "That device is not connected",
				});
			sendToDevice(input.id, "wake", {
				scope: "all",
				reason: "asked from the hub",
			});
		}),

	// The conflicts waiting to be looked at, newest first.
	conflicts: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["conflicts", "devices", "tracks", "playlists"],
	})
		.input(z.object({ state: z.enum(["open", "resolved"]).default("open") }))
		.query(({ input }) => {
			const rows = statement(
				`SELECT c.id, c.device_id AS deviceId, coalesce(d.name, 'Device') AS device, c.entity, c.ref_id AS refId,
					c.field, c.device_value AS deviceValue, c.hub_value AS hubValue, c.winner, c.at,
					CASE c.entity WHEN 'track' THEN coalesce(t.title, 'Untitled') ELSE coalesce(p.name, 'Playlist') END AS title,
					t.artist AS artist
				 FROM conflicts c LEFT JOIN devices d ON d.id = c.device_id
				 LEFT JOIN tracks t ON c.entity = 'track' AND t.id = c.ref_id
				 LEFT JOIN playlists p ON c.entity = 'playlist' AND p.id = c.ref_id
				 WHERE c.state = @state ORDER BY c.id DESC LIMIT @limit OFFSET @offset`,
			).all({
				state: input.state,
				limit: input.limit,
				offset: input.offset,
			}) as Array<{
				id: number;
				deviceId: string;
				device: string;
				entity: "track" | "playlist";
				refId: string;
				field: string | null;
				deviceValue: string | null;
				hubValue: string | null;
				winner: "device" | "hub";
				at: number;
				title: string;
				artist: string | null;
			}>;
			const total = (
				statement(
					"SELECT count(*) AS n FROM conflicts WHERE state = @state",
				).get({ state: input.state }) as { n: number }
			).n;
			return {
				data: rows.map((row) => ({
					id: row.id,
					deviceId: row.deviceId,
					device: row.device,
					entity: row.entity,
					refId: row.refId,
					title: row.title,
					artist: row.artist,
					field: row.field,
					...sides(row),
					winner: row.winner,
					at: new Date(row.at),
				})),
				total,
				offset: input.offset,
			};
		}),

	// Settles conflicts by taking TrackVault's value or Rekordbox's: the ticked ones, or
	// every open conflict but the unticked.
	resolve: procedure({
		auth: true,
		writes: ["conflicts", "tracks", "playlists", "playlistTracks"],
	})
		.input(
			z.object({
				conflicts: selector(
					z.object({ state: z.enum(["open", "resolved"]).default("open") }),
				),
				take: z.enum(["hub", "device"]),
			}),
		)
		.mutation(({ input }) => {
			const picked = input.conflicts;
			const ids =
				"ids" in picked
					? picked.ids.map(Number).filter(Number.isInteger)
					: (
							statement(
								"SELECT id FROM conflicts WHERE state = 'open' ORDER BY id",
							).all() as {
								id: number;
							}[]
						)
							.map((row) => row.id)
							.filter((id) => !picked.except.includes(String(id)));
			return resolveConflicts(ids, input.take);
		}),
};

export type { conflictView };
