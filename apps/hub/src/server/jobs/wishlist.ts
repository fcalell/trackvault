import { eq, inArray } from "@fcalell/plugin-db/orm";
import { alreadyInLibrary } from "@trackvault/core/ranking";
import {
	buildQueries,
	nextSearch,
	type RetryState,
} from "@trackvault/core/wishlist";
import { wishlist } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { resultsByIds, startDownload } from "../lib/downloads.ts";
import { defineJob } from "../lib/job.ts";
import { hubLibraryIndex } from "../lib/library-index.ts";
import { searchAndStore } from "../lib/search.ts";
import { readSettings } from "../lib/settings.ts";
import { slskdClient } from "../lib/slskd.ts";
import { dueWants, setStatus, type WantRow } from "../lib/wishlist.ts";

export interface WishlistPayload {
	// Search these now, due or not ("Search now"); absent takes the wants that are due.
	wantIds?: number[];
}

export interface WishlistResult {
	searched: number;
	found: number;
	downloading: number;
	inLibrary: number;
	gaveUp: number;
}

// Wants searched per run: each search waits on the peers for up to 20 seconds, and the
// service asks again a minute later.
const PER_RUN = 5;

export const searchIdOf = (wantId: number): string => `want-${wantId}`;

// Applies core's retry schedule to the wishlist: for each want that is due, search
// Soulseek with the next query variant, rank the candidates and, with auto-download on
// and a candidate above the score threshold, download the best one; otherwise mark the
// want found for review, or schedule the next try (and give up when the schedule ends).
// A want already in the library is closed without a search.
export default defineJob<WishlistPayload, WishlistResult>({
	kind: "wishlist",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const client = slskdClient();
		const settings = readSettings();
		const wants: WantRow[] = payload.wantIds
			? db()
					.select()
					.from(wishlist)
					.where(inArray(wishlist.id, payload.wantIds))
					.all()
			: dueWants(PER_RUN);
		const result: WishlistResult = {
			searched: 0,
			found: 0,
			downloading: 0,
			inLibrary: 0,
			gaveUp: 0,
		};
		progress(0, wants.length, "Searching Soulseek");
		for (const [index, want] of wants.entries()) {
			signal.throwIfAborted();
			if (!payload.wantIds && !["wanted", "searching"].includes(want.status))
				continue;
			if (!want.betterThanTrackId) {
				const have = await alreadyInLibrary(
					{ artist: want.artist, title: want.title, mix: want.mix },
					hubLibraryIndex,
				);
				if (have.status === "have") {
					setStatus(want.id, "in-library");
					result.inLibrary++;
					continue;
				}
			}
			const queries = buildQueries(want);
			const state: RetryState = {
				attempts: want.attempts,
				lastAttemptAt: want.lastAttemptAt?.getTime() ?? null,
			};
			const now = Date.now();
			const plan = nextSearch(state, queries.length, now);
			if (!plan.due && !payload.wantIds) {
				setStatus(want.id, "gave-up");
				result.gaveUp++;
				continue;
			}
			const variant = plan.due
				? plan.variantIndex
				: want.attempts % queries.length;
			const query = queries[variant] ?? `${want.artist} ${want.title}`;
			setStatus(want.id, "searching");
			progress(index, wants.length, `Searching: ${query}`);
			let summary: Awaited<ReturnType<typeof searchAndStore>>;
			try {
				summary = await searchAndStore(
					client,
					searchIdOf(want.id),
					query,
					{
						artist: want.artist,
						title: want.title,
						mix: want.mix,
						durationSec: want.durationSec,
					},
					{ minFormatScore: want.minFormatScore ?? undefined, signal },
				);
			} catch (error) {
				// slskd unreachable or busy: the want keeps its place and waits an hour.
				setStatus(want.id, "wanted", {
					nextSearchAt: new Date(now + 3600_000),
					note: error instanceof Error ? error.message : String(error),
				});
				continue;
			}
			result.searched++;
			const attempts = want.attempts + 1;
			const best = summary.best;
			const extra = {
				attempts,
				lastAttemptAt: new Date(now),
				bestScore: best?.score ?? null,
				note: `${summary.accepted} candidates from ${summary.peers} peers (${query})`,
			};
			if (best && best.have !== "have") {
				if (
					settings.wishlistAutoDownload &&
					best.score >= settings.wishlistMinScore
				) {
					const [candidate] = resultsByIds([best.id]);
					if (candidate) {
						await startDownload(client, candidate, want.id);
						db()
							.update(wishlist)
							.set(extra)
							.where(eq(wishlist.id, want.id))
							.run();
						result.downloading++;
						continue;
					}
				}
				setStatus(want.id, "found", { ...extra, nextSearchAt: null });
				result.found++;
				continue;
			}
			const following = nextSearch(
				{ attempts, lastAttemptAt: now },
				queries.length,
				now,
			);
			if (!following.due) {
				setStatus(want.id, "gave-up", extra);
				result.gaveUp++;
			} else
				setStatus(want.id, "wanted", {
					...extra,
					nextSearchAt: new Date(following.at),
				});
		}
		progress(
			wants.length,
			wants.length,
			`${result.found} found, ${result.downloading} downloading`,
		);
		return result;
	},
});
