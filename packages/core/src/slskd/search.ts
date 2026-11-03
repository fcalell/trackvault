import { randomUUID } from "node:crypto";
import type { SlskdClient } from "./client.ts";
import { isAudio, normalizeResponses } from "./normalize.ts";
import type { SlskdSearchRequest, SoulseekFile } from "./types.ts";

export interface SearchOptions {
	// Longest to wait for results. Default 15000.
	waitMs?: number;
	// Stop early once this many peers answered. Default 10.
	minResponses?: number;
	// Poll interval. Default 1000.
	pollMs?: number;
	// Keep the search on the server (default: deleted after collecting).
	keep?: boolean;
	// Audio files only. Default true.
	audioOnly?: boolean;
	request?: Omit<SlskdSearchRequest, "id" | "searchText">;
	signal?: AbortSignal;
}

export interface SearchOutcome {
	searchId: string;
	query: string;
	state: string;
	responseCount: number;
	files: SoulseekFile[];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Starts a search, polls until it completes, enough peers answered or the wait
// ran out, then returns the normalised files. The search is stopped and
// removed on the server unless `keep`.
export async function searchAndCollect(
	client: SlskdClient,
	query: string,
	options: SearchOptions = {},
): Promise<SearchOutcome> {
	const waitMs = options.waitMs ?? 15_000;
	const minResponses = options.minResponses ?? 10;
	const pollMs = options.pollMs ?? 1000;
	const id = randomUUID();
	await client.searches.create({
		searchTimeout: waitMs,
		filterResponses: true,
		...options.request,
		id,
		searchText: query,
	});
	const deadline = Date.now() + waitMs;
	let state = "Requested";
	let responseCount = 0;
	try {
		for (;;) {
			options.signal?.throwIfAborted();
			const s = await client.searches.get(id);
			state = s.state;
			responseCount = s.responseCount;
			if (s.isComplete || responseCount >= minResponses) break;
			if (Date.now() + pollMs > deadline) break;
			await wait(pollMs);
		}
		await client.searches.stop(id).catch(() => undefined);
		const responses = await client.searches.responses(id);
		const files = normalizeResponses(responses);
		return {
			searchId: id,
			query,
			state,
			responseCount: responses.length,
			files: options.audioOnly === false ? files : files.filter(isAudio),
		};
	} finally {
		if (!options.keep) await client.searches.delete(id).catch(() => undefined);
	}
}
