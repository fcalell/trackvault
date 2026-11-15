import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import {
	deviceFix,
	deviceState,
	noun,
	platformName,
	WRITE,
} from "../../ui/devices.ts";
import { age, count, date, size } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/devices/$deviceId")({
	loader: ({ context, params }) =>
		preload(
			context.queryClient,
			orpc.devices.get.read({ id: params.deviceId }),
		),
	component: DeviceRecord,
});

// One device: how its local copy and its Rekordbox stand, and the places to look further.
function DeviceRecord() {
	const { deviceId } = Route.useParams();
	const device = orpc.devices.get.read({ id: deviceId });
	const unmatched = orpc.devices.unmatched.read({ id: deviceId });
	const wake = useMutation(orpc.devices.wake.mutationOptions());
	return (
		<Pane
			title={device.at((each) => each.name)}
			noun="device"
			read={device}
			record={{
				overline: [
					device.at((each) =>
						[
							each.platform ? platformName(each.platform) : undefined,
							each.hostname,
						]
							.filter((part): part is string => Boolean(part))
							.join(" · "),
					),
				],
				facts: [
					device.at(deviceState),
					device.at((each) => ({
						label: noun(each.openConflicts, "conflict"),
						href: "/devices/conflicts",
					})),
					device.at((each) => `${count(each.unmatched ?? 0)} not matched`),
				],
				description: device.at((each) => deviceFix(each) ?? ""),
			}}
			acts={[
				{
					icon: "RefreshCw",
					label: "Sync now",
					blocked: device.at((each) =>
						each.state === "online"
							? undefined
							: "The agent on this machine is not connected",
					),
					onAct: () => wake.mutateAsync({ id: deviceId }),
					done: "Asked the device to sync",
				},
			]}
		>
			<Section
				title="Local copy"
				items={device.at((each) => [
					{
						key: "files",
						label: "Files",
						title: `${noun(each.files.ok, "file")} in the local copy`,
						line:
							each.files.pending > 0
								? `${count(each.files.pending)} still to arrive`
								: undefined,
					},
					...(each.localRoot
						? [
								{
									key: "root",
									label: "Folder",
									title: { code: each.localRoot },
								},
							]
						: []),
					...(each.freeDiskBytes !== null
						? [
								{
									key: "free",
									label: "Free space",
									title: size(each.freeDiskBytes),
								},
							]
						: []),
					...(each.lastSeenAt
						? [
								{
									key: "seen",
									label: "Last seen",
									title: date(each.lastSeenAt),
									trailing: { age: age(each.lastSeenAt) },
								},
							]
						: []),
				])}
			/>
			<Section
				title="Rekordbox"
				items={device.at((each) =>
					each.rekordbox?.installed
						? [
								{
									key: "version",
									label: "Version",
									title: each.rekordbox.appVersion ?? "Unknown",
								},
								{
									key: "writes",
									label: "Writes",
									title:
										WRITE[each.rekordbox.writeSupport] ??
										each.rekordbox.writeSupport,
									line:
										each.rekordbox.pendingExport > 0
											? `${noun(each.rekordbox.pendingExport, "change")} wait for Rekordbox to close`
											: undefined,
								},
								...(each.lastImportAt
									? [
											{
												key: "import",
												label: "Read",
												title: date(each.lastImportAt),
												trailing: { age: age(each.lastImportAt) },
											},
										]
									: []),
							]
						: [],
				)}
				empty={{ sentence: "No Rekordbox is reported on this device." }}
			/>
			<Section
				title="Not matched"
				description={device.at((each) =>
					each.unmatched !== null && each.unmatched > 200
						? `${count(each.unmatched)} tracks have no match; the first 200 are listed.`
						: "Rekordbox lists these, and the hub holds no file with the same path or audio. Add the files to the library and the next read links them.",
				)}
				items={unmatched.at((rows) =>
					rows.map((track) => ({
						key: track.contentId,
						leading: { icon: "Music" as const },
						title: track.title ?? "Untitled",
						line: track.artist ?? "Unknown artist",
						facts: [{ code: track.path }],
					})),
				)}
				empty={{ sentence: "Every track in this Rekordbox is matched." }}
			/>
		</Pane>
	);
}
