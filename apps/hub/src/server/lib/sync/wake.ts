import type { ChannelHandle } from "@fcalell/plugin-node/server";
import type { devicesChannel } from "../../../shared/channels.ts";

type DevicesChannel = ChannelHandle<(typeof devicesChannel)["server"]>;

// The `devices` channel (owned by the sync service) and who is on it: the hub sends to
// the connection of a device key, by the key's id.
let channel: DevicesChannel | null = null;
const connections = new Map<
	string,
	Set<{ send: (type: never, payload: never) => void; id: string }>
>();

export function bindDevicesChannel(handle: DevicesChannel | null): void {
	channel = handle;
	if (!handle) connections.clear();
}

export function trackConnection(
	deviceId: string,
	conn: { send: (type: never, payload: never) => void; id: string },
	on: boolean,
): void {
	const set = connections.get(deviceId) ?? new Set();
	if (on) set.add(conn);
	else set.delete(conn);
	if (set.size === 0) connections.delete(deviceId);
	else connections.set(deviceId, set);
}

export const connectedDevices = (): string[] => [...connections.keys()];

type Wake = {
	scope: "replica" | "rekordbox" | "all";
	reason?: string | undefined;
};

export function sendToDevice(
	deviceId: string,
	type: "wake" | "conflict",
	payload: Wake | Record<string, unknown>,
): void {
	for (const conn of connections.get(deviceId) ?? [])
		(conn.send as (t: string, p: unknown) => void)(type, payload);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Wake["scope"] | null = null;
let why = "";

const merge = (a: Wake["scope"] | null, b: Wake["scope"]): Wake["scope"] =>
	a === null || a === b ? b : "all";

// Tells every connected device something changed. Writes come in bursts (a scan, a bulk
// edit): the wake is sent once, a moment after the last one.
export function wakeDevices(scope: Wake["scope"], reason: string): void {
	if (!channel) return;
	pending = merge(pending, scope);
	why = reason;
	if (timer) return;
	timer = setTimeout(() => {
		timer = null;
		const scope$ = pending;
		pending = null;
		if (!scope$) return;
		for (const id of connections.keys())
			sendToDevice(id, "wake", { scope: scope$, reason: why });
	}, 1500);
}

// Playlist writes concern the Rekordbox export (and nothing in the replica).
export const notifyPlaylists = (): void =>
	wakeDevices("rekordbox", "playlists");
