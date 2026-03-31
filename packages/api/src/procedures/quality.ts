import * as fs from "node:fs/promises";
import * as path from "node:path";
import { STANDARD_GENRES } from "@repo/constants/genres";
import { tracks } from "@repo/db/schema";
import { localFiles } from "@repo/db-desktop/schema";
import {
	fileOrganizerInputSchema,
	genreNormalizationApplyInputSchema,
} from "@repo/schema/quality";
import { eq, inArray, sql } from "drizzle-orm";
import NodeID3 from "node-id3";
import { getLibraryPath, requireDesktopDb } from "#lib/context";
import type { BaseOrpcContext } from "#lib/orpc";
import { baseProcedure } from "#lib/orpc";
import { requirePlatform } from "#middleware/platform";
import { isUnderDirectory } from "#utils/path";
import { compareTwoStrings } from "#utils/similarity";

// biome-ignore lint/suspicious/noControlCharactersInRegex: needed to strip control chars from filenames
const UNSAFE_FILENAME_RE = /[<>:"/\\|?*\x00-\x1f]/g;

function sanitizeFilename(name: string): string {
	return name.replace(UNSAFE_FILENAME_RE, "_").trim();
}

function resolvePattern(
	pattern: string,
	track: {
		title: string | null;
		artist: string | null;
		album: string | null;
		genre: string | null;
	},
): string {
	return pattern
		.replace(/\{artist\}/g, sanitizeFilename(track.artist || "Unknown Artist"))
		.replace(/\{album\}/g, sanitizeFilename(track.album || "Unknown Album"))
		.replace(/\{title\}/g, sanitizeFilename(track.title || "Unknown Title"))
		.replace(/\{genre\}/g, sanitizeFilename(track.genre || "Unknown Genre"));
}

// --- Genre Normalization ---

const genreNormalizationScan = baseProcedure.handler(async ({ context }) => {
	const { db } = context;

	const genreRows = await db
		.select({
			genre: tracks.genre,
			trackCount: sql<number>`count(*)`,
		})
		.from(tracks)
		.where(sql`${tracks.genre} is not null`)
		.groupBy(tracks.genre);

	return genreRows.map((row) => {
		const current = row.genre as string;
		let bestMatch = current;
		let bestScore = 0;

		for (const standard of STANDARD_GENRES) {
			const score = compareTwoStrings(
				current.toLowerCase(),
				standard.toLowerCase(),
			);
			if (score > bestScore) {
				bestScore = score;
				bestMatch = standard;
			}
		}

		return {
			current,
			suggested: bestScore >= 0.5 ? bestMatch : current,
			trackCount: row.trackCount,
		};
	});
});

const genreNormalizationApply = baseProcedure
	.use(requirePlatform("electron", "node"))
	.input(genreNormalizationApplyInputSchema)
	.handler(async ({ input, context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);

		let updated = 0;

		for (const mapping of input.mappings) {
			const matchingTracks = await db
				.select({ id: tracks.id })
				.from(tracks)
				.where(eq(tracks.genre, mapping.from));

			await db
				.update(tracks)
				.set({ genre: mapping.to, updatedAt: Date.now() })
				.where(eq(tracks.genre, mapping.from));

			const trackIds = matchingTracks.map((t) => t.id);
			if (trackIds.length > 0) {
				const fileRows = await desktopDb
					.select()
					.from(localFiles)
					.where(inArray(localFiles.id, trackIds));

				for (const file of fileRows) {
					if (file.filepath) {
						try {
							NodeID3.update({ genre: mapping.to }, file.filepath);
						} catch {
							// best-effort tag write
						}
					}
				}
			}

			updated += matchingTracks.length;
		}

		return { updated };
	});

// --- File Organizer ---

function computeFileOrganizerMoves(
	allTracks: (typeof tracks.$inferSelect)[],
	fileMap: Map<string, typeof localFiles.$inferSelect>,
	libraryPath: string,
	pattern: string,
) {
	const moves: Array<{
		trackId: string;
		currentPath: string;
		newPath: string;
	}> = [];
	let alreadyInPlace = 0;

	for (const track of allTracks) {
		const file = fileMap.get(track.id);
		if (!file) continue;

		const ext = path.extname(file.filepath);
		const relativePath = `${resolvePattern(pattern, track)}${ext}`;
		const newPath = path.join(libraryPath, relativePath);

		if (path.resolve(file.filepath) === path.resolve(newPath)) {
			alreadyInPlace++;
		} else {
			moves.push({
				trackId: track.id,
				currentPath: file.filepath,
				newPath,
			});
		}
	}

	return { moves, alreadyInPlace };
}

async function loadFileOrganizerData(
	db: BaseOrpcContext["db"],
	desktopDb: NonNullable<BaseOrpcContext["desktopDb"]>,
) {
	const allTracks = await db.select().from(tracks);
	const allFiles = await desktopDb.select().from(localFiles);
	const fileMap = new Map(allFiles.map((f) => [f.id, f]));
	return { allTracks, fileMap };
}

const fileOrganizerPreview = baseProcedure
	.use(requirePlatform("electron", "node"))
	.input(fileOrganizerInputSchema)
	.handler(async ({ input, context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);
		const libraryPath = await getLibraryPath(desktopDb);

		const { allTracks, fileMap } = await loadFileOrganizerData(db, desktopDb);
		return computeFileOrganizerMoves(
			allTracks,
			fileMap,
			libraryPath,
			input.pattern,
		);
	});

const fileOrganizerExecute = baseProcedure
	.use(requirePlatform("electron", "node"))
	.input(fileOrganizerInputSchema)
	.handler(async ({ input, context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);
		const libraryPath = await getLibraryPath(desktopDb);

		const { allTracks, fileMap } = await loadFileOrganizerData(db, desktopDb);
		const { moves } = computeFileOrganizerMoves(
			allTracks,
			fileMap,
			libraryPath,
			input.pattern,
		);

		const errors: Array<{ trackId: string; message: string }> = [];
		let moved = 0;

		for (const move of moves) {
			if (!isUnderDirectory(move.newPath, libraryPath)) {
				errors.push({
					trackId: move.trackId,
					message: "Resolved path is outside the library directory",
				});
				continue;
			}

			try {
				await fs.mkdir(path.dirname(move.newPath), { recursive: true });
				await fs.rename(move.currentPath, move.newPath);
				await desktopDb
					.update(localFiles)
					.set({
						filepath: move.newPath,
						filename: path.basename(move.newPath),
					})
					.where(eq(localFiles.id, move.trackId));
				moved++;
			} catch (err) {
				errors.push({
					trackId: move.trackId,
					message: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}

		return { moved, errors };
	});

export const qualityRouter = {
	genreNormalization: {
		scan: genreNormalizationScan,
		apply: genreNormalizationApply,
	},
	fileOrganizer: {
		preview: fileOrganizerPreview,
		execute: fileOrganizerExecute,
	},
};
