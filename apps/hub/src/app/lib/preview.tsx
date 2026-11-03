import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Act } from "@fcalell/plugin-react-ui/lib/act";
import type { Tone } from "@fcalell/ui-core/tokens";
import type { JobView } from "../../shared/channels.ts";
import { count } from "../ui/figures.ts";
import { orpc } from "./api.ts";
import { STORED_CHANGE_COLUMNS, STORED_CHANGE_ROW } from "./changes.ts";

type Kind = "rules" | "unify" | "organise";
type Fields = ("genre" | "artist" | "label")[];

interface Preview {
	kind: Kind;
	// A unify preview is of the fields it was run over.
	fields?: Fields;
}

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
			? `${job.message ?? "Working"}: ${count(job.done)} of ${count(job.total)}`
			: (job.message ?? "Waiting for the preview to start.");
	}
	return words(result);
}

// A rows of one result window, paged by the hub: the last preview job of a kind,
// its counts and its changes as before and after.
function PreviewRows({ kind, fields }: Preview) {
	const latest = useRead(orpc.previews.latest.read({ kind, fields }));
	if (latest?.job.state !== "done") return null;
	return (
		<Table
			label="Changes"
			items={orpc.previews.list.window({ jobId: latest.job.id })}
			columns={STORED_CHANGE_COLUMNS}
			row={STORED_CHANGE_ROW}
		/>
	);
}

// What a preview's result says of itself: how many changes it holds.
type Changes = (result: Record<string, number>) => number;

// The act that does a previewed change for real, the page's one filled act: the Pane's
// `foot`. It waits for a finished preview that holds changes.
export function PreviewFoot({
	kind,
	fields,
	apply,
	changes,
}: Preview & {
	// The act that does it for real; its label says what it writes.
	apply: Act;
	changes: Changes;
}) {
	const latest = useRead(orpc.previews.latest.read({ kind, fields }));
	const blocked = !latest
		? "Preview first"
		: latest.job.state !== "done"
			? "Wait for the preview"
			: changes((latest.result ?? {}) as Record<string, number>) > 0
				? undefined
				: "The preview changes nothing";
	return <ActionBar acts={[{ ...apply, blocked }]} />;
}

// The preview of a bulk change on a screen: a banner with the job's progress or its
// counts, and the change table under it.
export function PreviewSection({
	kind,
	fields,
	title,
	none,
	words,
}: Preview & {
	title: string;
	// Under the title before any preview has run (a sentence).
	none: string;
	// The counts in words once the preview is done.
	words: (result: Record<string, number>) => string;
}) {
	const latest = orpc.previews.latest.read({ kind, fields });
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
			/>
			<PreviewRows kind={kind} fields={fields} />
		</Section>
	);
}
