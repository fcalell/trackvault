import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import type { Fact } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { BACKUP_KINDS } from "../../../shared/backups.ts";
import type { JobView } from "../../../shared/channels.ts";
import { orpc } from "../../lib/api.ts";
import { jobsLive } from "../../lib/live.ts";
import {
	dateTime,
	JOB_STATE,
	jobKind,
	jobLine,
	size,
} from "../../ui/backups.ts";

export const Route = createFileRoute("/_app/backups")({
	component: Backups,
});

type Local = AppRouter["backups"]["list"]["__output"][number];
type Remote = AppRouter["backups"]["remote"]["__output"]["items"][number];

const count = new Intl.NumberFormat("en");

function localRow(
	backup: Local,
	verify: (name: string) => Promise<unknown>,
	remove: (name: string) => Promise<unknown>,
): Row {
	const check: Fact =
		backup.state === "verified"
			? { tone: "done", label: "Checked" }
			: backup.state === "failed"
				? { tone: "failed", label: "Failed its check" }
				: { tone: "waiting", label: "Not checked" };
	return {
		key: backup.name,
		leading: { icon: "DatabaseBackup" },
		title: dateTime(backup.takenAt),
		facts: [
			check,
			...[
				size(backup.size),
				backup.tracks !== null
					? `${count.format(backup.tracks)} tracks`
					: undefined,
				backup.compression === "none" ? "uncompressed" : backup.compression,
				backup.kind === "manual" ? "by hand" : undefined,
				backup.offsite ? "Offsite" : undefined,
			].filter((part): part is string => part !== undefined),
		],
		trailing: { age: backup.takenAt.toISOString() },
		more: [
			{
				label: "Check now",
				onAct: () => verify(backup.name),
				done: "Checking the backup",
			},
			{
				label: "Delete",
				onAct: () => remove(backup.name),
				confirm: {
					title: "Delete this backup?",
					sentence: `${dateTime(backup.takenAt)} is removed from the hub's backup folder. A copy offsite stays.`,
				},
				destructive: true,
			},
		],
	};
}

const remoteRow = (item: Remote): Row => ({
	key: item.key,
	leading: { icon: "Cloud" },
	title: dateTime(item.takenAt),
	facts: [size(item.size), item.encrypted ? "Encrypted" : "Not encrypted"],
	trailing: { age: item.takenAt.toISOString() },
});

// Database backups on the hub and in the bucket, what is running now, and the
// state of the schedule. Settings are on the Settings place.
function Backups() {
	const status = orpc.backups.status.read();
	const local = orpc.backups.list.read();
	const remote = orpc.backups.remote.read();
	const backupNow = useMutation(orpc.backups.backupNow.mutationOptions());
	const uploadNow = useMutation(orpc.backups.uploadNow.mutationOptions());
	const verify = useMutation(orpc.backups.verify.mutationOptions());
	const remove = useMutation(orpc.backups.remove.mutationOptions());

	const jobRow = (job: JobView): Row => ({
		key: job.id,
		leading: { icon: jobKind(job.kind).icon },
		title: jobKind(job.kind).title,
		facts: [JOB_STATE[job.state]],
		line: jobLine(job),
		trailing: { age: job.createdAt },
	});

	return (
		<Pane
			title="Backups"
			read={jobsLive}
			back={false}
			acts={[
				{
					icon: "DatabaseBackup",
					label: "Back up now",
					onAct: () => backupNow.mutateAsync(),
					done: "Backup started",
				},
				{
					icon: "CloudUpload",
					label: "Send offsite now",
					onAct: () => uploadNow.mutateAsync({ library: false }),
					done: "Upload started",
				},
			]}
		>
			<Section
				title="Now"
				description="Backups and uploads as they run."
				items={jobsLive.at((jobs) =>
					jobs
						.filter((job) =>
							(BACKUP_KINDS as readonly string[]).includes(job.kind),
						)
						.slice(0, 6)
						.map(jobRow),
				)}
				empty={{
					sentence:
						"Nothing running. The next backup is on the schedule below.",
				}}
			/>
			<Section
				title="Schedule"
				items={status.at((each) => [
					{
						key: "next",
						leading: { icon: "CalendarClock" },
						title: each.enabled
							? `Next backup ${each.nextAt ? dateTime(each.nextAt) : ""}`
							: "Daily backup is off",
						facts: [{ code: each.dir }],
						...(each.freeBytes !== null
							? { trailing: { value: `${size(each.freeBytes)} free` } }
							: {}),
					},
					{
						key: "offsite",
						leading: { icon: "Cloud" },
						title: each.offsite.enabled
							? "Offsite storage is on"
							: "Offsite storage is off",
						line: each.offsite.configured
							? `${count.format(each.offsite.files)} audio files, ${size(each.offsite.bytes)} sent`
							: "Not set up: the bucket and keys are in Settings",
						act: {
							icon: "Settings" as const,
							label: "Open settings",
							href: "/settings",
						},
					},
				])}
			/>
			<Section
				title="On this hub"
				description="Each backup is checked when it is taken. Check one again to catch a disk that has gone bad since."
				items={local.at((rows) =>
					rows.map((row) =>
						localRow(
							row,
							(name) => verify.mutateAsync({ name }),
							(name) => remove.mutateAsync({ name }),
						),
					),
				)}
				empty={{
					sentence:
						"No backups yet. Back up now, or wait for the hour set in Settings.",
				}}
			/>
			<Section
				title="Offsite"
				description="Database backups in the bucket. To restore from them, run restore-offsite.mjs from the bundle with the hub stopped."
				items={remote.at((each) =>
					each.configured && !each.error ? each.items.map(remoteRow) : [],
				)}
				empty={{
					sentence: remote.at((each) =>
						!each.configured
							? "Offsite storage is not set up. The bucket and keys are in Settings."
							: each.error
								? `The bucket could not be read: ${each.error}`
								: "Nothing is in the bucket yet.",
					),
				}}
			/>
		</Pane>
	);
}
