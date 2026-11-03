import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Card } from "@fcalell/plugin-react-ui/components/card";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Act } from "@fcalell/plugin-react-ui/lib/act";
import type { Tone } from "@fcalell/ui-core/tokens";
import type { AppRouter } from "../../../.stack/worker";
import type { JobView } from "../../shared/channels.ts";
import { count, date } from "../ui/figures.ts";
import { orpc } from "./api.ts";
import { STORED_CHANGE_COLUMNS, STORED_CHANGE_ROW } from "./changes.ts";

type Kind = "rules" | "unify" | "organise";
type Fields = ("genre" | "artist" | "label")[];

interface Preview {
	kind: Kind;
	// A tidy-spellings preview is of the fields it was run over.
	fields?: Fields;
}

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
function PreviewRows({ kind, fields }: Preview) {
	const latest = useRead(orpc.previews.latest.read({ kind, fields }));
	if (latest?.job.state !== "done" || latest.apply?.state === "done")
		return null;
	return (
		<Table
			label="Changes"
			items={orpc.previews.list.window({ jobId: latest.job.id })}
			columns={STORED_CHANGE_COLUMNS}
			row={STORED_CHANGE_ROW}
		/>
	);
}

// The act that carries a plan out, the page's one filled act: the Pane's `foot`. It
// waits for a finished plan that holds changes and has not been applied.
export function PreviewFoot({
	kind,
	fields,
	apply,
	changes,
}: Preview & {
	// The act that does it for real; its label says what it writes.
	apply: Act;
	changes: (result: Counts) => number;
}) {
	const latest = useRead(orpc.previews.latest.read({ kind, fields }));
	const blocked = !latest
		? "Preview first"
		: latest.job.state !== "done"
			? "Wait for the preview"
			: latest.apply
				? "This plan was already applied"
				: changes((latest.result ?? {}) as Counts) > 0
					? undefined
					: "The preview changes nothing";
	return <ActionBar acts={[{ ...apply, blocked }]} />;
}

// The preview of a bulk change on a screen: a banner with the plan's progress, its
// counts and when it was made, and the change table under it.
export function PreviewSection({
	kind,
	fields,
	title,
	none,
	words,
	changes,
}: Preview & {
	title: string;
	// Under the title before any preview has run (a sentence).
	none: string;
	// The counts in words once the preview is done.
	words: (result: Counts) => string;
	// How many changes the result holds: none offers no apply.
	changes: (result: Counts) => number;
}) {
	const latest = orpc.previews.latest.read({ kind, fields });
	const said = latest.at((each) =>
		each ? verdict(each, words, changes) : undefined,
	);
	return (
		<Section title={title} read={latest} empty={{ sentence: none }}>
			<Card>
				<Banner
					tone={said.at((each) => each?.tone ?? "idle")}
					sentence={said.at((each) => each?.sentence)}
				/>
			</Card>
			<PreviewRows kind={kind} fields={fields} />
		</Section>
	);
}
