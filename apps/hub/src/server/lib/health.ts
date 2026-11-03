import { ISSUE } from "@trackvault/core/issues";
import { bumpVersion, notifyChanged } from "../services/library.ts";
import { db } from "./db.ts";
import { statement } from "./raw.ts";

export interface HealthCandidate {
	id: string;
	format: string;
	codec: string | null;
	bitrate: number | null;
	sampleRate: number | null;
	durationMs: number | null;
	path: string;
	fileHash: string | null;
	checkedHash: string | null;
	done: number;
}

// The tracks that have a file on disk, with whether the check `column` has run on
// the file as it is now (same hash): a rerun only looks at what changed.
export function healthCandidates(
	column: "integrity" | "bitrate_verdict",
	trackIds?: readonly string[],
): HealthCandidate[] {
	const rows = statement(
		`SELECT t.id AS id, t.format AS format, t.codec AS codec, t.bitrate AS bitrate, t.sample_rate AS sampleRate,
			t.duration_ms AS durationMs, f.path AS path, f.file_hash AS fileHash,
			h.file_hash AS checkedHash, (h.${column} IS NOT NULL) AS done
		FROM tracks t
		JOIN files f ON f.id = (SELECT min(id) FROM files WHERE track_id = t.id AND state = 'ok')
		LEFT JOIN health_checks h ON h.track_id = t.id
		WHERE (t.issues & ${ISSUE.quarantined}) = 0
		ORDER BY t.seq`,
	).all() as HealthCandidate[];
	const wanted = trackIds ? new Set(trackIds) : undefined;
	return rows.filter(
		(row) =>
			(!wanted || wanted.has(row.id)) &&
			!(row.done && row.checkedHash === row.fileHash),
	);
}

export interface HealthWrite {
	id: string;
	fileHash: string | null;
	set: number;
	clear: number;
	integrity?: string;
	integrityErrors?: string[];
	cutoffHz?: number | null;
	bitrateVerdict?: string;
	bitrateNote?: string;
}

// Stores a group of results: the issue bits on the tracks, the details in
// `health_checks`, one transaction and one library version for the group.
export function writeHealth(group: readonly HealthWrite[]): void {
	if (group.length === 0) return;
	let version = 0;
	db().transaction((tx) => {
		version = bumpVersion(tx);
		const flags = statement(
			"UPDATE tracks SET issues = (issues & ~@clear) | @set, version = @version WHERE id = @id",
		);
		const upsert =
			statement(`INSERT INTO health_checks (track_id, file_hash, integrity, integrity_errors, cutoff_hz, bitrate_verdict, bitrate_note, checked_at)
			VALUES (@id, @fileHash, @integrity, @integrityErrors, @cutoffHz, @bitrateVerdict, @bitrateNote, @now)
			ON CONFLICT(track_id) DO UPDATE SET
				integrity = CASE WHEN @fileHash IS NOT file_hash THEN @integrity ELSE coalesce(@integrity, integrity) END,
				integrity_errors = CASE WHEN @fileHash IS NOT file_hash THEN @integrityErrors ELSE coalesce(@integrityErrors, integrity_errors) END,
				cutoff_hz = CASE WHEN @fileHash IS NOT file_hash THEN @cutoffHz ELSE coalesce(@cutoffHz, cutoff_hz) END,
				bitrate_verdict = CASE WHEN @fileHash IS NOT file_hash THEN @bitrateVerdict ELSE coalesce(@bitrateVerdict, bitrate_verdict) END,
				bitrate_note = CASE WHEN @fileHash IS NOT file_hash THEN @bitrateNote ELSE coalesce(@bitrateNote, bitrate_note) END,
				file_hash = @fileHash, checked_at = @now`);
		const now = Date.now();
		for (const item of group) {
			flags.run({ id: item.id, set: item.set, clear: item.clear, version });
			upsert.run({
				id: item.id,
				fileHash: item.fileHash,
				integrity: item.integrity ?? null,
				integrityErrors: item.integrityErrors
					? JSON.stringify(item.integrityErrors)
					: null,
				cutoffHz: item.cutoffHz ?? null,
				bitrateVerdict: item.bitrateVerdict ?? null,
				bitrateNote: item.bitrateNote ?? null,
				now,
			});
		}
	});
	notifyChanged(
		group.map((item) => item.id),
		version,
	);
}
