import {
	type DeviceHello,
	PROTOCOL_VERSION,
	type RekordboxStatus,
} from "@trackvault/core/sync";
import { AGENT_VERSION, type AgentConfig } from "./config.ts";
import { diskSpace, hostName, platform } from "./platform.ts";
import type { State } from "./state.ts";

export const NO_REKORDBOX: RekordboxStatus = {
	installed: false,
	appVersion: null,
	dbVersion: null,
	running: null,
	writeSupport: "unknown",
	exportState: "idle",
	pendingExport: 0,
	lastImportAt: null,
	lastExportAt: null,
	message: null,
};

export function modesOf(
	config: AgentConfig,
	rekordbox: RekordboxStatus,
): DeviceHello["modes"] {
	const modes: DeviceHello["modes"] = [];
	if (config.replica) modes.push("replica");
	if (config.watch.length > 0) modes.push("upload");
	if (config.replica && rekordbox.installed && config.rekordbox.enabled)
		modes.push("rekordbox");
	return modes;
}

// What the agent says about itself: at pairing, at startup and every few minutes.
export async function buildHello(
	config: AgentConfig,
	state: State | null,
	rekordbox: RekordboxStatus,
): Promise<DeviceHello> {
	const probe = config.localRoot ?? config.watch[0] ?? process.cwd();
	const disk = await diskSpace(probe);
	return {
		protocol: PROTOCOL_VERSION,
		agentVersion: AGENT_VERSION,
		name: config.name,
		platform,
		hostname: hostName,
		localRoot: config.localRoot,
		freeDiskBytes: disk ? disk.free : null,
		totalDiskBytes: disk ? disk.total : null,
		modes: modesOf(config, rekordbox),
		rekordbox,
		manifestCursor: state?.cursor ?? null,
		rekordboxBase: state?.baseRef() ?? null,
	};
}
