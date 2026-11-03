import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { and, desc, eq, inArray, ne } from "@fcalell/plugin-db/orm";
import type { TagPatch } from "@trackvault/core/tags";
import {
	analysisResults,
	batches,
	changes,
	dupeGroups,
	dupeMembers,
	tracks as tracksTable,
} from "../../schema/index.ts";
import tagWrite from "../../server/jobs/tag-write.ts";
import { db } from "../../server/lib/db.ts";
import {
	facetsOf,
	libraryQuery,
	listPage,
	SORT_COLUMNS,
} from "../../server/lib/library-query.ts";
import { hasPeaks } from "../../server/lib/peaks.ts";
import { readSettings } from "../../server/lib/settings.ts";
import {
	derivedText,
	diffFields,
	issuesAfterEdit,
	TAG_KEYS,
	type TrackRow,
} from "../../server/lib/track-fields.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { bumpVersion, notifyChanged } from "../../server/services/library.ts";
import { tagPatch } from "../../shared/patch.ts";
import { describe } from "./history.ts";

const pct = (v: number | null): number | null =>
	v === null ? null : Math.round(v * 100);

const edit = tagPatch.extend({ id: z.string() });

export const tracks = {
	// The library's windowed read: search, facet and issue filters and the sort go
	// into the input, SQLite does the work (schema: the indexes), and a page holds
	// only the columns the table draws.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		sort: SORT_COLUMNS,
		reads: ["tracks"],
	})
		.input(libraryQuery)
		.query(({ input }) => {
			const version = readSettings().libraryVersion;
			return listPage(db(), input, version);
		}),

	// Counts for the filter pickers, cached by library version.
	facets: procedure({ auth: true, reads: ["tracks"] }).query(() =>
		facetsOf(db(), readSettings().libraryVersion),
	),

	// The full record of one track.
	get: procedure({ auth: true, reads: ["tracks"] })
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			const row = db()
				.select()
				.from(tracksTable)
				.where(eq(tracksTable.id, input.id))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			// `peaks`: the waveform is drawn (`/media/<id>/peaks` answers).
			const analysis = db()
				.select()
				.from(analysisResults)
				.where(eq(analysisResults.trackId, row.id))
				.get();
			return {
				...row,
				peaks: hasPeaks(row.id),
				// What the audio analysis measured, with how sure it is (percent).
				analysis: analysis
					? {
							bpm: analysis.bpm,
							bpmConfidence: pct(analysis.bpmConfidence),
							key: analysis.key,
							keyConfidence: pct(analysis.keyConfidence),
							energy: analysis.energy,
							energyConfidence: pct(analysis.energyConfidence),
							lufs: analysis.lufs,
							loudnessRange: analysis.loudnessRange,
							note: analysis.note,
							analysedAt: analysis.analysedAt,
						}
					: null,
			};
		}),

	// The other tracks of the open duplicate groups this track is in, each with why it was
	// grouped.
	duplicates: procedure({
		auth: true,
		reads: ["dupeGroups", "dupeMembers", "tracks"],
	})
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			const database = db();
			const groups = database
				.select({
					id: dupeGroups.id,
					reason: dupeGroups.reason,
					confidence: dupeGroups.confidence,
				})
				.from(dupeMembers)
				.innerJoin(dupeGroups, eq(dupeGroups.id, dupeMembers.groupId))
				.where(
					and(eq(dupeMembers.trackId, input.id), eq(dupeGroups.state, "open")),
				)
				.all();
			if (groups.length === 0) return [];
			const why = new Map(groups.map((group) => [group.id, group]));
			return database
				.select({
					groupId: dupeMembers.groupId,
					id: tracksTable.id,
					title: tracksTable.title,
					mixName: tracksTable.mixName,
					artist: tracksTable.artist,
					format: tracksTable.format,
					bitrate: tracksTable.bitrate,
				})
				.from(dupeMembers)
				.innerJoin(tracksTable, eq(tracksTable.id, dupeMembers.trackId))
				.where(
					and(
						inArray(dupeMembers.groupId, [...why.keys()]),
						ne(dupeMembers.trackId, input.id),
					),
				)
				.all()
				.map(({ groupId, ...track }) => ({
					...track,
					reason: why.get(groupId)?.reason ?? "exact",
					confidence: pct(why.get(groupId)?.confidence ?? 0) ?? 0,
				}));
		}),

	// What was changed on this track, newest first: the log's rows with the batch each
	// belongs to (undone in History).
	history: procedure({ auth: true, reads: ["changes", "batches"] })
		.input(z.object({ id: z.string() }))
		.query(({ input }) =>
			db()
				.select({
					seq: changes.seq,
					field: changes.field,
					before: changes.before,
					after: changes.after,
					at: changes.at,
					batchId: changes.batchId,
					label: batches.label,
					undone: batches.undoneBy,
				})
				.from(changes)
				.innerJoin(batches, eq(batches.id, changes.batchId))
				.where(and(eq(changes.entity, "track"), eq(changes.entityId, input.id)))
				.orderBy(desc(changes.seq))
				.limit(50)
				.all()
				.map(({ before, after, field, undone, ...row }) => ({
					...row,
					field,
					before: describe(field, before),
					after: describe(field, after),
					undone: undone !== null,
				})),
		),

	// Edits tags in the library and queues the file write. The database is the
	// truth the moment this answers; the tag-write job follows on disk.
	// The batch the edit wrote, or none when every field was already as given.
	update: procedure({ auth: true, writes: ["tracks"] })
		.input(edit)
		.output(z.object({ batch: z.string().nullable() }))
		.mutation(({ input }) => {
			const database = db();
			const before = database
				.select()
				.from(tracksTable)
				.where(eq(tracksTable.id, input.id))
				.get();
			if (!before) throw new ApiError("NOT_FOUND");

			const wanted: Partial<Pick<TrackRow, (typeof TAG_KEYS)[number]>> = {};
			for (const key of TAG_KEYS) {
				const value = input[key];
				if (value !== undefined) Object.assign(wanted, { [key]: value });
			}
			const edits = diffFields(before, { ...before, ...wanted }, TAG_KEYS);
			if (edits.length === 0) return { batch: null };

			const merged = { ...before, ...wanted } as TrackRow;
			const derived = derivedText({
				title: merged.title,
				artist: merged.artist,
				album: merged.album,
				label: merged.label,
				remixer: wanted.remixer !== undefined ? merged.remixer : before.remixer,
			});
			const next = { ...merged, ...derived };
			const issues = issuesAfterEdit(next, readSettings().lowBitrateThreshold);
			const batchId = randomUUID();
			const now = new Date();

			const version = database.transaction((tx) => {
				const version = bumpVersion(tx);
				tx.update(tracksTable)
					.set({ ...wanted, ...derived, issues, updatedAt: now, version })
					.where(eq(tracksTable.id, input.id))
					.run();
				tx.insert(batches)
					.values({
						id: batchId,
						origin: "ui",
						label: "Edit tags",
						count: edits.length,
						at: now,
					})
					.run();
				tx.insert(changes)
					.values(
						edits.map((edit) => ({
							entity: "track",
							entityId: input.id,
							field: edit.field,
							before: edit.before ?? null,
							after: edit.after ?? null,
							origin: "ui" as const,
							batchId,
							at: now,
						})),
					)
					.run();
				return version;
			});

			const patch: TagPatch = {};
			for (const edit of edits)
				Object.assign(patch, { [edit.field]: edit.after });
			enqueue(tagWrite, { items: [{ trackId: input.id, patch }] });
			notifyChanged([input.id], version);
			return { batch: batchId };
		}),
};
