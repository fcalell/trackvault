import type { IconName, StatusMark } from "@fcalell/ui-core/descriptors";
import type { JobView } from "../../shared/channels.ts";

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
