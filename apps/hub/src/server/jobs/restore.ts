import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import { files } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { type FileMove, moveTracked } from "../lib/file-ops.ts";
import { acquireFs } from "../lib/fs-lock.ts";
import { defineJob } from "../lib/job.ts";
import { freeName } from "../lib/quarantine.ts";
import { readSettings } from "../lib/settings.ts";
import { removeEmptyFolders } from "./organise.ts";

export interface RestorePayload {
	// Quarantined files to bring back.
	fileIds: number[];
}

export interface RestoreResult {
	moved: number;
	failed: number;
	errors: string[];
}

// Puts quarantined files back where they lay (next to whatever is there now, with a
// number, if the place was taken since) and returns their tracks to the library.
export default defineJob<RestorePayload, RestoreResult>({
	kind: "restore",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const rows = db()
			.select()
			.from(files)
			.where(
				and(inArray(files.id, payload.fileIds), eq(files.state, "quarantined")),
			)
			.all();
		const release = await acquireFs(signal);
		try {
			const taken = new Set<string>();
			const moves: FileMove[] = [];
			for (const row of rows) {
				if (!row.trackId || !row.originalPath) continue;
				const to = await freeName(root, row.originalPath, (path) =>
					taken.has(path),
				);
				taken.add(to.toLowerCase());
				moves.push({
					trackId: row.trackId,
					fileId: row.id,
					from: row.path,
					to,
					fromState: "quarantined",
					toState: "ok",
					originalPath: null,
				});
			}
			progress(0, moves.length, "Restoring files");
			const moved = await moveTracked(
				root,
				moves,
				{ batchId: id, origin: "ui", label: "Restore from quarantine" },
				{
					signal,
					progress: (done) => progress(done, moves.length, "Restoring files"),
				},
			);
			await removeEmptyFolders(
				root,
				moves.map((move) => move.from),
			);
			progress(moved.moved, moves.length, `${moved.moved} restored`);
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
