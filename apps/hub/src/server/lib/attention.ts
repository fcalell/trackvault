import { statement } from "./raw.ts";

// Inbox items the owner acts on: ready to approve, or held back (a duplicate, a
// decision to make, a failure).
export const INBOX_WAITING_STATES = [
	"awaiting-approval",
	"duplicate",
	"needs-review",
	"failed",
] as const;

// A failed job is news for this long.
const FAILED_JOB_DAYS = 7;

export interface Attention {
	inbox: number;
	review: number;
	conflicts: number;
	duplicates: number;
	failedJobs: number;
	backupFailed: boolean;
}

const waiting = INBOX_WAITING_STATES.map((state) => `'${state}'`).join(", ");

// Every count is a range of one index on its state: inbox_items_state_idx,
// proposals_review_idx, conflicts_state_idx, dupe_groups_state_idx and jobs_state_idx.
// The backup is the newest job of its kind.
export function attention(): Attention {
	const row = statement(
		`SELECT
			(SELECT count(*) FROM inbox_items WHERE state IN (${waiting})) AS inbox,
			(SELECT count(DISTINCT track_id) FROM proposals WHERE state IN ('pending', 'accepted')) AS review,
			(SELECT count(*) FROM conflicts WHERE state = 'open') AS conflicts,
			(SELECT count(*) FROM dupe_groups WHERE state = 'open') AS duplicates,
			(SELECT count(*) FROM jobs WHERE state = 'failed' AND kind <> 'backup' AND created_at >= @since) AS failedJobs,
			coalesce((SELECT state = 'failed' FROM jobs WHERE kind = 'backup' ORDER BY created_at DESC LIMIT 1), 0) AS backupFailed`,
	).get({ since: Date.now() - FAILED_JOB_DAYS * 86_400_000 }) as Omit<
		Attention,
		"backupFailed"
	> & { backupFailed: number };
	return { ...row, backupFailed: row.backupFailed === 1 };
}
