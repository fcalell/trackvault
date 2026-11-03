import { eq, lt } from "@fcalell/plugin-db/orm";
import { parseTitle } from "@trackvault/core/normalize";
import {
	alreadyInLibrary,
	type RankedCandidate,
	rankCandidates,
} from "@trackvault/core/ranking";
import type { SlskdClient } from "@trackvault/core/slskd";
import { searchAndCollect } from "@trackvault/core/slskd";
import { searchResults } from "../../schema/index.ts";
import {
	WANTED_QUALITY_FLOOR,
	type WantedQuality,
} from "../../shared/acquire.ts";
import { db } from "./db.ts";
import { hubLibraryIndex } from "./library-index.ts";
import { readSettings } from "./settings.ts";

export interface WantQuery {
	artist: string;
	title: string;
	mix?: string | null;
	durationSec?: number | null;
}

// "Artist - Title (Mix)" as typed in a search box; with no dash the whole text is the title.
export function wantOfQuery(query: string): WantQuery {
	const parts = query.trim().split(/\s+[-–—]\s+/);
	if (parts.length >= 2)
		return {
			artist: parts[0] as string,
			title: parts.slice(1).join(" - "),
			mix: parseTitle(parts.slice(1).join(" - ")).mixName,
		};
	return { artist: "", title: query.trim(), mix: parseTitle(query).mixName };
}

export interface SearchSummary {
	searchId: string;
	query: string;
	state: string;
	peers: number;
	files: number;
	accepted: number;
	rejected: number;
	// The best accepted candidate (what the wishlist would download).
	best: { id: number; score: number; have: string } | null;
}

const KEEP_ACCEPTED = 100;
const KEEP_REJECTED = 20;
const HAVE_CHECKED = 80;

// Searches Soulseek through slskd, ranks what comes back against the want (core/ranking:
// title and artist match, version, format, authenticity, the peer's slots and queue),
// marks the candidates the library already has, and stores the list for the screen
// under `searchId` (a new search of the same id replaces the old rows).
export async function searchAndStore(
	client: SlskdClient,
	searchId: string,
	query: string,
	want: WantQuery,
	options: {
		minFormatScore?: number | undefined;
		signal?: AbortSignal | undefined;
		waitMs?: number | undefined;
	} = {},
): Promise<SearchSummary> {
	const settings = readSettings();
	const floor = Math.max(
		options.minFormatScore ?? 0,
		WANTED_QUALITY_FLOOR[settings.wantedQuality as WantedQuality] ?? 0,
	);
	const outcome = await searchAndCollect(client, query, {
		waitMs: options.waitMs ?? 20_000,
		minResponses: 25,
		...(options.signal ? { signal: options.signal } : {}),
	});
	const ranked = rankCandidates(want, outcome.files, {
		minFormatScore: floor,
		...(settings.slskdMaxQueue > 0 ? { maxQueue: settings.slskdMaxQueue } : {}),
	});
	const accepted = ranked.filter((r) => !r.rejected).slice(0, KEEP_ACCEPTED);
	const rejected = ranked.filter((r) => r.rejected).slice(0, KEEP_REJECTED);
	const kept: RankedCandidate[] = [...accepted, ...rejected];

	const have = new Map<number, { status: string; trackId: string | null }>();
	for (const [index, candidate] of kept.entries()) {
		if (candidate.rejected || index >= HAVE_CHECKED) continue;
		const parsed = candidate.parsed;
		const found = await alreadyInLibrary(
			{
				artist: parsed.artist ?? want.artist,
				title: parsed.title,
				mix: parsed.mixName,
				...(candidate.file.length
					? { durationSec: candidate.file.length }
					: {}),
			},
			hubLibraryIndex,
		);
		have.set(index, {
			status: found.status,
			trackId: found.entries[0] ? String(found.entries[0].id) : null,
		});
	}

	const database = db();
	const now = new Date();
	let firstId = 0;
	database.transaction((tx) => {
		tx.delete(searchResults).where(eq(searchResults.searchId, searchId)).run();
		for (const [index, candidate] of kept.entries()) {
			const f = candidate.file;
			const mark = have.get(index);
			const row = tx
				.insert(searchResults)
				.values({
					searchId,
					pos: index,
					username: f.user,
					filename: f.path,
					size: f.size,
					format: f.extension,
					bitrate: f.bitrate,
					sampleRate: f.sampleRate,
					bitDepth: f.bitDepth,
					lengthSec: f.length,
					queueLength: f.queueLength,
					freeSlot: f.freeUploadSlots,
					artist: candidate.parsed.artist,
					title: candidate.parsed.title,
					mix: candidate.parsed.mixName,
					score: candidate.score,
					rejected: candidate.rejected,
					reasons: candidate.reasons,
					needsCutoffCheck: candidate.needsCutoffCheck,
					have: mark?.status ?? "none",
					haveTrackId: mark?.trackId ?? null,
					createdAt: now,
				})
				.returning({ id: searchResults.id })
				.get();
			if (index === 0) firstId = row.id;
		}
	});
	const best = accepted[0];
	return {
		searchId,
		query,
		state: outcome.state,
		peers: outcome.responseCount,
		files: outcome.files.length,
		accepted: accepted.length,
		rejected: rejected.length,
		best: best
			? {
					id: firstId,
					score: best.score,
					have: have.get(0)?.status ?? "none",
				}
			: null,
	};
}

// Search results are kept a day.
export function purgeOldSearches(): void {
	db()
		.delete(searchResults)
		.where(lt(searchResults.createdAt, new Date(Date.now() - 24 * 3600 * 1000)))
		.run();
}
