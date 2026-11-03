import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { eq } from "@fcalell/plugin-db/orm";
import type { TagPatch } from "@trackvault/core/tags";
import { changes, tracks as tracksTable } from "../../schema/index.ts";
import tagWrite from "../../server/jobs/tag-write.ts";
import { db } from "../../server/lib/db.ts";
import { readSettings } from "../../server/lib/settings.ts";
import {
	derivedText,
	diffFields,
	issuesAfterEdit,
	type TrackRow,
} from "../../server/lib/track-fields.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { bumpVersion, notifyChanged } from "../../server/services/library.ts";

const text = z
	.string()
	.nullable()
	.transform((value) => {
		const trimmed = value?.trim();
		return trimmed ? trimmed : null;
	});

// The fields an edit may carry. A key left out is left alone; null clears it.
const edit = z.object({
	id: z.string(),
	title: text.optional(),
	artist: text.optional(),
	albumArtist: text.optional(),
	album: text.optional(),
	remixer: text.optional(),
	label: text.optional(),
	genre: text.optional(),
	isrc: text.optional(),
	key: text.optional(),
	comment: text.optional(),
	year: z.number().int().min(1000).max(9999).nullable().optional(),
	bpm: z.number().min(1).max(999).nullable().optional(),
	energy: z.number().int().min(1).max(10).nullable().optional(),
	rating: z.number().int().min(0).max(5).optional(),
});

// The edit's fields that live in the file's tags: what the tag-write job carries.
const TAG_KEYS = [
	"title",
	"artist",
	"albumArtist",
	"album",
	"remixer",
	"label",
	"genre",
	"isrc",
	"key",
	"comment",
	"year",
	"bpm",
	"energy",
	"rating",
] as const satisfies ReadonlyArray<keyof TagPatch & keyof TrackRow>;

export const tracks = {
	// TODO(stack window pagination): `tracks.list`, the library's windowed read
	// (`paginated: "window"`, a `sort` over the indexed columns, search and facet
	// filters in the input, one `where` shared with `selector` for select-all). It
	// lands with the library screen; there is no stopgap listing here.

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
			return row;
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
