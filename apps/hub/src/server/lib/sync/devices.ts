import { eq } from "@fcalell/plugin-db/orm";
import type {
	DeviceHello,
	DeviceStatus,
	HelloResponse,
	StateReport,
} from "@trackvault/core/sync";
import { PROTOCOL_VERSION } from "@trackvault/core/sync";
import { devices } from "../../../schema/index.ts";
import { db } from "../db.ts";
import { statement } from "../raw.ts";
import { readSettings } from "../settings.ts";

// The hub's side of a device: the row it keeps from hello, the state it reports.

export const MANIFEST_PAGE = 1000;
export const CHUNK_SIZE = 4 * 1024 * 1024;

export function registerDevice(
	deviceId: string,
	hello: DeviceHello,
): HelloResponse {
	const now = Date.now();
	statement(
		`INSERT INTO devices (id, name, platform, hostname, local_root, agent_version, modes,
			free_disk_bytes, total_disk_bytes, rekordbox, manifest_cursor, first_seen_at, last_seen_at)
		 VALUES (@id, @name, @platform, @hostname, @localRoot, @agentVersion, @modes,
			@free, @total, @rekordbox, @cursor, @now, @now)
		 ON CONFLICT(id) DO UPDATE SET name = @name, platform = @platform, hostname = @hostname,
			local_root = @localRoot, agent_version = @agentVersion, modes = @modes,
			free_disk_bytes = @free, total_disk_bytes = @total, rekordbox = @rekordbox,
			manifest_cursor = @cursor, last_seen_at = @now`,
	).run({
		id: deviceId,
		name: hello.name,
		platform: hello.platform,
		hostname: hello.hostname ?? null,
		localRoot: hello.localRoot,
		agentVersion: hello.agentVersion,
		modes: JSON.stringify(hello.modes),
		free: hello.freeDiskBytes,
		total: hello.totalDiskBytes,
		rekordbox: JSON.stringify(hello.rekordbox),
		cursor: hello.manifestCursor,
		now,
	});
	return {
		protocol: PROTOCOL_VERSION,
		deviceId,
		serverTime: new Date(now).toISOString(),
		libraryVersion: readSettings().libraryVersion,
		settings: {
			manifestPageSize: MANIFEST_PAGE,
			chunkSize: CHUNK_SIZE,
			pollSeconds: 60,
			maxDownloads: 3,
		},
		rekordboxEnabled: true,
	};
}

export function touchDevice(deviceId: string): void {
	statement("UPDATE devices SET last_seen_at = @now WHERE id = @id").run({
		id: deviceId,
		now: Date.now(),
	});
}

// The file states a device reports (one row per track) and its status line.
export function recordState(deviceId: string, report: StateReport): void {
	const upsert = statement(
		`INSERT INTO device_files (device_id, track_id, state, file_hash, error, at)
		 VALUES (@d, @t, @state, @hash, @error, @at)
		 ON CONFLICT(device_id, track_id) DO UPDATE SET state = @state, file_hash = @hash, error = @error, at = @at`,
	);
	const drop = statement(
		"DELETE FROM device_files WHERE device_id = @d AND track_id = @t",
	);
	db().transaction(() => {
		for (const file of report.files) {
			if (file.state === "trashed") {
				drop.run({ d: deviceId, t: file.trackId });
				continue;
			}
			upsert.run({
				d: deviceId,
				t: file.trackId,
				state: file.state,
				hash: file.fileHash,
				error: file.error ?? null,
				at: Date.parse(file.at) || Date.now(),
			});
		}
		saveStatus(deviceId, report.status);
	});
}

function saveStatus(deviceId: string, status: DeviceStatus): void {
	db()
		.update(devices)
		.set({
			status,
			rekordbox: status.rekordbox ?? undefined,
			freeDiskBytes: status.freeDiskBytes,
			lastSeenAt: new Date(),
		})
		.where(eq(devices.id, deviceId))
		.run();
}

// Merges a record into the device's `activity` column (what the last import and
// export did), for the Devices place.
export function noteActivity(
	deviceId: string,
	key: "import" | "export",
	value: unknown,
): void {
	const row = statement("SELECT activity FROM devices WHERE id = @id").get({
		id: deviceId,
	}) as { activity: string | null } | undefined;
	const current = row?.activity
		? (JSON.parse(row.activity) as Record<string, unknown>)
		: {};
	current[key] = { ...(value as object), at: Date.now() };
	statement("UPDATE devices SET activity = @a WHERE id = @id").run({
		id: deviceId,
		a: JSON.stringify(current),
	});
}
