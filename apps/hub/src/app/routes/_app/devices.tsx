import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { Fact } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../../lib/api.ts";
import {
	type Device,
	deviceFix,
	deviceState,
	deviceWarning,
	noun,
	platformName,
} from "../../ui/devices.ts";
import { age, count } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/devices")({
	component: Devices,
});

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
		const warning = deviceWarning(device);
		const conflicts = device.openConflicts;
		const facts: Fact[] = [
			deviceState(device),
			...(warning ? [warning] : []),
			...(conflicts > 0
				? [{ warning: `${noun(conflicts, "conflict")} to review` }]
				: []),
			...(device.platform ? [platformName(device.platform)] : []),
			...(device.hostname ? [device.hostname] : []),
			...(rb?.installed ? [`Rekordbox ${rb.appVersion ?? ""}`.trim()] : []),
		];
		const line =
			deviceFix(device) ??
			[
				`${noun(device.files.ok, "file")} in the replica${device.files.pending > 0 ? `, ${count(device.files.pending)} waiting` : ""}`,
				rb?.installed && rb.pendingExport > 0
					? `${noun(rb.pendingExport, "change")} waiting for Rekordbox to close`
					: undefined,
			]
				.filter((sentence): sentence is string => Boolean(sentence))
				.join(". ");
		return {
			key: device.id,
			leading: {
				icon: device.platform === "darwin" ? "Laptop" : "MonitorSmartphone",
			},
			title: device.name,
			facts,
			line,
			href: `/devices/${device.id}`,
			...(device.lastSeenAt
				? { trailing: { age: age(device.lastSeenAt) } }
				: {}),
			...(device.state === "online"
				? {
						act: {
							icon: "RefreshCw" as const,
							label: "Sync now",
							onAct: () => wake.mutateAsync({ id: device.id }),
							done: "Asked the device to sync",
						},
					}
				: {}),
			more: [
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
				wide
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
