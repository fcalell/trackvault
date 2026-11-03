import { rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import { sql } from "@fcalell/plugin-db/orm";
import {
	type OrganizeTrack,
	orderMoves,
	parseTemplate,
	planMoves,
} from "@trackvault/core/organize";
import { safeJoin } from "@trackvault/core/paths";
import { files } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { type FileMove, moveTracked } from "../lib/file-ops.ts";
import { acquireFs } from "../lib/fs-lock.ts";
import { defineJob } from "../lib/job.ts";
import { PreviewWriter } from "../lib/previews.ts";
import { moveFile, QUARANTINE_DIR } from "../lib/quarantine.ts";
import {
	allTrackIds,
	eachTrack,
	labelOf,
	primaryFiles,
	type Selection,
	selectedIds,
} from "../lib/selection.ts";
import { readSettings } from "../lib/settings.ts";

export interface OrganisePayload {
	mode: "preview" | "apply";
	template: string;
	tracks?: Selection;
}

export interface OrganiseResult {
	mode: "preview" | "apply";
	template: string;
	moves: number;
	collisions: number;
	unchanged: number;
	skipped: number;
	moved?: number;
	failed?: number;
	errors?: string[];
}

const TEMP = /\.tv-move-\d+$/;

// Plans where each file should live under a template (core/organize) and, on
// apply, moves them: in an order a file system can run (a cycle goes through a
// temporary name), each move recorded with its file row, so the scanner finds the
// files where the database says they are and an undo moves them back.
export default defineJob<OrganisePayload, OrganiseResult>({
	kind: "organise",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		parseTemplate(payload.template);
		const ids = payload.tracks ? selectedIds(payload.tracks) : allTrackIds();
		const primary = primaryFiles(ids);
		progress(0, ids.length, "Planning");

		const subjects: OrganizeTrack[] = [];
		const labels = new Map<string, string>();
		let read = 0;
		for (const row of eachTrack(ids)) {
			signal.throwIfAborted();
			const file = primary.get(row.id);
			if (!file) continue;
			subjects.push({
				id: row.id,
				path: file.path,
				title: row.title,
				artist: row.artist,
				albumArtist: row.albumArtist,
				album: row.album,
				genre: row.genre,
				year: row.year,
				bpm: row.bpm,
				key: row.key,
				label: row.label,
				remixer: row.remixer,
				mixName: row.mixName,
			});
			labels.set(row.id, labelOf(row));
			if (++read % 2000 === 0) progress(read, ids.length, "Planning");
		}

		// Paths no track of the plan owns (the other files of the library) are taken.
		const planned = new Set(subjects.map((subject) => subject.path));
		const reserved = db()
			.select({ path: files.path })
			.from(files)
			.where(sql`${files.state} != 'quarantined'`)
			.all()
			.map((row) => row.path)
			.filter((path) => !planned.has(path));
		const plan = planMoves(subjects, payload.template, root, { reserved });

		const result: OrganiseResult = {
			mode: payload.mode,
			template: payload.template,
			moves: plan.moves.length,
			collisions: plan.collisions.length,
			unchanged: plan.unchanged,
			skipped: plan.skipped.length,
		};

		if (payload.mode === "preview") {
			const writer = new PreviewWriter(id, "organise");
			const collided = new Set(plan.collisions.map((each) => each.id));
			for (const move of plan.moves)
				writer.add({
					trackId: String(move.id),
					label: labels.get(String(move.id)) ?? null,
					field: collided.has(move.id) ? "path (renamed)" : "path",
					before: move.from,
					after: move.to,
				});
			writer.flush();
			progress(
				plan.moves.length,
				plan.moves.length,
				`${plan.moves.length} moves, ${plan.collisions.length} collisions`,
			);
			return result;
		}

		const release = await acquireFs(signal);
		try {
			const fileOf = new Map<string, number>();
			for (const move of plan.moves) {
				const file = primary.get(String(move.id));
				if (file) fileOf.set(String(move.id), file.id);
			}
			const original = new Map(
				plan.moves.map((move) => [String(move.id), move.from]),
			);
			const temporary = new Map<string, string>();
			const queue: FileMove[] = [];
			for (const step of orderMoves(plan.moves)) {
				signal.throwIfAborted();
				const trackId = String(step.id);
				if (TEMP.test(step.to)) {
					await moveFile(root, step.from, step.to);
					temporary.set(trackId, step.to);
					continue;
				}
				const fileId = fileOf.get(trackId);
				if (fileId === undefined) continue;
				queue.push({
					trackId,
					fileId,
					from: original.get(trackId) ?? step.from,
					diskFrom: temporary.get(trackId),
					to: step.to,
					fromState: "ok",
					toState: "ok",
					originalPath: null,
				});
			}
			const moved = await moveTracked(
				root,
				queue,
				{ batchId: id, origin: "ui", label: "Organise" },
				{
					signal,
					progress: (done) => progress(done, queue.length, "Moving files"),
				},
			);
			result.moved = moved.moved;
			result.failed = moved.failed;
			result.errors = moved.errors;
			await removeEmptyFolders(
				root,
				plan.moves.map((move) => move.from),
			);
			progress(
				moved.moved,
				queue.length,
				moved.failed > 0
					? `${moved.moved} moved, ${moved.failed} failed`
					: `${moved.moved} moved`,
			);
			return result;
		} finally {
			release();
		}
	},
});

// Folders a move emptied, deepest first; `rmdir` leaves any that still hold something.
export async function removeEmptyFolders(
	root: string,
	paths: readonly string[],
): Promise<void> {
	const folders = new Set<string>();
	for (const path of paths) {
		let folder = dirname(path);
		while (folder !== "." && folder !== "" && !folders.has(folder)) {
			folders.add(folder);
			folder = dirname(folder);
		}
	}
	const ordered = [...folders]
		.filter((folder) => folder !== QUARANTINE_DIR)
		.sort((a, b) => b.length - a.length);
	for (const folder of ordered) {
		try {
			await rmdir(safeJoin(root, folder));
		} catch {}
	}
}
