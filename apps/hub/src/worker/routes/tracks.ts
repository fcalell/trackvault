import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { eq } from "@fcalell/plugin-db/orm";
import type { TagPatch } from "@trackvault/core/tags";
import { batches, changes, tracks as tracksTable } from "../../schema/index.ts";
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
			return { ...row, peaks: hasPeaks(row.id) };
		}),

	// Edits tags in the library and queues the file write. The database is the
	// truth the moment this answers; the tag-write job follows on disk.
	update: procedure({ auth: true, writes: ["tracks"] })
		.input(edit)
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
			if (edits.length === 0) return before;

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

			const { row, version } = database.transaction((tx) => {
				const version = bumpVersion(tx);
				const row = tx
					.update(tracksTable)
					.set({ ...wanted, ...derived, issues, updatedAt: now, version })
					.where(eq(tracksTable.id, input.id))
					.returning()
					.get();
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
				return { row, version };
			});

			const patch: TagPatch = {};
			for (const edit of edits)
				Object.assign(patch, { [edit.field]: edit.after });
			enqueue(tagWrite, { items: [{ trackId: input.id, patch }] });
			notifyChanged([input.id], version);
			return row;
		}),
};
