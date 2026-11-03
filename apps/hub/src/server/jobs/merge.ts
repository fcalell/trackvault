import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import { mergePlan, type TrackFacts } from "@trackvault/core/dedupe";
import {
	dupeGroups,
	dupeMembers,
	files,
	tracks,
	trackTags,
} from "../../schema/index.ts";
import { applyPatches, flushTagWrites } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { type FileMove, moveTracked } from "../lib/file-ops.ts";
import { acquireFs } from "../lib/fs-lock.ts";
import { defineJob } from "../lib/job.ts";
import { quarantinePath } from "../lib/quarantine.ts";
import { readSettings } from "../lib/settings.ts";
import type { TagValues } from "../lib/track-fields.ts";
import { applyTagSets } from "../lib/track-tags.ts";

export interface MergePayload {
	// The groups to merge, each into its keeper; or every open group of a tier.
	groupIds?: number[];
	reason?: "exact" | "acoustic" | "fuzzy";
}

export interface MergeResult {
	groups: number;
	quarantined: number;
	filled: number;
	failed: number;
}

// Merges duplicates into their keepers (core/dedupe mergePlan): tags the keeper
// lacks are filled from the others, custom tags are added, and the other files
// go to the quarantine. All of it is one batch, so one undo puts the group back.
export default defineJob<MergePayload, MergeResult>({
	kind: "merge",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const database = db();
		const groups = database
			.select()
			.from(dupeGroups)
			.where(
				and(
					eq(dupeGroups.state, "open"),
					payload.groupIds
						? inArray(dupeGroups.id, payload.groupIds)
						: undefined,
					payload.reason ? eq(dupeGroups.reason, payload.reason) : undefined,
				),
			)
			.all();
		const result: MergeResult = {
			groups: 0,
			quarantined: 0,
			filled: 0,
			failed: 0,
		};
		const info = {
			batchId: id,
			origin: "ui" as const,
			label: "Merge duplicates",
		};
		const release = await acquireFs(signal);
		try {
			const moves: FileMove[] = [];
			const patches: Array<{ id: string; patch: TagValues }> = [];
			const tagAdds = new Map<string, number[]>();
			progress(0, groups.length, "Planning merges");
			for (const group of groups) {
				signal.throwIfAborted();
				const memberIds = database
					.select({ trackId: dupeMembers.trackId })
					.from(dupeMembers)
					.where(eq(dupeMembers.groupId, group.id))
					.all()
					.map((row) => row.trackId);
				const rows = database
					.select()
					.from(tracks)
					.where(inArray(tracks.id, memberIds))
					.all();
				const fileRows = database
					.select()
					.from(files)
					.where(and(inArray(files.trackId, memberIds), eq(files.state, "ok")))
					.all();
				const tagRows = database
					.select()
					.from(trackTags)
					.where(inArray(trackTags.trackId, memberIds))
					.all();
				const factsOf = (row: (typeof rows)[number]): TrackFacts => ({
					id: row.id,
					format: row.format,
					bitrateKbps: row.bitrate ?? 0,
					tags: {
						title: row.title,
						artist: row.artist,
						albumArtist: row.albumArtist,
						album: row.album,
						genre: row.genre,
						year: row.year,
						label: row.label,
						bpm: row.bpm,
						key: row.key,
						isrc: row.isrc,
						comment: row.comment,
						rating: row.rating,
						energy: row.energy,
						remixer: row.remixer,
					},
					hasArt: row.hasArt,
					cueCount: 0,
					playlistIds: [],
					customTagIds: tagRows
						.filter((tag) => tag.trackId === row.id)
						.map((tag) => tag.tagId),
					addedAt: row.addedAt.getTime(),
					files: fileRows
						.filter((f) => f.trackId === row.id)
						.map((f) => f.path),
				});
				const keeper = rows.find((row) => row.id === group.keeperId);
				if (!keeper) continue;
				const others = rows.filter((row) => row.id !== keeper.id);
				const plan = mergePlan(factsOf(keeper), others.map(factsOf));
				if (plan.fieldMerges.length > 0) {
					const patch: TagValues = {};
					for (const merge of plan.fieldMerges)
						patch[merge.field as keyof TagValues] = merge.value;
					patches.push({ id: keeper.id, patch });
				}
				for (const tag of plan.customTags) {
					tagAdds.set(keeper.id, [
						...(tagAdds.get(keeper.id) ?? []),
						Number(tag.tagId),
					]);
				}
				for (const file of fileRows) {
					if (file.trackId === keeper.id || !file.trackId) continue;
					moves.push({
						trackId: file.trackId,
						fileId: file.id,
						from: file.path,
						to: quarantinePath(id, file.path),
						fromState: "ok",
						toState: "quarantined",
						originalPath: file.path,
					});
				}
				result.groups++;
			}

			// Tags first (the keeper's fills and custom tags), then the quarantine.
			const applied = applyPatches(
				patches.map((each) => each),
				info,
				{
					signal,
					after: (tx, chunk, _version, now) => {
						let touched: string[] = [];
						let logged = 0;
						for (const trackId of chunk) {
							const add = tagAdds.get(trackId);
							if (!add) continue;
							const done = applyTagSets(tx, [trackId], add, [], info, now);
							touched = touched.concat(done.touched);
							logged += done.logged;
						}
						return { touched, logged };
					},
				},
			);
			result.filled = applied.fields;
			// A keeper with custom tags to take but nothing to fill still needs its tags.
			const onlyTags = [...tagAdds.keys()].filter(
				(keeperId) => !patches.some((patch) => patch.id === keeperId),
			);
			if (onlyTags.length > 0)
				applyPatches(
					onlyTags.map((keeperId) => ({ id: keeperId, patch: {} })),
					info,
					{
						signal,
						after: (tx, chunk, _version, now) => {
							let touched: string[] = [];
							let logged = 0;
							for (const trackId of chunk) {
								const add = tagAdds.get(trackId);
								if (!add) continue;
								const done = applyTagSets(tx, [trackId], add, [], info, now);
								touched = touched.concat(done.touched);
								logged += done.logged;
							}
							return { touched, logged };
						},
					},
				);
			const moved = await moveTracked(root, moves, info, {
				signal,
				progress: (done) => progress(done, moves.length, "Quarantining copies"),
			});
			result.quarantined = moved.moved;
			result.failed = moved.failed;
			await flushTagWrites(id, { signal });
			for (const group of groups)
				database
					.update(dupeGroups)
					.set({ state: "merged", updatedAt: new Date() })
					.where(eq(dupeGroups.id, group.id))
					.run();
			progress(
				groups.length,
				groups.length,
				`${result.groups} groups merged, ${result.quarantined} files quarantined`,
			);
			return result;
		} finally {
			release();
		}
	},
});
