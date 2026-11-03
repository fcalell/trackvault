// The inbox pipeline as data. The hub implements each step as a job; this file
// fixes the order, what each step needs and the contract between runner and
// step. Nothing here does I/O.

export type InboxStepId =
	| "hash"
	| "fingerprint"
	| "dedupe"
	| "rules"
	| "taxonomy"
	| "autotag"
	| "organise"
	| "approve";

export type InboxSource = "upload" | "soulseek" | "watch" | "agent";

export interface InboxStepDef {
	id: InboxStepId;
	label: string;
	// Steps whose result this one reads. Always earlier in the list.
	needs: readonly InboxStepId[];
	// A skipped optional step never blocks the ones after it.
	optional: boolean;
	// Needs a person; the runner parks the item here until it is resolved.
	manual: boolean;
}

export const INBOX_PIPELINE: readonly InboxStepDef[] = [
	{ id: "hash", label: "Hash", needs: [], optional: false, manual: false },
	{
		id: "fingerprint",
		label: "Fingerprint",
		needs: ["hash"],
		optional: true,
		manual: false,
	},
	{
		id: "dedupe",
		label: "Duplicate check",
		needs: ["hash", "fingerprint"],
		optional: false,
		manual: false,
	},
	{
		id: "rules",
		label: "Clean up tags",
		needs: ["dedupe"],
		optional: true,
		manual: false,
	},
	{
		id: "taxonomy",
		label: "Unify genres and names",
		needs: ["rules"],
		optional: true,
		manual: false,
	},
	// Skipped until the auto-tag providers exist (R4).
	{
		id: "autotag",
		label: "Auto-tag",
		needs: ["taxonomy", "fingerprint"],
		optional: true,
		manual: false,
	},
	{
		id: "organise",
		label: "Choose target path",
		needs: ["taxonomy"],
		optional: false,
		manual: false,
	},
	{
		id: "approve",
		label: "Approve",
		needs: ["organise"],
		optional: false,
		manual: true,
	},
];

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface StepResult {
	status: StepStatus;
	// Step-specific, JSON-safe (the hub stores it with the item).
	output?: unknown;
	reason?: string;
	error?: string;
	attempts?: number;
	at?: number;
}

export type InboxItemState =
	| "queued"
	| "processing"
	| "awaiting-approval"
	| "duplicate"
	| "needs-review"
	| "approved"
	| "rejected"
	| "failed";

export interface InboxItem {
	id: string;
	// Absolute path of the file in the inbox directory.
	path: string;
	source: InboxSource;
	// Soulseek user/path, watch folder, device id ...
	sourceRef?: string;
	state: InboxItemState;
	steps: Partial<Record<InboxStepId, StepResult>>;
}

// What a step handler returns to the runner.
export type StepOutcome =
	| { kind: "done"; output?: unknown }
	| { kind: "skip"; reason: string }
	// Stop the pipeline and put the item in this state (e.g. dedupe finds a duplicate).
	| {
			kind: "halt";
			state: Exclude<InboxItemState, "queued" | "processing">;
			reason: string;
			output?: unknown;
	  }
	| { kind: "fail"; error: string; retryable: boolean };

export interface InboxStepHandler {
	id: InboxStepId;
	run(item: InboxItem, signal: AbortSignal): Promise<StepOutcome>;
}

export interface InboxRunner {
	// Runs the next runnable step of the item, records its result, returns the item.
	advance(item: InboxItem): Promise<InboxItem>;
}

export type NextStep =
	| { kind: "run"; step: InboxStepDef }
	| { kind: "wait-approval" }
	| { kind: "stopped"; state: InboxItemState }
	| { kind: "failed"; step: InboxStepId };

const SETTLED = new Set<StepStatus>(["done", "skipped"]);

// The first step not yet settled whose needs are settled (a required need that
// failed blocks; an optional skipped one does not).
export function nextStep(
	item: Pick<InboxItem, "state" | "steps">,
	pipeline: readonly InboxStepDef[] = INBOX_PIPELINE,
	maxAttempts = 3,
): NextStep {
	if (
		item.state === "duplicate" ||
		item.state === "rejected" ||
		item.state === "approved" ||
		item.state === "needs-review"
	)
		return { kind: "stopped", state: item.state };
	for (const step of pipeline) {
		const r = item.steps[step.id];
		if (r && SETTLED.has(r.status)) continue;
		if (r?.status === "failed" && (r.attempts ?? 1) >= maxAttempts)
			return { kind: "failed", step: step.id };
		if (step.manual) return { kind: "wait-approval" };
		return { kind: "run", step };
	}
	return { kind: "wait-approval" };
}

// Applies an outcome to the item's record; pure, returns a new item.
export function applyOutcome(
	item: InboxItem,
	step: InboxStepId,
	outcome: StepOutcome,
	now: number,
): InboxItem {
	const prev = item.steps[step];
	const attempts = (prev?.attempts ?? 0) + 1;
	const at = now;
	switch (outcome.kind) {
		case "done":
			return {
				...item,
				state: "processing",
				steps: {
					...item.steps,
					[step]: { status: "done", output: outcome.output, attempts, at },
				},
			};
		case "skip":
			return {
				...item,
				state: "processing",
				steps: {
					...item.steps,
					[step]: { status: "skipped", reason: outcome.reason, attempts, at },
				},
			};
		case "halt":
			return {
				...item,
				state: outcome.state,
				steps: {
					...item.steps,
					[step]: {
						status: "done",
						output: outcome.output,
						reason: outcome.reason,
						attempts,
						at,
					},
				},
			};
		case "fail":
			return {
				...item,
				state: outcome.retryable ? "processing" : "failed",
				steps: {
					...item.steps,
					[step]: {
						status: "failed",
						error: outcome.error,
						attempts: outcome.retryable ? attempts : Number.MAX_SAFE_INTEGER,
						at,
					},
				},
			};
	}
}
