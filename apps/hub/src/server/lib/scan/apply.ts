import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "@fcalell/plugin-db/orm";
import { changes, files, tracks } from "../../../schema/index.ts";
import { bumpVersion, notifyChanged } from "../../services/library.ts";
import { db, type Tx } from "../db.ts";
import { inserter } from "../raw.ts";
import {
	diffFields,
	FILE_FIELDS,
	type FileFields,
	fieldsFromAnalysis,
	type TrackRow,
} from "../track-fields.ts";
import type { AnalyzeOutcome } from "./pool.ts";
import type { FoundFile } from "./walk.ts";

// The files row as the scan diffs it.
export interface KnownFile {
	id: number;
	trackId: string | null;
	size: number;
	mtimeMs: number;
	inode: number;
	state: string;
}

export const TRANSACTION_SIZE = 1000;
const CHUNK = 500;

export interface ApplyStats {
	added: number;
	updated: number;
	failed: number;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size)
		out.push(items.slice(i, i + size));
	return out;
}

// Whether the file on disk differs from the row the scan holds.
export function isChanged(
	found: FoundFile,
	known: KnownFile | undefined,
): boolean {
	return (
		known === undefined ||
		known.state === "missing" ||
		known.size !== found.size ||
		known.mtimeMs !== found.mtimeMs ||
		known.inode !== found.inode
	);
}

// Recomputes the missing-file flag of tracks whose files came or went: set when
// no file of the track is on disk, cleared when one is. Run inside a transaction.
export function refreshMissing(
	tx: Tx,
	trackIds: readonly string[],
	version: number,
): void {
	for (const ids of chunks(trackIds, CHUNK)) {
		tx.update(tracks)
			.set({
				issues: sql`(${tracks.issues} & ~256) | (CASE WHEN EXISTS (SELECT 1 FROM ${files} WHERE ${files.trackId} = ${tracks.id} AND ${files.state} = 'ok') THEN 0 ELSE 256 END)`,
				version,
				updatedAt: new Date(),
			})
			.where(inArray(tracks.id, ids))
			.run();
	}
}

