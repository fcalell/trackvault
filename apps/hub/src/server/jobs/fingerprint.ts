import { and, eq, sql } from "@fcalell/plugin-db/orm";
import { fingerprintFile, fingerprintToBytes } from "@trackvault/core/dedupe";
import { binaryAvailable } from "@trackvault/core/exec";
import { safeJoin } from "@trackvault/core/paths";
import { files, fingerprints } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { readSettings } from "../lib/settings.ts";
import { enqueue } from "../services/jobs.ts";
import dedupe, { type DedupePayload } from "./dedupe.ts";

export interface FingerprintPayload {
	trackIds?: string[];
	// Run the duplicate search (with this scope) once the fingerprints are in.
	afterwards?: DedupePayload;
}

export interface FingerprintResult {
	made: number;
	failed: number;
	skipped?: string;
}

// Chromaprint (`fpcalc`) of each track's file, stored as bytes. Only tracks with no
// fingerprint, or whose file hash changed, are done. Without fpcalc on the PATH the
// job says so and the duplicate search runs on the exact and fuzzy tiers alone.
export default defineJob<FingerprintPayload, FingerprintResult>({
	kind: "fingerprint",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const root = readSettings().libraryRoot;
		if (!root) throw new Error("The library folder is not set");
		const finish = (result: FingerprintResult): FingerprintResult => {
			if (payload.afterwards) enqueue(dedupe, payload.afterwards);
			return result;
		};
		if (!(await binaryAvailable("fpcalc", "-version"))) {
			progress(0, 0, "Needs fpcalc (Chromaprint) on the hub's PATH");
			return finish({ made: 0, failed: 0, skipped: "needs fpcalc" });
		}
		const rows = db()
			.select({
				trackId: files.trackId,
				path: sql<string>`min(${files.path})`,
				fileHash: sql<string | null>`min(${files.fileHash})`,
				have: sql<string | null>`min(${fingerprints.fileHash})`,
				has: sql<number>`count(${fingerprints.trackId})`,
			})
			.from(files)
			.leftJoin(fingerprints, eq(fingerprints.trackId, files.trackId))
			.where(and(eq(files.state, "ok")))
			.groupBy(files.trackId)
			.all();
		const wanted = payload.trackIds ? new Set(payload.trackIds) : undefined;
		const todo = rows.filter(
			(row) =>
				row.trackId !== null &&
				(!wanted || wanted.has(row.trackId)) &&
				(row.has === 0 || row.have !== row.fileHash),
		);
		const result: FingerprintResult = { made: 0, failed: 0 };
		progress(0, todo.length, "Fingerprinting");
		let next = 0;
		let handled = 0;
		const worker = async (): Promise<void> => {
			for (;;) {
				signal.throwIfAborted();
				const row = todo[next++];
				if (!row) return;
				const found = await fingerprintFile(safeJoin(root, row.path));
				if (found.ok) {
					db()
						.insert(fingerprints)
						.values({
							trackId: row.trackId as string,
							data: Buffer.from(fingerprintToBytes(found.fingerprint)),
							fileHash: row.fileHash,
							createdAt: new Date(),
						})
						.onConflictDoUpdate({
							target: fingerprints.trackId,
							set: {
								data: Buffer.from(fingerprintToBytes(found.fingerprint)),
								fileHash: row.fileHash,
								createdAt: new Date(),
							},
						})
						.run();
					result.made++;
				} else result.failed++;
				progress(++handled, todo.length, "Fingerprinting");
			}
		};
		await Promise.all([worker(), worker(), worker(), worker()]);
		progress(todo.length, todo.length, `${result.made} fingerprinted`);
		return finish(result);
	},
});
