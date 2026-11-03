import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import { files } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { type FileMove, moveTracked } from "../lib/file-ops.ts";
import { acquireFs } from "../lib/fs-lock.ts";
import { defineJob } from "../lib/job.ts";
import { quarantinePath } from "../lib/quarantine.ts";
import { type Selection, selectedIds } from "../lib/selection.ts";
import { readSettings } from "../lib/settings.ts";
import { removeEmptyFolders } from "./organise.ts";

export interface QuarantinePayload {
	// Quarantine every file of these tracks...
	tracks?: Selection;
	// ...or just these files (a merge keeps the keeper's).
	fileIds?: number[];
	label?: string;
}

export interface QuarantineResult {
	moved: number;
	failed: number;
	errors: string[];
}

const GROUP = 400;

// Moves files out of the library into `.quarantine/<batch>/`, keeping their folders,
// and hides their tracks until they are restored. Nothing is deleted: the purge
// does that, later.
export default defineJob<QuarantinePayload, QuarantineResult>({
	kind: "quarantine",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const rows: Array<{ id: number; trackId: string | null; path: string }> =
			[];
		if (payload.fileIds) {
			for (let i = 0; i < payload.fileIds.length; i += GROUP)
				rows.push(
					...db()
						.select({ id: files.id, trackId: files.trackId, path: files.path })
						.from(files)
						.where(
							and(
								inArray(files.id, payload.fileIds.slice(i, i + GROUP)),
								eq(files.state, "ok"),
							),
						)
						.all(),
				);
		} else if (payload.tracks) {
			const ids = selectedIds(payload.tracks);
			for (let i = 0; i < ids.length; i += GROUP)
				rows.push(
					...db()
						.select({ id: files.id, trackId: files.trackId, path: files.path })
						.from(files)
						.where(
							and(
								inArray(files.trackId, ids.slice(i, i + GROUP)),
								eq(files.state, "ok"),
							),
						)
						.all(),
				);
		}
		const moves: FileMove[] = rows.flatMap((row) =>
			row.trackId
				? [
						{
							trackId: row.trackId,
							fileId: row.id,
							from: row.path,
							to: quarantinePath(id, row.path),
							fromState: "ok" as const,
							toState: "quarantined" as const,
							originalPath: row.path,
						},
					]
				: [],
		);
		progress(0, moves.length, "Moving files to the quarantine");
		const release = await acquireFs(signal);
		try {
			const moved = await moveTracked(
				root,
				moves,
				{ batchId: id, origin: "ui", label: payload.label ?? "Quarantine" },
				{
					signal,
					progress: (done) =>
						progress(done, moves.length, "Moving files to the quarantine"),
				},
			);
			await removeEmptyFolders(
				root,
				moves.map((move) => move.from),
			);
			progress(
				moved.moved,
				moves.length,
				moved.failed > 0
					? `${moved.moved} quarantined, ${moved.failed} failed`
					: `${moved.moved} quarantined`,
			);
			return {
				moved: moved.moved,
				failed: moved.failed,
				errors: moved.errors,
			};
		} finally {
			release();
		}
	},
});
