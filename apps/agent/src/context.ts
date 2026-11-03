import type { DeviceStatus, HubSettings } from "@trackvault/core/sync";
import type { AgentConfig, AgentPaths } from "./config.ts";
import type { HubClient } from "./hub/client.ts";
import type { Logger } from "./log.ts";
import type { State } from "./state.ts";

// What every component of the daemon shares.
export interface Context {
	config: AgentConfig;
	paths: AgentPaths;
	state: State;
	hub: HubClient;
	log: Logger;
	// Settings the hub answered `hello` with (defaults until then).
	settings: HubSettings;
	// Switches the hub can turn off.
	flags: { rekordbox: boolean };
	// Aborts on shutdown: every wait and request honours it.
	signal: AbortSignal;
	// Pushes a state report soon (throttled); components call it when something changed.
	reportSoon(): void;
	// The device status as the components see themselves now.
	collectStatus(): Promise<DeviceStatus>;
}

export const DEFAULT_SETTINGS: HubSettings = {
	manifestPageSize: 1000,
	chunkSize: 8 * 1024 * 1024,
	pollSeconds: 60,
	maxDownloads: 4,
};

export type StatusPart = Pick<DeviceStatus, "replica" | "upload" | "rekordbox">;
