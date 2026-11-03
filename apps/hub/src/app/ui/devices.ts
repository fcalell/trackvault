import type { Fact, StatusMark } from "@fcalell/ui-core/descriptors";
import type { AppRouter } from "../../../.stack/worker";
import { count } from "./figures.ts";

export type Device = AppRouter["devices"]["list"]["__output"][number];

const DAY = 86_400_000;

// A device that has not connected for a day is stale: it is not just away.
export const daysAway = (device: Device, now = Date.now()): number =>
	device.lastSeenAt ? Math.floor((now - device.lastSeenAt.getTime()) / DAY) : 0;

export const noun = (n: number, word: string): string =>
	`${count(n)} ${word}${n === 1 ? "" : "s"}`;

export function deviceState(device: Device): StatusMark {
	switch (device.state) {
		case "online":
			return { tone: "done", label: "Online" };
		case "idle":
			return { tone: "waiting", label: "Idle" };
		case "offline":
			return {
				tone: daysAway(device) >= 1 ? "attention" : "idle",
				label: "Offline",
			};
		case "waiting":
			return { tone: "attention", label: "Never connected" };
		case "revoked":
			return { tone: "failed", label: "Revoked" };
	}
}

// What the owner does about a device that is not syncing, or undefined when it is.
export function deviceFix(device: Device): string | undefined {
	const days = daysAway(device);
	switch (device.state) {
		case "offline":
			return days >= 1
				? `Not seen for ${noun(days, "day")}. Open the agent on this machine and it syncs when it connects.`
				: "Offline. It syncs when the agent on this machine connects.";
		case "waiting":
			return "The key is made but the agent has not connected. Run the pairing command on that machine.";
		case "revoked":
			return "Its key is revoked. Forget it, or pair the machine again as a new device.";
		default:
			return undefined;
	}
}

// What the agent reports as `platform`, in words.
const PLATFORMS: Record<string, string> = {
	darwin: "macOS",
	win32: "Windows",
	linux: "Linux",
};

export const platformName = (platform: string): string =>
	PLATFORMS[platform] ?? platform;

// What a Rekordbox install's write support means for the owner.
export const WRITE: Record<string, string> = {
	supported: "Rekordbox is written when it is closed",
	"pending-verification":
		"Rekordbox writes wait until the agent has checked this Rekordbox version",
	"unsupported-schema": "This Rekordbox version is not supported for writes",
	"cloud-sync": "Turn Cloud Library Sync off to write Rekordbox",
	unknown: "Rekordbox writes unknown",
};

// What is wrong with a device's files or Rekordbox, as the row's warning.
export function deviceWarning(device: Device): Fact | undefined {
	if (device.files.failed > 0)
		return { warning: `${noun(device.files.failed, "file")} failed` };
	if (device.rekordbox?.writeSupport === "cloud-sync")
		return { warning: "Cloud Library Sync is on" };
	return undefined;
}
