import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import type { Fact } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { BACKUP_KINDS } from "../../../shared/backups.ts";
import type { JobView } from "../../../shared/channels.ts";
import { orpc } from "../../lib/api.ts";
import { jobsLive } from "../../lib/live.ts";
import { JOB_STATE, jobKind, jobLine } from "../../ui/backups.ts";
import { age, count, date, size } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/backups")({
	component: Backups,
});

type Local = AppRouter["backups"]["list"]["__output"][number];
const STALE_MS = 2 * 86_400_000;
const isStale = (at: Date): boolean => Date.now() - at.getTime() > STALE_MS;

type Remote = AppRouter["backups"]["remote"]["__output"]["items"][number];

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
		title: date(backup.takenAt),
		facts: [
			check,
			...[
				size(backup.size),
				backup.tracks !== null ? `${count(backup.tracks)} tracks` : undefined,
				backup.compression === "none" ? "uncompressed" : backup.compression,
				backup.kind === "manual" ? "by hand" : undefined,
				backup.offsite ? "Offsite" : undefined,
			].filter((part): part is string => part !== undefined),
		],
		trailing: { age: age(backup.takenAt) },
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
					sentence: `${date(backup.takenAt)} is removed from the hub's backup folder. A copy offsite stays.`,
				},
				destructive: true,
			},
		],
	};
}

const remoteRow = (item: Remote): Row => ({
	key: item.key,
	leading: { icon: "Cloud" },
	title: date(item.takenAt),
	facts: [size(item.size), item.encrypted ? "Encrypted" : "Not encrypted"],
	trailing: { age: age(item.takenAt) },
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
		<>
			<Pane
				title="Backups"
				read={jobsLive}
				back={false}
				wide
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
					{
						icon: "Settings",
						label: "Backup settings",
						href: "/backups/settings",
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
							key: "good",
							leading: { icon: "ShieldCheck" },
							title: each.lastGood
								? `Last good backup ${date(each.lastGood)}`
								: "No good backup yet",
							facts: [
								each.lastGood && !isStale(each.lastGood)
									? { tone: "done", label: "Checked" }
									: {
											warning: each.lastGood
												? "Over two days old"
												: "None checked",
										},
							],
							line:
								each.lastBackup?.state === "failed"
									? `The latest backup failed: ${each.lastBackup.error ?? "no reason given"}`
									: undefined,
							...(each.lastGood
								? { trailing: { age: age(each.lastGood) } }
								: {}),
						},
						{
							key: "next",
							leading: { icon: "CalendarClock" },
							title: each.enabled
								? `Next backup ${each.nextAt ? date(each.nextAt) : ""}`
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
								? `${count(each.offsite.files)} audio files, ${size(each.offsite.bytes)} sent`
								: "Not set up: the bucket and keys are in the backup settings",
							act: {
								icon: "Settings" as const,
								label: "Backup settings",
								href: "/backups/settings",
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
							"No backups yet. Back up now, or wait for the hour set in the backup settings.",
						act: {
							label: "Back up now",
							onAct: () => backupNow.mutateAsync(),
							done: "Backup started",
						},
					}}
				/>
				<Section
					title="Offsite"
					description="Database backups in the bucket."
					items={remote.at((each) =>
						each.configured && each.error
							? [
									{
										key: "unreachable",
										leading: { icon: "CloudOff" as const },
										title: "The bucket cannot be read",
										facts: [{ tone: "failed" as const, label: "Unreachable" }],
										line: `${each.error}. Test the connection in the backup settings: the endpoint, bucket and keys must be right and the keys able to list the bucket.`,
										act: {
											icon: "Settings" as const,
											label: "Backup settings",
											href: "/backups/settings",
										},
									},
								]
							: each.items.map(remoteRow),
					)}
					empty={{
						sentence: remote.at((each) =>
							each.configured
								? "Nothing is in the bucket yet."
								: "Offsite storage is not set up. The bucket and keys are in the backup settings.",
						),
						act: { label: "Open backup settings", href: "/backups/settings" },
					}}
				/>
				<Section
					title="Restore"
					folded
					description="Run these on the machine the hub is on."
					items={status.at((each) => [
						{
							key: "stop",
							label: "1. Stop the hub",
							title: "Stop the hub so nothing has the database open",
							line: "The restore command will not run while the hub is running",
						},
						{
							key: "local",
							label: "2. From a backup here",
							title: {
								code: `node dist/server/bin/restore.mjs --dir ${each.dir} <backup file>`,
							},
							line: "Leave the file name out and add --list to see the backups. The command checks the backup, keeps the current database beside it under a name ending in .pre-restore, and puts the backup in its place",
						},
						{
							key: "bucket",
							label: "2. Or from the bucket",
							title: {
								code: "node dist/server/bin/restore-offsite.mjs --library <music folder>",
							},
							line: "For a new machine. The command restores the newest database backup, then downloads and checks every music file. If it is interrupted, run it again. Add --db-only to restore the database and leave the music",
						},
						{
							key: "start",
							label: "3. Start the hub",
							title: "Start the hub: it applies any newer migrations",
							line: "Agents keep their device keys, and the first scan finds the files in place",
						},
					])}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
