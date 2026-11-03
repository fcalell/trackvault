import { access } from "node:fs/promises";
import { eq, like, or } from "@fcalell/plugin-db/orm";
import { safeJoin } from "@trackvault/core/paths";
import { files } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import {
	applyOutcomes,
	isChanged,
	type KnownFile,
	markMissing,
	TRANSACTION_SIZE,
} from "../lib/scan/apply.ts";
import {
	type AnalyzeItem,
	type AnalyzeOutcome,
	analyzeAll,
} from "../lib/scan/pool.ts";
import { type FoundFile, walk } from "../lib/scan/walk.ts";
import { readSettings } from "../lib/settings.ts";
import { enqueue } from "../services/jobs.ts";
import { notifyChanged } from "../services/library.ts";
import peaks from "./peaks.ts";

export interface ScanPayload {
	// Library-relative files or folders to look at; absent scans the whole library.
	paths?: string[];
}

export interface ScanResult {
	seen: number;
	changed: number;
	added: number;
	updated: number;
	failed: number;
	missing: number;
	tookMs: number;
}

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, "\\$&");

// The files rows under a scope ("" is all of them), keyed by path.
function knownUnder(scopes: readonly string[]): Map<string, KnownFile> {
	const map = new Map<string, KnownFile>();
	const columns = {
		id: files.id,
		path: files.path,
		trackId: files.trackId,
		size: files.size,
		mtimeMs: files.mtimeMs,
		inode: files.inode,
		state: files.state,
	};
	const database = db();
	const rows =
		scopes.length === 1 && scopes[0] === ""
			? database.select(columns).from(files).all()
			: scopes.flatMap((scope) =>
					database
						.select(columns)
						.from(files)
						.where(
							or(
								eq(files.path, scope),
								like(files.path, `${escapeLike(scope)}/%`),
							),
						)
						.all(),
				);
	for (const { path, ...row } of rows) map.set(path, row);
	return map;
}

// Stat-only diff of the disk against `files`, then a read of what changed on a
// worker pool, written in transactions of 1k files.
export default defineJob<ScanPayload, ScanResult>({
	kind: "scan",
	concurrency: 1,
	async run({ id: batchId, payload, signal, progress }) {
		const started = Date.now();
		const settings = readSettings();
		const root = settings.libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		await access(root).catch(() => {
			throw new Error(`The library folder cannot be read: ${root}`);
		});
		const scopes =
			payload.paths && payload.paths.length > 0
				? [...new Set(payload.paths)]
				: [""];
		for (const scope of scopes) if (scope !== "") safeJoin(root, scope);

		progress(0, 0, "Looking for files");
		const known = knownUnder(scopes);
		const seen = new Map<string, FoundFile>();
		const changed: FoundFile[] = [];
		const onFound = (file: FoundFile): void => {
			seen.set(file.path, file);
			if (isChanged(file, known.get(file.path))) changed.push(file);
		};
		for (const scope of scopes) await walk(root, scope, onFound, signal);

		const result: ScanResult = {
			seen: seen.size,
			changed: changed.length,
			added: 0,
			updated: 0,
			failed: 0,
			missing: 0,
			tookMs: 0,
		};

		const total = changed.length;
		let done = 0;
		let buffer: AnalyzeOutcome[] = [];
		const flush = (): void => {
			if (buffer.length === 0) return;
			const outcomes = buffer;
			buffer = [];
			const applied = applyOutcomes(
				outcomes,
				seen,
				known,
				settings.lowBitrateThreshold,
				batchId,
			);
			result.added += applied.stats.added;
			result.updated += applied.stats.updated;
			result.failed += applied.stats.failed;
			notifyChanged(applied.ids, applied.version);
			done += outcomes.length;
			progress(done, total, "Reading files");
		};

		progress(0, total, total === 0 ? "Nothing changed" : "Reading files");
		const items: AnalyzeItem[] = changed.map((file) => ({
			path: file.path,
			abs: safeJoin(root, file.path),
		}));
		await analyzeAll(
			items,
			(outcomes) => {
				buffer.push(...outcomes);
				progress(done + buffer.length, total);
				if (buffer.length >= TRANSACTION_SIZE) flush();
			},
			signal,
		);
		flush();
		signal.throwIfAborted();

		// Whatever the scope held in the database and the walk did not find is gone.
		const gone = [...known.entries()].filter(
			([path, row]) => !seen.has(path) && row.state !== "missing",
		);
		if (gone.length > 0) {
			progress(done, total, "Marking missing files");
			markMissing(gone.map(([, row]) => row));
		}
		result.missing = gone.length;
		// New tracks get their waveforms, at low priority and in one job.
		if (result.added > 0) enqueue(peaks, {}, { reuse: () => true });
		result.tookMs = Date.now() - started;
		const summary = [
			result.added > 0 && `${result.added} added`,
			result.updated > 0 && `${result.updated} updated`,
			result.missing > 0 && `${result.missing} missing`,
			result.failed > 0 && `${result.failed} unreadable`,
		].filter(Boolean);
		progress(
			total,
			total,
			summary.length > 0 ? summary.join(", ") : "Nothing changed",
		);
		return result;
	},
});
