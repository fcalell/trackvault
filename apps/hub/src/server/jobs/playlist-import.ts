import { eq } from "@fcalell/plugin-db/orm";
import { matchWants, type WantMatch } from "@trackvault/core/playlist-import";
import type { Want } from "@trackvault/core/wishlist";
import { importItems, imports } from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { hubLibraryIndex } from "../lib/library-index.ts";
import { type ImportInput, parseInput } from "../lib/playlist-import.ts";
import { readSettings } from "../lib/settings.ts";

export interface PlaylistImportPayload {
	importId: string;
}

export interface PlaylistImportResult {
	tracks: number;
	matched: number;
	missing: number;
	uncertain: number;
	otherVersion: number;
}

const CHUNK = 100;

// Reads what an import was given (a link, pasted text or a file), parses it into wants
// (core/playlist-import) and matches every want against the library (matchWants over
// the hub's full-text index): matched, missing, uncertain, or owned in another mix. The
// result is stored for the import's screen. A repeat starts the import over.
export default defineJob<PlaylistImportPayload, PlaylistImportResult>({
	kind: "playlist-import",
	concurrency: 1,
	maxAttempts: 1,
	async run({ payload, signal, progress }) {
		const database = db();
		const row = database
			.select()
			.from(imports)
			.where(eq(imports.id, payload.importId))
			.get();
		if (!row) throw new Error("That import is gone");
		const fail = (message: string): never => {
			database
				.update(imports)
				.set({ state: "failed", error: message, input: null })
				.where(eq(imports.id, row.id))
				.run();
			throw new Error(message);
		};
		let input: ImportInput;
		try {
			input = JSON.parse(row.input ?? "{}") as ImportInput;
		} catch {
			return fail("The import's input was lost");
		}
		progress(0, 0, "Reading the playlist");
		let parsed: Awaited<ReturnType<typeof parseInput>>;
		try {
			parsed = await parseInput(input, readSettings());
		} catch (error) {
			return fail(error instanceof Error ? error.message : String(error));
		}
		signal.throwIfAborted();
		if (parsed.wants.length === 0)
			return fail(parsed.warnings[0] ?? "No tracks were found there.");

		const wants = parsed.wants;
		const status = new Map<
			Want,
			"matched" | "missing" | "uncertain" | "other-version"
		>();
		const found = new Map<Want, WantMatch>();
		progress(0, wants.length, "Matching with the library");
		for (let i = 0; i < wants.length; i += CHUNK) {
			signal.throwIfAborted();
			const group = wants.slice(i, i + CHUNK);
			const m = await matchWants(group, hubLibraryIndex);
			for (const want of group) status.set(want, "missing");
			for (const each of m.otherVersions) {
				status.set(each.want, "other-version");
				found.set(each.want, each);
			}
			for (const each of m.uncertain) {
				status.set(each.want, "uncertain");
				found.set(each.want, each);
			}
			for (const each of m.matched) {
				status.set(each.want, "matched");
				found.set(each.want, each);
			}
			progress(
				Math.min(i + CHUNK, wants.length),
				wants.length,
				"Matching with the library",
			);
		}

		const result: PlaylistImportResult = {
			tracks: wants.length,
			matched: 0,
			missing: 0,
			uncertain: 0,
			otherVersion: 0,
		};
		database.transaction((tx) => {
			tx.delete(importItems).where(eq(importItems.importId, row.id)).run();
			for (const [pos, want] of wants.entries()) {
				const s = status.get(want) ?? "missing";
				const match = found.get(want);
				if (s === "matched") result.matched++;
				else if (s === "uncertain") result.uncertain++;
				else if (s === "other-version") result.otherVersion++;
				else result.missing++;
				tx.insert(importItems)
					.values({
						importId: row.id,
						pos,
						artist: want.artist,
						title: want.title,
						mix: want.mix ?? null,
						durationSec: want.durationSec ?? null,
						isrc: want.isrc ?? null,
						label: want.label ?? null,
						source: want.source,
						sourceRef: want.sourceRef,
						status: s,
						trackIds: (match?.trackIds ?? []).map(String).slice(0, 5),
						confidence: match ? Math.round(match.confidence * 1000) / 1000 : 0,
					})
					.run();
			}
			tx.update(imports)
				.set({
					state: "ready",
					name: parsed.name?.trim() || row.name,
					source: parsed.source,
					ref: parsed.ref,
					warnings: parsed.warnings,
					input: null,
					error: null,
				})
				.where(eq(imports.id, row.id))
				.run();
		});
		progress(
			wants.length,
			wants.length,
			`${result.matched} of ${wants.length} in the library`,
		);
		return result;
	},
});
