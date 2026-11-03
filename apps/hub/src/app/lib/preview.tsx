import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Act } from "@fcalell/plugin-react-ui/lib/act";
import type { Tone } from "@fcalell/ui-core/tokens";
import type { JobView } from "../../shared/channels.ts";
import { orpc } from "./api.ts";
import { CHANGE_COLUMNS, CHANGE_ROW } from "./changes.ts";

type Kind = "rules" | "unify" | "organise";

const count = new Intl.NumberFormat("en");

const TONES: Record<JobView["state"], Tone> = {
	queued: "waiting",
	running: "running",
	done: "done",
	failed: "failed",
	cancelled: "idle",
};

// The sentence a preview job's state and counts make.
function said(
	job: JobView,
	result: Record<string, number> | null,
	words: (result: Record<string, number>) => string,
): string {
	if (job.state === "failed") return job.error ?? "The preview failed.";
	if (job.state === "cancelled") return "The preview was cancelled.";
	if (job.state !== "done" || !result) {
		return job.total > 0
			? `${job.message ?? "Working"}: ${count.format(job.done)} of ${count.format(job.total)}`
			: (job.message ?? "Waiting for the preview to start.");
	}
	return words(result);
}

// A rows of one result window, paged by the hub: the last preview job of a kind,
// its counts and its changes as before and after.
function PreviewRows({ kind }: { kind: Kind }) {
	const latest = useRead(orpc.previews.latest.read({ kind }));
	if (latest?.job.state !== "done") return null;
	return (
		<Table
			label="Changes"
			items={orpc.previews.list.window({ jobId: latest.job.id })}
			columns={CHANGE_COLUMNS}
			row={CHANGE_ROW}
		/>
	);
}

// The preview of a bulk change on a screen: a banner with the job's progress or its
// counts, the apply act once it is done, and the change table under them.
export function PreviewSection({
	kind,
	title,
	apply,
	none,
	words,
	changes,
}: {
	kind: Kind;
	title: string;
	// The act that does it for real.
	apply: Act;
	// Under the title before any preview has run (a sentence).
	none: string;
	// The counts in words once the preview is done.
	words: (result: Record<string, number>) => string;
	// How many changes the result holds: none offers no apply.
	changes: (result: Record<string, number>) => number;
}) {
	const latest = orpc.previews.latest.read({ kind });
	return (
		<Section title={title} read={latest} empty={{ sentence: none }}>
			<Banner
				tone={latest.at((each) => (each ? TONES[each.job.state] : "idle"))}
				sentence={latest.at((each) =>
					each
						? said(
								each.job,
								each.result as Record<string, number> | null,
								words,
							)
						: undefined,
				)}
				act={latest.at((each) =>
					each?.job.state === "done" &&
					changes((each.result ?? {}) as Record<string, number>) > 0
						? apply
						: undefined,
				)}
			/>
			<PreviewRows kind={kind} />
		</Section>
	);
}
