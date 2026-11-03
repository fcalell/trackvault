import { invalidateForWrites } from "@fcalell/plugin-api/query-invalidation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { libraryChannel } from "../../shared/channels.ts";
import { ws } from "./live.ts";

// Windows are refetched at most this often while a scan writes in batches.
const REFRESH_EVERY_MS = 750;

// Keeps the library on screen current: every committed batch of changes on the
// `library` channel refreshes what reads the tracks (the loaded windows, the facet
// counts, an open record). A scan writes many batches a second, so the refresh is
// throttled, with a trailing one so the last batch always lands. The server tells
// the version too: a socket that was down and comes back with a new one refreshes.
export function useLibraryLive(): void {
	const queryClient = useQueryClient();
	useEffect(() => {
		let last = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let seen: number | undefined;
		const refresh = (): void => {
			timer = undefined;
			last = Date.now();
			invalidateForWrites(queryClient, ["tracks", "conflicts"]);
		};
		const schedule = (): void => {
			if (timer !== undefined) return;
			const wait = Math.max(0, last + REFRESH_EVERY_MS - Date.now());
			timer = setTimeout(refresh, wait);
		};
		const subscription = ws.subscribe(libraryChannel, {
			onMessage: {
				snapshot({ version }) {
					if (seen !== undefined && version !== seen) schedule();
					seen = version;
				},
				changed({ version }) {
					seen = version;
					schedule();
				},
			},
		});
		return () => {
			if (timer !== undefined) clearTimeout(timer);
			subscription.unsubscribe();
		};
	}, [queryClient]);
}
