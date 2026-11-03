import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { asc, count, desc, eq, inArray } from "@fcalell/plugin-db/orm";
import { batches, changes, playlists, tracks } from "../../schema/index.ts";
import undo from "../../server/jobs/undo.ts";
import { db } from "../../server/lib/db.ts";
import type { FileValue } from "../../server/lib/file-ops.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const batchView = z.object({
	id: z.string(),
	origin: z.string(),
	label: z.string(),
	count: z.number(),
	at: z.date(),
	undone: z.boolean(),
	// A scan only reads the disk; its changes are not undone.
	undoable: z.boolean(),
});

// A value of the change log as a short phrase: a file is its path (and the state
// when it is the quarantine), a list its items.
export function describe(
	field: string,
	value: unknown,
	titles?: ReadonlyMap<string, string>,
): string | null {
	if (value === null || value === undefined || value === "") return null;
	if (field === "node") {
		const node = value as { kind: string; name: string };
		return `${node.name} (${node.kind})`;
	}
	if (field === "member") {
		const member = value as { trackId: string; position: number };
		return titles?.get(member.trackId) ?? member.trackId;
	}
	if (field === "rule") return "Rule";
	if (field === "cues")
		return Array.isArray(value) ? `${value.length} cues` : null;
	if (field === "file") {
		const file = value as FileValue;
		return file.state === "ok" ? file.path : `${file.path} (${file.state})`;
	}
	if (Array.isArray(value)) return value.join(", ") || null;
	return String(value);
}

const asView = (row: typeof batches.$inferSelect) => ({
	id: row.id,
	origin: row.origin,
	label: row.label,
	count: row.count,
	at: row.at,
	undone: row.undoneBy !== null,
	undoable: row.origin !== "scan" && row.undoneBy === null,
});

export const history = {
	// The batches, newest first, windowed.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["batches"],
	})
		.input(z.object({}))
		.query(({ input }) => {
			const database = db();
			const data = database
				.select()
				.from(batches)
				.orderBy(desc(batches.at), desc(batches.id))
				.limit(input.limit)
				.offset(input.offset)
				.all()
				.map(asView);
			const total = database.select({ n: count() }).from(batches).get()?.n ?? 0;
			return { data, total, offset: input.offset };
		}),

	get: procedure({ auth: true, reads: ["batches"] })
		.input(z.object({ id: z.string() }))
		.output(batchView)
		.query(({ input }) => {
			const row = db()
				.select()
				.from(batches)
				.where(eq(batches.id, input.id))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			return asView(row);
		}),

	// The fields one batch changed, as before and after.
	changes: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["changes"],
	})
		.input(z.object({ batchId: z.string() }))
		.query(({ input }) => {
			const database = db();
			const rows = database
				.select({
					seq: changes.seq,
					entity: changes.entity,
					entityId: changes.entityId,
					field: changes.field,
					before: changes.before,
					after: changes.after,
					title: tracks.title,
					artist: tracks.artist,
					playlist: playlists.name,
				})
				.from(changes)
				.leftJoin(tracks, eq(tracks.id, changes.entityId))
				.leftJoin(playlists, eq(playlists.id, changes.entityId))
				.where(eq(changes.batchId, input.batchId))
				.orderBy(asc(changes.seq))
				.limit(input.limit)
				.offset(input.offset)
				.all();
			// A playlist's member changes name the track.
			const memberIds = rows.flatMap((row) =>
				row.field === "member"
					? [row.before, row.after].flatMap((value) =>
							value ? [(value as { trackId: string }).trackId] : [],
						)
					: [],
			);
			const titles = new Map(
				memberIds.length === 0
					? []
					: database
							.select({
								id: tracks.id,
								title: tracks.title,
								artist: tracks.artist,
							})
							.from(tracks)
							.where(inArray(tracks.id, memberIds))
							.all()
							.map((row) => [
								row.id,
								[row.artist, row.title].filter(Boolean).join(" - "),
							]),
			);
			const data = rows.map((row) => ({
				id: String(row.seq),
				trackId: row.entityId,
				label:
					row.entity === "playlist"
						? (row.playlist ?? "Deleted playlist")
						: row.title
							? [row.artist, row.title].filter(Boolean).join(" - ")
							: row.entityId,
				field: row.field,
				before: describe(row.field, row.before, titles),
				after: describe(row.field, row.after, titles),
			}));
			const total =
				database
					.select({ n: count() })
					.from(changes)
					.where(eq(changes.batchId, input.batchId))
					.get()?.n ?? 0;
			return { data, total, offset: input.offset };
		}),

	// Undo a batch: a job that puts each field back unless it changed since.
	undo: procedure({
		auth: true,
		writes: ["tracks", "files", "batches", "jobs"],
	})
		.input(z.object({ id: z.string() }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			const row = db()
				.select()
				.from(batches)
				.where(eq(batches.id, input.id))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			if (!asView(row).undoable)
				throw new ApiError("BAD_REQUEST", {
					message:
						row.origin === "scan"
							? "A scan is not undone"
							: "That batch was already undone",
				});
			return enqueue(undo, { batchId: input.id });
		}),
};
