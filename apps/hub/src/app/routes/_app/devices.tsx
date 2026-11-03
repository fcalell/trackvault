import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { Fact, Tone } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/devices")({
	component: Devices,
});

type Device = AppRouter["devices"]["list"]["__output"][number];

const count = new Intl.NumberFormat("en");

const STATE: Record<Device["state"], { tone: Tone; label: string }> = {
	online: { tone: "done", label: "Online" },
	idle: { tone: "waiting", label: "Idle" },
	offline: { tone: "idle", label: "Offline" },
	waiting: { tone: "waiting", label: "Waiting for the agent" },
	revoked: { tone: "failed", label: "Revoked" },
};

// What a Rekordbox install's write support means for the owner.
const WRITE: Record<string, string> = {
	supported: "Rekordbox is written when it is closed",
	"pending-verification": "Rekordbox writes wait for verification",
	"unsupported-schema": "This Rekordbox version is not supported for writes",
	"cloud-sync": "Turn Cloud Library Sync off to write Rekordbox",
	unknown: "Rekordbox writes unknown",
};

const noun = (n: number, word: string): string =>
	`${count.format(n)} ${word}${n === 1 ? "" : "s"}`;

// The agent's pairing command, with the key the hub has just made.
const pairCommand = (key: string, name: string): string =>
	`node apps/agent/src/cli.ts pair ${window.location.origin} ${key} --name "${name}"`;

// The machines that sync with the hub: their keys, what they hold, how their Rekordbox
// stands. A new key is shown once, with the command that pairs the agent.
function Devices() {
	const devices = orpc.devices.list.read();
	const revoke = useMutation(orpc.auth.devices.revoke.mutationOptions());
	const forget = useMutation(orpc.devices.forget.mutationOptions());
	const wake = useMutation(orpc.devices.wake.mutationOptions());
	const [paired, setPaired] = useState<{ name: string; key: string } | null>(
		null,
	);

	const toRow = (device: Device): Row => {
		const rb = device.rekordbox;
		const words = [
			device.platform,
			device.hostname,
			device.state === "waiting"
				? `Key ${device.keyStart ?? ""}…`
				: `${noun(device.files.ok, "file")} in the replica${device.files.pending > 0 ? `, ${count.format(device.files.pending)} waiting` : ""}`,
			rb?.installed ? `Rekordbox ${rb.appVersion ?? ""}`.trim() : undefined,
			rb?.installed && rb.pendingExport > 0
				? `${noun(rb.pendingExport, "change")} waiting for Rekordbox to close`
				: undefined,
			device.unmatched
				? `${noun(device.unmatched, "track")} not matched`
				: undefined,
		].filter((part): part is string => Boolean(part));
		const facts: Fact[] = [
			STATE[device.state],
			...(device.files.failed > 0
				? [{ warning: `${noun(device.files.failed, "file")} failed` }]
				: rb?.writeSupport === "cloud-sync"
					? [{ warning: "Cloud Library Sync is on" }]
					: []),
			...words,
		];
		return {
			key: device.id,
			leading: {
				icon: device.platform === "darwin" ? "Laptop" : "MonitorSmartphone",
			},
			title: device.name,
			facts,
			...(rb?.installed
				? { line: WRITE[rb.writeSupport] ?? rb.writeSupport }
				: {}),
			...(device.lastSeenAt
				? { trailing: { age: device.lastSeenAt.toISOString() } }
				: {}),
			...(device.openConflicts > 0
				? {
						act: {
							icon: "GitMerge" as const,
							label: `${noun(device.openConflicts, "conflict")} to review`,
							href: "/devices/conflicts",
						},
					}
				: {}),
			more: [
				...(device.state === "online"
					? [
							{
								label: "Sync now",
								onAct: () => wake.mutateAsync({ id: device.id }),
								done: "Asked the device to sync",
							},
						]
					: []),
				...(device.state === "revoked"
					? [
							{
								label: "Forget",
								onAct: () => forget.mutateAsync({ id: device.id }),
								confirm: {
									title: `Forget ${device.name}?`,
									sentence:
										"Its file states and Rekordbox links are dropped. Pairing the machine again starts it as a new device.",
								},
							},
						]
					: [
							{
								label: "Revoke key",
								onAct: () => revoke.mutateAsync({ id: device.id }),
								confirm: {
									title: `Revoke ${device.name}?`,
									sentence:
										"The agent on that machine is refused from its next request. Files already on it stay.",
								},
								destructive: true,
							},
						]),
			],
		};
	};

	return (
		<>
			<Pane
				title="Devices"
				back={false}
				acts={[
					{
						icon: "Plus",
						label: "Pair a device",
						sheet: sheetOf({
							title: "Pair a device",
							description:
								"Make a key for one machine. It is shown once, with the command that pairs the agent.",
							form: {
								act: orpc.auth.devices.create,
								fields: { name: { label: "Name of the machine" } },
								submit: { label: "Make key" },
								onDone: (made, input) =>
									setPaired({ name: input.name, key: made.key }),
							},
						}),
					},
					{
						icon: "GitMerge",
						label: "Conflicts",
						href: "/devices/conflicts",
					},
				]}
			>
				{paired && (
					<Section
						title="New device key"
						description="Copy this now: the hub keeps only a hash of the key."
						items={[
							{
								key: "key",
								label: "Key",
								title: { code: paired.key, copy: true },
							},
							{
								key: "command",
								label: "Pair",
								title: {
									code: pairCommand(paired.key, paired.name),
									copy: true,
								},
							},
						]}
						act={{
							icon: "Check",
							label: "I have copied it",
							onAct: () => setPaired(null),
						}}
					/>
				)}
				<Section
					read={devices}
					items={devices.at((rows) => rows.map(toRow))}
					empty={{
						sentence:
							"No devices yet. Pair a machine to give it a replica of the library or to sync its Rekordbox.",
					}}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
