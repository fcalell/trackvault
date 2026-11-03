import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Act } from "@fcalell/plugin-react-ui/lib/act";
import type { Tone } from "@fcalell/ui-core/tokens";
import type { AppRouter } from "../../../.stack/worker";
import type { JobView } from "../../shared/channels.ts";
import { count, date } from "../ui/figures.ts";
import { orpc } from "./api.ts";
import { CHANGE_COLUMNS, CHANGE_ROW } from "./changes.ts";

type Kind = "rules" | "unify" | "organise";

type Latest = NonNullable<AppRouter["previews"]["latest"]["__output"]>;
type Counts = Record<string, number>;

const TONES: Record<JobView["state"], Tone> = {
	queued: "waiting",
	running: "running",
	done: "done",
	failed: "failed",
	cancelled: "idle",
};

const progress = (job: JobView, idle: string): string =>
	job.total > 0
		? `${job.message ?? "Working"}: ${count(job.done)} of ${count(job.total)}`
		: (job.message ?? idle);

const when = (job: JobView): string =>
	job.finishedAt ? date(new Date(job.finishedAt)) : "";

// What a preview and the apply after it say together: a plan waiting to be applied
// is a caution, and only an apply that finished reads as done.
function verdict(
	latest: Latest,
	words: (result: Counts) => string,
	changes: (result: Counts) => number,
): { tone: Tone; sentence: string } {
	const { job, apply } = latest;
	if (apply) {
		if (apply.state === "done")
			return { tone: "done", sentence: `Applied ${when(apply)}.` };
		if (apply.state === "failed")
			return { tone: "failed", sentence: apply.error ?? "The apply failed." };
		if (apply.state === "cancelled")
			return { tone: "idle", sentence: "The apply was cancelled." };
		return {
			tone: TONES[apply.state],
			sentence: progress(apply, "Waiting to apply."),
		};
	}
	if (job.state === "failed")
		return { tone: "failed", sentence: job.error ?? "The preview failed." };
	if (job.state === "cancelled")
		return { tone: "idle", sentence: "The preview was cancelled." };
	if (job.state !== "done" || !latest.result)
		return {
			tone: TONES[job.state],
			sentence: progress(job, "Waiting for the preview to start."),
		};
	const result = latest.result as Counts;
	return changes(result) > 0
		? {
				tone: "attention",
				sentence: `${words(result)} Planned ${when(job)}, not applied yet.`,
			}
		: { tone: "idle", sentence: `${words(result)} Planned ${when(job)}.` };
}

// The rows of the plan the last preview stored, paged by the hub, until it is applied.
function PreviewRows({ kind }: { kind: Kind }) {
	const latest = useRead(orpc.previews.latest.read({ kind }));
	if (latest?.job.state !== "done" || latest.apply?.state === "done")
		return null;
	return (
		<Table
			label="Changes"
			items={orpc.previews.list.window({ jobId: latest.job.id })}
			columns={CHANGE_COLUMNS}
			row={CHANGE_ROW}
		/>
	);
}

// The preview of a bulk change on a screen: a banner with the plan's progress, its
// counts and when it was made, the apply act while the plan waits, and the change
// table under it.
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
	words: (result: Counts) => string;
	// How many changes the result holds: none offers no apply.
	changes: (result: Counts) => number;
}) {
	const latest = orpc.previews.latest.read({ kind });
	const said = latest.at((each) =>
		each ? verdict(each, words, changes) : undefined,
	);
	return (
		<Section title={title} read={latest} empty={{ sentence: none }}>
			<Banner
				tone={said.at((each) => each?.tone ?? "idle")}
				sentence={said.at((each) => each?.sentence)}
				act={latest.at((each) =>
					each?.job.state === "done" &&
					!each.apply &&
					changes((each.result ?? {}) as Counts) > 0
						? apply
						: undefined,
				)}
			/>
			<PreviewRows kind={kind} />
		</Section>
	);
}
