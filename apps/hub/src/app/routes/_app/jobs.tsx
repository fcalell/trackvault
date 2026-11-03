import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import type { IconName } from "@fcalell/ui-core/descriptors";
import type { Tone } from "@fcalell/ui-core/tokens";
import { createFileRoute } from "@tanstack/react-router";
import type { JobView } from "../../../shared/channels.ts";
import { orpc } from "../../lib/api.ts";
import { jobsLive } from "../../lib/live.ts";

export const Route = createFileRoute("/_app/jobs")({
	component: Jobs,
});

const KINDS: Record<string, { title: string; icon: IconName }> = {
	scan: { title: "Library scan", icon: "FolderSearch" },
	"tag-write": { title: "Tag write", icon: "Tags" },
	peaks: { title: "Waveforms", icon: "AudioWaveform" },
	edit: { title: "Edit tags", icon: "PencilLine" },
	rules: { title: "Cleanup rules", icon: "WandSparkles" },
	unify: { title: "Unify tags", icon: "Replace" },
	organise: { title: "Organise", icon: "FolderTree" },
	quarantine: { title: "Quarantine", icon: "Archive" },
	restore: { title: "Restore", icon: "ArchiveRestore" },
	purge: { title: "Purge quarantine", icon: "Trash2" },
	undo: { title: "Undo batch", icon: "Undo2" },
	merge: { title: "Merge duplicates", icon: "Merge" },
	dedupe: { title: "Find duplicates", icon: "Copy" },
	fingerprint: { title: "Fingerprints", icon: "Fingerprint" },
	integrity: { title: "Integrity check", icon: "ShieldCheck" },
	bitrate: { title: "Bitrate check", icon: "Gauge" },
	inbox: { title: "Inbox pipeline", icon: "Inbox" },
	"inbox-approve": { title: "File inbox items", icon: "CheckCheck" },
	search: { title: "Soulseek search", icon: "Search" },
	wishlist: { title: "Wishlist search", icon: "Star" },
	"playlist-import": { title: "Playlist import", icon: "ListMusic" },
	backup: { title: "Database backup", icon: "DatabaseBackup" },
	"backup-verify": { title: "Check a backup", icon: "ShieldCheck" },
	offsite: { title: "Offsite upload", icon: "CloudUpload" },
};

const TONES: Record<JobView["state"], Tone> = {
	queued: "waiting",
	running: "running",
	done: "done",
	failed: "failed",
	cancelled: "idle",
};

const count = new Intl.NumberFormat("en");

function detail(job: JobView): string[] {
	const parts: string[] = [];
	if (job.state === "failed" && job.error) return [job.error];
	if (job.message) parts.push(job.message);
	if (job.total > 0 && (job.state === "running" || job.state === "queued")) {
		parts.push(`${count.format(job.done)} of ${count.format(job.total)}`);
	}
	return parts;
}

// Every job the hub has run or is running, live: a scan fills its row as it reads.
function Jobs() {
	const cancel = useMutation(orpc.jobs.cancel.mutationOptions());
	const toRow = (job: JobView): Row => ({
		key: job.id,
		leading: { icon: (KINDS[job.kind] ?? { icon: "Cog" }).icon },
		title: (KINDS[job.kind] ?? { title: job.kind }).title,
		meta: detail(job),
		status: { tone: TONES[job.state] },
		trailing: { age: job.createdAt },
		act:
			job.state === "queued" || job.state === "running"
				? {
						icon: "X",
						label: "Cancel",
						onAct: () => cancel.mutateAsync({ id: job.id }),
					}
				: undefined,
	});
	return (
		<Pane title="Jobs" read={jobsLive} back={false}>
			<Section
				items={jobsLive.at((jobs) => jobs.map(toRow))}
				empty={{
					sentence:
						"No jobs yet. A scan of the library shows here while it runs.",
				}}
			/>
		</Pane>
	);
}
