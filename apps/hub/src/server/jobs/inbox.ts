import { randomUUID } from "node:crypto";
import { approveItems, rejectItems } from "../lib/inbox/approve.ts";
import { SETTLE_MS } from "../lib/inbox/discover.ts";
import { runPass } from "../lib/inbox/run.ts";
import { inboxState } from "../lib/inbox/state.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";

export type InboxPayload = Record<string, never>;

export interface InboxResult {
	added: number;
	processed: number;
	ready: number;
	waiting: number;
	failed: number;
	approved: number;
	rejected: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// A pass that finds files still being written looks again after they settle, up to here.
const SETTLE_WAIT_MS = 90_000;

// The inbox pipeline (core INBOX_PIPELINE): new files under `Inbox/` become items, and
// each runs hash, fingerprint, duplicate check, cleanup rules, taxonomy, auto-tag
// (skipped until R4) and the target path, then waits for approval. What the settings
// approve by themselves is filed at the end. Safe to run twice: discovery matches by
// path and every step's result is stored, so a repeat does only what is left.
export default defineJob<InboxPayload, InboxResult>({
	kind: "inbox",
	concurrency: 1,
	async run({ id, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const total: InboxResult = {
			added: 0,
			processed: 0,
			ready: 0,
			waiting: 0,
			failed: 0,
			approved: 0,
			rejected: 0,
		};
		const started = Date.now();
		for (;;) {
			inboxState.dirty = false;
			const pass = await runPass(root, signal, progress);
			total.added += pass.added;
			total.processed += pass.processed;
			total.ready = pass.ready;
			total.waiting = pass.waiting;
			total.failed += pass.failed;
			const approve = [...pass.approve, ...pass.replace];
			if (approve.length > 0) {
				const done = await approveItems(approve, {
					batchId: randomUUID(),
					origin: "rule",
					signal,
					progress,
				});
				total.approved += done.approved;
			}
			if (pass.reject.length > 0)
				total.rejected += await rejectItems(pass.reject, id, signal);
			if (pass.deferred > 0 && Date.now() - started < SETTLE_WAIT_MS) {
				progress(total.processed, 0, "Waiting for files to finish arriving");
				await wait(SETTLE_MS + 500);
				continue;
			}
			if (!inboxState.dirty) break;
		}
		progress(
			total.processed,
			total.processed,
			total.processed === 0
				? "Nothing new in the inbox"
				: `${total.ready} ready, ${total.waiting} for you`,
		);
		return total;
	},
});
