import { safeJoin } from "@trackvault/core/paths";
import type { PlanField } from "@trackvault/core/providers";
import {
	buildProviders,
	factsOf,
	planTrack,
	policyOf,
} from "../lib/autotag.ts";
import { defineJob } from "../lib/job.ts";
import { storeProposals } from "../lib/proposals.ts";
import {
	eachTrack,
	labelOf,
	primaryFiles,
	type Selection,
	selectedIds,
} from "../lib/selection.ts";
import { readSettings } from "../lib/settings.ts";
import { loadTaxonomies } from "../lib/taxonomy.ts";

export interface AutotagPayload {
	tracks: Selection;
}

export interface AutotagResult {
	tracks: number;
	proposals: number;
	unknownGenres: number;
	errors: Record<string, number>;
	skipped?: string;
}

const FIELDS: readonly PlanField[] = [
	"title",
	"artist",
	"albumArtist",
	"album",
	"genre",
	"year",
	"label",
	"isrc",
	"bpm",
	"key",
	"remixer",
];

// Asks the providers about each track of the selection and stores what they say as
// proposals for the Auto-tag review place; nothing is written to a track here. Safe to run
// twice: the track's open proposals are replaced, and answers come from the cache.
export default defineJob<AutotagPayload, AutotagResult>({
	kind: "autotag",
	concurrency: 1,
	maxAttempts: 5,
	async run({ id, payload, signal, progress }) {
		const settings = readSettings();
		const set = buildProviders(settings);
		const result: AutotagResult = {
			tracks: 0,
			proposals: 0,
			unknownGenres: 0,
			errors: {},
		};
		if (set.providers.length === 0) {
			const reason =
				"No provider is ready: add a MusicBrainz user agent, or switch Deezer on, in Settings";
			progress(0, 0, reason);
			return { ...result, skipped: reason };
		}
		const ids = selectedIds(payload.tracks);
		const root = settings.libraryRoot;
		const files = root ? primaryFiles(ids) : new Map();
		const policy = policyOf(settings);
		const taxonomies = loadTaxonomies();
		const total = ids.length;
		progress(0, total, "Looking tracks up");
		let handled = 0;
		for (const row of eachTrack(ids)) {
			signal.throwIfAborted();
			handled++;
			if (!row.title && !row.artist && !set.acoustid) {
				progress(handled, total);
				continue;
			}
			const file = files.get(row.id);
			const facts = await factsOf(
				row,
				set,
				root && file ? safeJoin(root, file.path) : undefined,
			);
			const current = Object.fromEntries(
				FIELDS.map((field) => [field, row[field] ?? null]),
			);
			const plan = await planTrack(
				set,
				facts,
				current,
				policy,
				taxonomies,
				signal,
			);
			for (const failure of plan.errors)
				result.errors[failure.provider] =
					(result.errors[failure.provider] ?? 0) + 1;
			result.unknownGenres += plan.unknownGenres.length;
			result.proposals += storeProposals(
				id,
				row.id,
				labelOf(row),
				plan.changes,
			);
			result.tracks++;
			progress(handled, total, "Looking tracks up");
		}
		progress(
			total,
			total,
			`${result.proposals} proposals for ${result.tracks} tracks`,
		);
		return result;
	},
});
