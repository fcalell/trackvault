import { ISSUE } from "@trackvault/core/issues";
import { safeJoin } from "@trackvault/core/paths";
import { changes, type files } from "../../schema/index.ts";
import { bumpVersion, notifyChanged } from "../services/library.ts";
import { type BatchInfo, ensureBatch } from "./changes.ts";
import { db } from "./db.ts";
import { moveFile, pathExists } from "./quarantine.ts";
import { inserter, statement } from "./raw.ts";

export type FileState = (typeof files.$inferSelect)["state"];

// One file's move: where it is, where it goes and the state it ends in.
export interface FileMove {
	trackId: string;
	fileId: number;
	from: string;
	// Where the file is on disk now when that is not `from` (a cycle's temporary name).
	diskFrom?: string | undefined;
	to: string;
	fromState: FileState;
	toState: FileState;
	// A quarantined file remembers where it lay (null clears it on a restore).
	originalPath: string | null;
}

export interface FileValue {
	id: number;
	path: string;
	state: FileState;
}

const insertChange = inserter(changes);
const CHUNK = 200;

export interface MoveResult {
	moved: number;
	failed: number;
	errors: string[];
	ids: string[];
}

// Moves files on disk and records each move: the rename, then the `files` row, the
// flags and the change log together in one transaction per 200. A move whose source
// is gone but whose target is there is taken as done (a job resumed after a stop).
export async function moveTracked(
	root: string,
	moves: readonly FileMove[],
	info: BatchInfo,
	options: {
		signal?: AbortSignal;
		progress?: (done: number) => void;
	} = {},
): Promise<MoveResult> {
	const result: MoveResult = { moved: 0, failed: 0, errors: [], ids: [] };
	let handled = 0;
	for (let i = 0; i < moves.length; i += CHUNK) {
		options.signal?.throwIfAborted();
		const group = moves.slice(i, i + CHUNK);
		const done: FileMove[] = [];
		for (const move of group) {
			try {
				const there = move.diskFrom ?? move.from;
				const source = safeJoin(root, there);
				if (
					!(await pathExists(source)) &&
					(await pathExists(safeJoin(root, move.to)))
				) {
					done.push(move);
					continue;
				}
				await moveFile(root, there, move.to);
				done.push(move);
			} catch (error) {
				result.failed++;
				if (result.errors.length < 20)
					result.errors.push(
						`${move.from}: ${error instanceof Error ? error.message : String(error)}`,
					);
			}
		}
		if (done.length > 0) {
			let version = 0;
			db().transaction((tx) => {
				version = bumpVersion(tx);
				const now = new Date();
				const update = statement(
					"UPDATE files SET path = @path, state = @state, original_path = @original, quarantined_at = @quarantinedAt, error = NULL WHERE id = @id",
				);
				for (const move of done) {
					update.run({
						id: move.fileId,
						path: move.to,
						state: move.toState,
						original: move.originalPath,
						quarantinedAt:
							move.toState === "quarantined" ? now.getTime() : null,
					});
					insertChange({
						entity: "track",
						entityId: move.trackId,
						field: "file",
						before: {
							id: move.fileId,
							path: move.from,
							state: move.fromState,
						} satisfies FileValue,
						after: {
							id: move.fileId,
							path: move.to,
							state: move.toState,
						} satisfies FileValue,
						origin: info.origin,
						batchId: info.batchId,
						at: now,
					});
				}
				const trackIds = [...new Set(done.map((move) => move.trackId))];
				for (const id of trackIds)
					statement(
						`UPDATE tracks SET issues = (issues & ~${ISSUE.missingFile} & ~${ISSUE.quarantined}) | (CASE
		WHEN EXISTS (SELECT 1 FROM files WHERE track_id = @id AND state = 'ok') THEN 0
		WHEN EXISTS (SELECT 1 FROM files WHERE track_id = @id AND state = 'quarantined') THEN ${ISSUE.quarantined}
		ELSE ${ISSUE.missingFile} END), version = @version, updated_at = @now WHERE id = @id`,
					).run({ id, version, now: now.getTime() });
				ensureBatch(tx, info, done.length, now);
				result.ids.push(...trackIds);
			});
			result.moved += done.length;
			notifyChanged(
				done.map((move) => move.trackId),
				version,
			);
		}
		handled += group.length;
		options.progress?.(handled);
	}
	return result;
}
