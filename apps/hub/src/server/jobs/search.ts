import { defineJob } from "../lib/job.ts";
import { searchAndStore, wantOfQuery } from "../lib/search.ts";
import { slskdClient } from "../lib/slskd.ts";

export interface SearchPayload {
	query: string;
	// The rows the screen reads; defaults to the job's own id.
	searchId?: string;
	artist?: string;
	title?: string;
	mix?: string | null;
}

export interface SearchResult {
	searchId: string;
	state: string;
	peers: number;
	files: number;
	accepted: number;
	rejected: number;
}

// One Soulseek search by hand: asks slskd, ranks the answers (core/ranking), marks what
// the library already has and stores the list under the job's id for the Search place.
export default defineJob<SearchPayload, SearchResult>({
	kind: "search",
	concurrency: 2,
	maxAttempts: 1,
	async run({ id, payload, signal, progress }) {
		const client = slskdClient();
		progress(0, 0, `Searching: ${payload.query}`);
		const want =
			payload.artist !== undefined && payload.title !== undefined
				? {
						artist: payload.artist,
						title: payload.title,
						mix: payload.mix ?? null,
					}
				: wantOfQuery(payload.query);
		const summary = await searchAndStore(
			client,
			payload.searchId ?? id,
			payload.query,
			want,
			{ signal },
		);
		progress(
			summary.accepted,
			summary.accepted,
			`${summary.accepted} candidates from ${summary.peers} peers`,
		);
		return {
			searchId: summary.searchId,
			state: summary.state,
			peers: summary.peers,
			files: summary.files,
			accepted: summary.accepted,
			rejected: summary.rejected,
		};
	},
});
