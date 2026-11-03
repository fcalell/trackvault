import { fetchBestCover, resizeCover } from "@trackvault/core/art";
import { ISSUE } from "@trackvault/core/issues";
import { lookupAll } from "@trackvault/core/providers";
import { buildProviders, factsOf } from "../lib/autotag.ts";
import { writeTrackFiles } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { statement } from "../lib/raw.ts";
import {
	eachTrack,
	primaryFiles,
	type Selection,
	selectedIds,
} from "../lib/selection.ts";
import { readSettings } from "../lib/settings.ts";
import { bumpVersion, notifyChanged } from "../services/library.ts";

export interface ArtPayload {
	// Absent: every track flagged "No artwork".
	tracks?: Selection;
	// Look again, and replace art that is already acceptable.
	force?: boolean;
}

export interface ArtResult {
	embedded: number;
	kept: number;
	notFound: number;
	failed: number;
	skipped?: string;
}

const RETRY_AFTER_MS = 30 * 24 * 3600 * 1000;

// Finds a cover for each track (the providers' cover links and the Cover Art
// Archive), embeds the best one that is square and big enough, and clears the
// "No artwork" flag. A track with acceptable art is left alone unless forced; a
// search that found nothing is not repeated for 30 days unless forced. Safe to repeat.
export default defineJob<ArtPayload, ArtResult>({
	kind: "art",
	concurrency: 1,
	maxAttempts: 5,
	async run({ payload, signal, progress }) {
		const settings = readSettings();
		const root = settings.libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const set = buildProviders(settings);
		const result: ArtResult = { embedded: 0, kept: 0, notFound: 0, failed: 0 };
		if (set.providers.length === 0) {
			const skipped = "No provider is ready (see Settings, Auto-tag)";
			progress(0, 0, skipped);
			return { ...result, skipped };
		}
		const ids = payload.tracks
			? selectedIds(payload.tracks)
			: (
					statement(
						`SELECT id FROM tracks WHERE (issues & ${ISSUE.noArt}) != 0 AND (issues & ${ISSUE.quarantined}) = 0 ORDER BY seq`,
					).all() as Array<{ id: string }>
				).map((row) => row.id);
		const files = primaryFiles(ids);
		const policy = { minSide: settings.artMinSide };
		const total = ids.length;
		let handled = 0;
		progress(0, total, "Looking for covers");
		const check = (
			trackId: string,
			outcome: string,
			cover?: { source?: string; width: number; height: number },
		): void => {
			statement(
				`INSERT OR REPLACE INTO art_checks (track_id, result, source, width, height, checked_at)
				 VALUES (@t, @r, @s, @w, @h, @at)`,
			).run({
				t: trackId,
				r: outcome,
				s: cover?.source ?? null,
				w: cover?.width ?? null,
				h: cover?.height ?? null,
				at: Date.now(),
			});
		};
		for (const row of eachTrack(ids)) {
			signal.throwIfAborted();
			handled++;
			progress(handled, total);
			const file = files.get(row.id);
			if (!file) continue;
			if (!payload.force) {
				const last = statement(
					"SELECT checked_at AS at FROM art_checks WHERE track_id = @t",
				).get({ t: row.id }) as { at: number } | undefined;
				if (row.hasArt || (last && Date.now() - last.at < RETRY_AFTER_MS)) {
					result.kept++;
					continue;
				}
			}
			try {
				const facts = await factsOf(row, set);
				const found = await lookupAll(set.providers, facts, { signal });
				const best = await fetchBestCover(found.candidates, {
					userAgent: set.userAgent,
					signal,
					...policy,
				});
				if (!best.cover || !best.acceptable) {
					check(row.id, best.cover ? "small" : "none", best.cover ?? undefined);
					result.notFound++;
					continue;
				}
				const picture = await resizeCover(best.cover, 1000);
				const written = { written: 0, failed: 0, errors: [] as string[] };
				await writeTrackFiles(
					root,
					row.id,
					{ picture: { mime: picture.mime, data: picture.data } },
					written,
				);
				if (written.written === 0) {
					result.failed++;
					continue;
				}
				let version = 0;
				db().transaction((tx) => {
					version = bumpVersion(tx);
					statement(
						`UPDATE tracks SET has_art = 1, issues = issues & ~${ISSUE.noArt}, updated_at = @now, version = @v WHERE id = @id`,
					).run({ now: Date.now(), v: version, id: row.id });
					void tx;
				});
				notifyChanged([row.id], version);
				check(row.id, "embedded", best.cover);
				result.embedded++;
			} catch (error) {
				if (signal.aborted) throw error;
				result.failed++;
			}
		}
		progress(
			total,
			total,
			`${result.embedded} covers embedded, ${result.notFound} not found`,
		);
		return result;
	},
});