// Writes one batch of read files in a single transaction: tracks matched by audio
// hash (a moved or renamed file finds its track), new ones inserted, a track's
// tag-driven columns refreshed from its primary file when they changed.
export function applyOutcomes(
	outcomes: readonly AnalyzeOutcome[],
	found: ReadonlyMap<string, FoundFile>,
	known: Map<string, KnownFile>,
	lowBitrateKbps: number,
	batchId: string,
): { stats: ApplyStats; ids: string[]; version: number } {
	const stats: ApplyStats = { added: 0, updated: 0, failed: 0 };
	const touched = new Set<string>();
	const inserted = new Set<string>();
	const orphaned = new Set<string>();
	let version = 0;

	db().transaction((tx) => {
		version = bumpVersion(tx);
		const now = new Date();

		const hashes = [
			...new Set(
				outcomes.flatMap((o) =>
					"analysis" in o ? [o.analysis.audioHash] : [],
				),
			),
		];
		const trackByHash = new Map<string, TrackRow>();
		for (const group of chunks(hashes, CHUNK)) {
			for (const row of tx
				.select()
				.from(tracks)
				.where(inArray(tracks.audioHash, group))
				.all()) {
				trackByHash.set(row.audioHash, row);
			}
		}
		// The first ok file of each matched track is its primary: only it decides the tags.
		const primaryPath = new Map<string, string>();
		const matched = [...trackByHash.values()].map((t) => t.id);
		for (const group of chunks(matched, CHUNK)) {
			const rows = tx
				.select({ trackId: files.trackId, path: files.path })
				.from(files)
				.where(and(inArray(files.trackId, group), eq(files.state, "ok")))
				.orderBy(files.id)
				.all();
			for (const row of rows) {
				if (row.trackId !== null && !primaryPath.has(row.trackId))
					primaryPath.set(row.trackId, row.path);
			}
		}

		for (const outcome of outcomes) {
			const stat = found.get(outcome.path);
			if (!stat) continue;
			const existing = known.get(outcome.path);
			if (existing?.trackId) orphaned.add(existing.trackId);

			if (!("analysis" in outcome)) {
				stats.failed++;
				upsertFile(
					tx,
					existing,
					{
						path: outcome.path,
						trackId: null,
						size: stat.size,
						mtimeMs: stat.mtimeMs,
						inode: stat.inode,
						fileHash: null,
						state: "error",
						error: outcome.error,
						scannedAt: now,
					},
					known,
				);
				continue;
			}

			const analysis = outcome.analysis;
			if (analysis.size === 0) {
				stats.failed++;
				upsertFile(
					tx,
					existing,
					{
						path: outcome.path,
						trackId: null,
						size: 0,
						mtimeMs: stat.mtimeMs,
						inode: stat.inode,
						fileHash: null,
						state: "error",
						error: "empty file",
						scannedAt: now,
					},
					known,
				);
				continue;
			}

			const fields = fieldsFromAnalysis(analysis, lowBitrateKbps);
			let track = trackByHash.get(analysis.audioHash);
			if (!track) {
				track = {
					id: randomUUID(),
					audioHash: analysis.audioHash,
					fingerprint: null,
					genreId: null,
					releaseDate: null,
					loudness: null,
					colour: null,
					...fields,
					addedAt: now,
					updatedAt: now,
					version,
				};
				insertTrack(track);
				trackByHash.set(analysis.audioHash, track);
				inserted.add(track.id);
				primaryPath.set(track.id, outcome.path);
				stats.added++;
				touched.add(track.id);
			} else {
				const primary = primaryPath.get(track.id);
				if (primary === undefined || primary === outcome.path) {
					primaryPath.set(track.id, outcome.path);
					const diff = diffFields(track as FileFields, fields, FILE_FIELDS);
					if (diff.length > 0) {
						// Derived columns follow the tags and are no change of their own.
						const logged = diff.filter((d) => !DERIVED.has(d.field));
						if (logged.length > 0) {
							tx.insert(changes)
								.values(
									logged.map((d) => ({
										entity: "track",
										entityId: (track as TrackRow).id,
										field: d.field,
										before: d.before ?? null,
										after: d.after ?? null,
										origin: "scan" as const,
										batchId,
										at: now,
									})),
								)
								.run();
						}
						track = tx
							.update(tracks)
							.set({ ...fields, updatedAt: now, version })
							.where(eq(tracks.id, track.id))
							.returning()
							.get() as TrackRow;
						trackByHash.set(analysis.audioHash, track);
						stats.updated++;
						touched.add(track.id);
					}
				}
			}
			if (existing?.trackId !== track.id) touched.add(track.id);
			upsertFile(
				tx,
				existing,
				{
					path: outcome.path,
					trackId: track.id,
					size: stat.size,
					mtimeMs: stat.mtimeMs,
					inode: stat.inode,
					fileHash: analysis.fileHash,
					state: "ok",
					error: null,
					scannedAt: now,
				},
				known,
			);
		}

		// Tracks that gained or lost a file get their missing flag re-decided.
		// (A track inserted with its file needs none.)
		const reflag = new Set<string>([...orphaned, ...touched]);
		for (const id of inserted) reflag.delete(id);
		if (reflag.size > 0) refreshMissing(tx, [...reflag], version);
		for (const id of orphaned) touched.add(id);
	});

	return { stats, ids: [...touched], version };
}

// Fields that follow from the title, artist, album and label.
const insertTrack = inserter(tracks);
const insertFile = inserter(files);

const DERIVED = new Set([
	"artists",
	"mixName",
	"blockKey",
	"searchText",
	"issues",
]);

type FileValues = typeof files.$inferInsert;

function upsertFile(
	tx: Tx,
	existing: KnownFile | undefined,
	values: FileValues,
	known: Map<string, KnownFile>,
): void {
	let id: number;
	if (existing) {
		tx.update(files).set(values).where(eq(files.id, existing.id)).run();
		id = existing.id;
	} else {
		id = insertFile(values);
	}
	known.set(values.path, {
		id,
		trackId: values.trackId ?? null,
		size: values.size,
		mtimeMs: values.mtimeMs,
		inode: values.inode,
		state: values.state ?? "ok",
	});
}

// Marks files that were not found on disk, then re-decides their tracks' flags.
export function markMissing(rows: readonly KnownFile[]): {
	ids: string[];
	version: number;
} {
	const ids = new Set<string>();
	let version = 0;
	for (const group of chunks(rows, TRANSACTION_SIZE)) {
		db().transaction((tx) => {
			version = bumpVersion(tx);
			tx.update(files)
				.set({ state: "missing", scannedAt: new Date() })
				.where(
					inArray(
						files.id,
						group.map((r) => r.id),
					),
				)
				.run();
			const trackIds = group.flatMap((r) => (r.trackId ? [r.trackId] : []));
			refreshMissing(tx, trackIds, version);
			for (const id of trackIds) ids.add(id);
		});
		notifyChanged(
			group.flatMap((r) => (r.trackId ? [r.trackId] : [])),
			version,
		);
	}
	return { ids: [...ids], version };
}
