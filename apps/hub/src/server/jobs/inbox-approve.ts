import { approveItems, rejectItems } from "../lib/inbox/approve.ts";
import { defineJob } from "../lib/job.ts";

export interface InboxApprovePayload {
	action: "approve" | "reject";
	ids: string[];
}

export interface InboxApproveResult {
	approved: number;
	replaced: number;
	rejected: number;
	failed: number;
	errors: string[];
}

// Files inbox items into the library, or sets them aside. Approving moves each file to
// the path its target names, reads it into a track, writes the cleaned tags and, for a
// better copy, swaps it in for the library's track (one batch, so History can undo it).
// An item already filed is skipped, so a repeat does nothing twice.
export default defineJob<InboxApprovePayload, InboxApproveResult>({
	kind: "inbox-approve",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		if (payload.action === "reject") {
			const rejected = await rejectItems(payload.ids, id, signal);
			progress(rejected, rejected, `${rejected} rejected`);
			return { approved: 0, replaced: 0, rejected, failed: 0, errors: [] };
		}
		progress(0, payload.ids.length, "Filing tracks");
		const done = await approveItems(payload.ids, {
			batchId: id,
			origin: "ui",
			signal,
			progress,
		});
		progress(
			done.approved,
			payload.ids.length,
			done.failed > 0
				? `${done.approved} filed, ${done.failed} failed`
				: `${done.approved} filed`,
		);
		return { ...done, rejected: 0 };
	},
});
