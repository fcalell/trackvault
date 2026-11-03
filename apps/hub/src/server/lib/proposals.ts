import { proposals } from "../../schema/index.ts";
import type { ProposalDraft } from "./autotag.ts";
import { db } from "./db.ts";
import { inserter, statement } from "./raw.ts";

const insertProposal = inserter(proposals);

// Stores a track's auto-tag result for review. The track's earlier open proposals
// are replaced; a change the owner already rejected is not made again.
export function storeProposals(
	runId: string,
	trackId: string,
	label: string,
	changes: readonly ProposalDraft[],
): number {
	const rejected = new Set(
		(
			statement(
				"SELECT field, after FROM proposals WHERE track_id = @t AND state = 'rejected'",
			).all({ t: trackId }) as Array<{ field: string; after: string }>
		).map((row) => `${row.field}\0${row.after}`),
	);
	let stored = 0;
	db().transaction(() => {
		statement(
			"DELETE FROM proposals WHERE track_id = @t AND state IN ('pending', 'stale')",
		).run({ t: trackId });
		for (const change of changes) {
			if (rejected.has(`${change.field}\0${change.after}`)) continue;
			insertProposal({
				runId,
				trackId,
				label,
				field: change.field,
				before: change.before,
				after: change.after,
				source: change.source,
				sourceUrl: change.sourceUrl,
				confidence: change.confidence,
				alternatives: change.alternatives,
				state: "pending",
				createdAt: new Date(),
			});
			stored++;
		}
	});
	return stored;
}
