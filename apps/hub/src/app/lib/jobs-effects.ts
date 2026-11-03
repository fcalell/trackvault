import {
	type EntityName,
	invalidateForWrites,
} from "@fcalell/plugin-api/query-invalidation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { jobsChannel } from "../../shared/channels.ts";
import { ws } from "./live.ts";

// What a finished job has changed besides the library (which its own channel tells):
// the screens that page through its result read these.
const AFTER_JOB: EntityName[] = [
	"previews",
	"batches",
	"changes",
	"files",
	"dupeGroups",
	"dupeMembers",
	"genres",
	"genreAliases",
	"artistAliases",
	"labelAliases",
	"healthChecks",
	"fingerprints",
	"settings",
	"rules",
	"jobs",
	"inboxItems",
	"downloads",
	"wishlist",
	"searchResults",
	"imports",
	"importItems",
	"playlists",
	"playlistTracks",
];

// A job that finishes refreshes the reads that show what it produced (a preview, the
// duplicate groups, the history, the quarantine), once.
export function useJobEffects(): void {
	const queryClient = useQueryClient();
	useEffect(() => {
		const finished = new Set<string>();
		const subscription = ws.subscribe(jobsChannel, {
			onMessage: {
				snapshot() {},
				upsert(job) {
					if (job.state === "queued" || job.state === "running") {
						finished.delete(job.id);
						return;
					}
					if (finished.has(job.id)) return;
					finished.add(job.id);
					invalidateForWrites(queryClient, AFTER_JOB);
				},
			},
		});
		return () => subscription.unsubscribe();
	}, [queryClient]);
}
