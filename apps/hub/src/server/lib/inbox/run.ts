import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import { applyOutcome, type InboxItem, nextStep } from "@trackvault/core/inbox";
import { inboxItems } from "../../../schema/index.ts";
import { db } from "../db.ts";
import { activeRules } from "../rules.ts";
import { readSettings } from "../settings.ts";
import { loadTaxonomies } from "../taxonomy.ts";
import { discoverInbox } from "./discover.ts";
import { type ItemRow, patchItem, stepsOf } from "./items.ts";
import { fileExists, HANDLERS, type StepEnv } from "./steps.ts";

export function buildEnv(root: string, signal: AbortSignal): StepEnv {
	return {
		root,
		settings: readSettings(),
		rules: activeRules(),
		taxonomies: loadTaxonomies(),
		signal,
	};
}

const viewOf = (row: ItemRow): InboxItem => ({
	id: row.id,
	path: row.path,
	source: row.source,
	state: row.state,
	steps: stepsOf(row),
});

// Runs the item's pipeline as far as it goes: step after step until it halts (a
// duplicate, a question for the owner), waits for approval, or fails. Every step's
// result is stored before the next starts, so a stop in the middle resumes there.
export async function advanceItem(
	initial: ItemRow,
	env: StepEnv,
): Promise<ItemRow> {
	let row = initial;
	for (;;) {
		env.signal.throwIfAborted();
		const view = viewOf(row);
		const next = nextStep(view);
		if (next.kind === "stopped") return row;
		if (next.kind === "failed") {
			const error = stepsOf(row)[next.step]?.error ?? "A step failed";
			patchItem(row.id, { state: "failed", error });
			return { ...row, state: "failed", error };
		}
		if (next.kind === "wait-approval") {
			if (row.state !== "awaiting-approval")
				patchItem(row.id, { state: "awaiting-approval", error: null });
			return { ...row, state: "awaiting-approval" };
		}
		if (!(await fileExists(row, env))) {
			patchItem(row.id, { state: "failed", error: "The file is gone" });
			return { ...row, state: "failed", error: "The file is gone" };
		}
		const step = next.step.id;
		let run: Awaited<ReturnType<(typeof HANDLERS)[typeof step]>>;
		try {
			run = await HANDLERS[step](row, env);
		} catch (error) {
			if (env.signal.aborted) throw error;
			run = {
				outcome: {
					kind: "fail",
					error: error instanceof Error ? error.message : String(error),
					retryable: true,
				},
			};
		}
		const updated = applyOutcome(view, step, run.outcome, Date.now());
		const failed = run.outcome.kind === "fail" ? run.outcome.error : null;
		const patch: Partial<ItemRow> = {
			...run.patch,
			steps: updated.steps,
			state: updated.state,
			error: failed,
		};
		patchItem(row.id, patch);
		row = { ...row, ...patch };
	}
}

export interface PassResult {
	added: number;
	removed: number;
	deferred: number;
	processed: number;
	ready: number;
	waiting: number;
	failed: number;
	// Items the settings approve (or reject) by themselves.
	approve: string[];
	replace: string[];
	reject: string[];
}

// Brings the inbox table in step with the folder, and runs every queued item. Items
// are advanced a few at a time; the heavy steps (hash, fingerprint, the cutoff
// check) are I/O and child processes.
export async function runPass(
	root: string,
	signal: AbortSignal,
	progress: (done: number, total: number, message: string) => void,
): Promise<PassResult> {
	progress(0, 0, "Looking in the inbox");
	const found = await discoverInbox(root, signal);
	const rows = db()
		.select()
		.from(inboxItems)
		.where(inArray(inboxItems.state, ["queued", "processing"]))
		.orderBy(inboxItems.createdAt, inboxItems.id)
		.all();
	const result: PassResult = {
		added: found.added,
		removed: found.removed,
		deferred: found.deferred,
		processed: 0,
		ready: 0,
		waiting: 0,
		failed: 0,
		approve: [],
		replace: [],
		reject: [],
	};
	const env = buildEnv(root, signal);
	progress(0, rows.length, "Running the pipeline");
	let next = 0;
	const lane = async (): Promise<void> => {
		for (;;) {
			signal.throwIfAborted();
			const row = rows[next++];
			if (!row) return;
			const done = await advanceItem(row, env);
			result.processed++;
			collect(done, env, result);
			progress(result.processed, rows.length, "Running the pipeline");
		}
	};
	await Promise.all([lane(), lane(), lane()]);
	return result;
}

// Sorts a finished item into what the settings do with it.
function collect(row: ItemRow, env: StepEnv, result: PassResult): void {
	const s = env.settings;
	if (row.state === "failed") result.failed++;
	else if (row.state === "awaiting-approval") {
		result.ready++;
		if (row.override) return;
		if (row.decisionKind === "accept" && s.inboxAutoApprove)
			result.approve.push(row.id);
		else if (row.decisionKind === "better-than-existing" && s.inboxAutoReplace)
			result.replace.push(row.id);
	} else if (row.state === "duplicate") {
		if (s.inboxAutoRejectDuplicates && !row.override)
			result.reject.push(row.id);
		else result.waiting++;
	} else if (row.state === "needs-review") result.waiting++;
}

// Items the owner pressed Retry on: failed steps are forgotten and the item runs again.
export function retryItems(ids: readonly string[]): number {
	let n = 0;
	for (const row of db()
		.select()
		.from(inboxItems)
		.where(
			and(inArray(inboxItems.id, [...ids]), eq(inboxItems.state, "failed")),
		)
		.all()) {
		const steps = stepsOf(row);
		for (const [id, step] of Object.entries(steps))
			if (step.status === "failed") delete steps[id as keyof typeof steps];
		patchItem(row.id, { state: "queued", steps, error: null });
		n++;
	}
	return n;
}
