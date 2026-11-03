import type { IconName, StatusMark } from "@fcalell/ui-core/descriptors";
import type { JobView } from "../../shared/channels.ts";

const MB = 1024 * 1024;

// 12.4 MB, 3.2 GB.
export function size(bytes: number): string {
	return bytes >= 1024 * MB
		? `${(bytes / (1024 * MB)).toFixed(1)} GB`
		: `${(bytes / MB).toFixed(1)} MB`;
}

const when = new Intl.DateTimeFormat("en", {
	weekday: "short",
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

// Tue 3 Nov, 03:00.
export const dateTime = (date: Date): string => when.format(date);

const BACKUP_JOB: Record<string, { title: string; icon: IconName }> = {
	backup: { title: "Database backup", icon: "DatabaseBackup" },
	"backup-verify": { title: "Check a backup", icon: "ShieldCheck" },
	offsite: { title: "Offsite upload", icon: "CloudUpload" },
};

export const JOB_STATE: Record<JobView["state"], StatusMark> = {
	queued: { tone: "waiting" },
	running: { tone: "running" },
	done: { tone: "done" },
	failed: { tone: "failed" },
	cancelled: { tone: "idle" },
};

// The sentence a job row carries: its failure, else its message.
export function jobLine(job: JobView): string | undefined {
	if (job.state === "failed" && job.error) return job.error;
	return job.message || undefined;
}

export const jobKind = (kind: string): { title: string; icon: IconName } =>
	BACKUP_JOB[kind] ?? { title: kind, icon: "Cog" };
