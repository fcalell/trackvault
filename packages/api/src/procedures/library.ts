import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ORPCError } from "@orpc/server";
import {
	LOW_BITRATE_THRESHOLD,
	SUPPORTED_EXTENSIONS,
} from "@repo/constants/audio";
import { tracks } from "@repo/db/schema";
import { localFiles } from "@repo/db-desktop/schema";
import {
	batchDeleteInputSchema,
	batchUpdateInputSchema,
	deleteFileInputSchema,
	findDuplicatesInputSchema,
	updateTrackInputSchema,
} from "@repo/schema/library";
import { eq, inArray, sql } from "drizzle-orm";
import { parseFile } from "music-metadata";
import NodeID3 from "node-id3";
import { getLibraryPath, requireDesktopDb } from "#lib/context";
import type { BaseOrpcContext } from "#lib/orpc";
import { baseProcedure } from "#lib/orpc";
import { joinTracksWithFiles } from "#lib/tracks";
import { requirePlatform } from "#middleware/platform";
import { isUnderDirectory } from "#utils/path";
import { compareTwoStrings } from "#utils/similarity";

async function readAudioFiles(libraryPath: string) {
	const entries = await fs.readdir(libraryPath, { recursive: true });
	return entries.filter(
		(file): file is string =>
			typeof file === "string" &&
			SUPPORTED_EXTENSIONS.some((ext) => file.endsWith(ext)),
	);
}

async function parseTrackMetadata(filepath: string) {
	const { format } = await parseFile(filepath, { skipCovers: true });
	const tags = NodeID3.read(filepath, { noRaw: true });
	return {
		title: tags.title ?? null,
		artist: tags.artist ?? null,
		album: tags.album ?? null,
		genre: tags.genre ?? null,
		year: tags.year ? Number.parseInt(tags.year, 10) : null,
		comment: tags.comment?.text ?? null,
		bitrate: (format.bitrate && Math.round(format.bitrate / 1000)) ?? null,
		duration: format.duration ?? null,
	};
}

function buildID3TagUpdate(fields: {
	title?: string | null;
	artist?: string | null;
	album?: string | null;
	genre?: string | null;
	year?: number | null;
	comment?: string | null;
}): Record<string, unknown> {
	const tagUpdate: Record<string, unknown> = {};
	if (fields.title !== undefined) tagUpdate.title = fields.title;
	if (fields.artist !== undefined) tagUpdate.artist = fields.artist;
	if (fields.album !== undefined) tagUpdate.album = fields.album;
	if (fields.genre !== undefined) tagUpdate.genre = fields.genre;
	if (fields.year !== undefined) tagUpdate.year = String(fields.year);
	if (fields.comment !== undefined)
		tagUpdate.comment = { language: "eng", text: fields.comment };
	return tagUpdate;
}

async function syncNewFiles(
	db: BaseOrpcContext["db"],
	desktopDb: NonNullable<BaseOrpcContext["desktopDb"]>,
	filePaths: string[],
) {
	const existingFiles = await desktopDb.select().from(localFiles);
	const existingPaths = new Set(existingFiles.map((f) => f.filepath));

	const now = Date.now();
	const newTracks: (typeof tracks.$inferInsert)[] = [];
	const newLocalFiles: (typeof localFiles.$inferInsert)[] = [];

	for (const filepath of filePaths) {
		if (existingPaths.has(filepath)) continue;

		const meta = await parseTrackMetadata(filepath);
		const id = randomUUID();
		newTracks.push({ id, ...meta, createdAt: now, updatedAt: now });
		newLocalFiles.push({
			id,
			filepath,
			filename: path.basename(filepath),
			indexedAt: now,
		});
	}

	if (newTracks.length > 0) {
		await db.insert(tracks).values(newTracks);
		await desktopDb.insert(localFiles).values(newLocalFiles);
	}

	return { added: newTracks.length, existingFiles };
}

const scan = baseProcedure
	.use(requirePlatform("electron", "node"))
	.handler(async ({ context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);
		const libraryPath = await getLibraryPath(desktopDb);

		const audioFiles = await readAudioFiles(libraryPath);
		const filePaths = audioFiles.map((file) => path.join(libraryPath, file));

		const { added } = await syncNewFiles(db, desktopDb, filePaths);
		return { added };
	});

const list = baseProcedure.handler(async ({ context }) => {
	return joinTracksWithFiles(context.db, context.desktopDb);
});

const facets = baseProcedure.handler(async ({ context }) => {
	const { db } = context;

	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(tracks);
	const totalCount = countResult[0]?.count ?? 0;

	const artistRows = await db
		.select({
			name: tracks.artist,
			count: sql<number>`count(*)`,
		})
		.from(tracks)
		.where(sql`${tracks.artist} is not null`)
		.groupBy(tracks.artist);

	const albumRows = await db
		.select({
			name: tracks.album,
			count: sql<number>`count(*)`,
		})
		.from(tracks)
		.where(sql`${tracks.album} is not null`)
		.groupBy(tracks.album);

	const genreRows = await db
		.select({
			name: tracks.genre,
			count: sql<number>`count(*)`,
		})
		.from(tracks)
		.where(sql`${tracks.genre} is not null`)
		.groupBy(tracks.genre);

	const [issuesResult] = await db
		.select({
			noArtist: sql<number>`sum(case when ${tracks.artist} is null then 1 else 0 end)`,
			noGenre: sql<number>`sum(case when ${tracks.genre} is null then 1 else 0 end)`,
			noAlbum: sql<number>`sum(case when ${tracks.album} is null then 1 else 0 end)`,
			noYear: sql<number>`sum(case when ${tracks.year} is null then 1 else 0 end)`,
			lowBitrate: sql<number>`sum(case when ${tracks.bitrate} < ${LOW_BITRATE_THRESHOLD} then 1 else 0 end)`,
		})
		.from(tracks);

	return {
		totalCount,
		artists: artistRows.map((r) => ({
			name: r.name as string,
			count: r.count,
		})),
		albums: albumRows.map((r) => ({ name: r.name as string, count: r.count })),
		genres: genreRows.map((r) => ({ name: r.name as string, count: r.count })),
		issues: {
			noArtist: issuesResult?.noArtist ?? 0,
			noGenre: issuesResult?.noGenre ?? 0,
			noAlbum: issuesResult?.noAlbum ?? 0,
			noYear: issuesResult?.noYear ?? 0,
			lowBitrate: issuesResult?.lowBitrate ?? 0,
		},
	};
});

const update = baseProcedure
	.use(requirePlatform("electron", "node"))
	.input(updateTrackInputSchema)
	.handler(async ({ input, context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);

		const { id, ...fields } = input;
		const updateData: Record<string, unknown> = { updatedAt: Date.now() };
		for (const [key, value] of Object.entries(fields)) {
			if (value !== undefined) updateData[key] = value;
		}

		await db.update(tracks).set(updateData).where(eq(tracks.id, id));

		const fileRows = await desktopDb
			.select()
			.from(localFiles)
			.where(eq(localFiles.id, id))
			.limit(1);
		const file = fileRows[0];

		if (file?.filepath) {
			const tagUpdate = buildID3TagUpdate(fields);
			NodeID3.update(tagUpdate, file.filepath);
		}

		const [updated] = await db
			.select()
			.from(tracks)
			.where(eq(tracks.id, id))
			.limit(1);

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "Track not found" });
		}

		return {
			...updated,
			filepath: file?.filepath ?? null,
			filename: file?.filename ?? null,
		};
	});

const batchUpdate = baseProcedure
	.use(requirePlatform("electron", "node"))
	.input(batchUpdateInputSchema)
	.handler(async ({ input, context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);

		const updateData: Record<string, unknown> = { updatedAt: Date.now() };
		for (const [key, value] of Object.entries(input.fields)) {
			if (value !== undefined) updateData[key] = value;
		}

		const errors: Array<{ id: string; message: string }> = [];
		let updated = 0;

		await db.transaction(async (tx) => {
			for (const id of input.ids) {
				tx.update(tracks).set(updateData).where(eq(tracks.id, id)).run();
			}
		});

		const fileRows = await desktopDb
			.select()
			.from(localFiles)
			.where(inArray(localFiles.id, input.ids));
		const fileMap = new Map(fileRows.map((f) => [f.id, f]));
		const tagUpdate = buildID3TagUpdate(input.fields);

		for (const id of input.ids) {
			try {
				const file = fileMap.get(id);
				if (file?.filepath) {
					NodeID3.update(tagUpdate, file.filepath);
				}
				updated++;
			} catch (err) {
				errors.push({
					id,
					message: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}

		return { updated, errors };
	});

const batchDelete = baseProcedure
	.use(requirePlatform("electron", "node"))
	.input(batchDeleteInputSchema)
	.handler(async ({ input, context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);
		const libraryPath = await getLibraryPath(desktopDb);

		const errors: Array<{ id: string; message: string }> = [];
		let deleted = 0;

		for (const id of input.ids) {
			try {
				const fileRows = await desktopDb
					.select()
					.from(localFiles)
					.where(eq(localFiles.id, id))
					.limit(1);
				const file = fileRows[0];

				if (file?.filepath) {
					if (!isUnderDirectory(file.filepath, libraryPath)) {
						errors.push({
							id,
							message: "File is outside the library directory",
						});
						continue;
					}
					await fs.unlink(file.filepath);
				}
				deleted++;
			} catch (err) {
				errors.push({
					id,
					message: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}

		const successIds = input.ids.filter(
			(id) => !errors.some((e) => e.id === id),
		);

		if (successIds.length > 0) {
			await db.transaction(async (tx) => {
				tx.delete(tracks).where(inArray(tracks.id, successIds)).run();
			});
			await desktopDb.transaction(async (tx) => {
				tx.delete(localFiles).where(inArray(localFiles.id, successIds)).run();
			});
		}

		return { deleted, errors };
	});

const deleteFile = baseProcedure
	.use(requirePlatform("electron", "node"))
	.input(deleteFileInputSchema)
	.handler(async ({ input, context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);

		const files = await desktopDb
			.select()
			.from(localFiles)
			.where(eq(localFiles.id, input.id))
			.limit(1);
		const file = files[0];

		if (file?.filepath) {
			const libraryPath = await getLibraryPath(desktopDb);
			if (!isUnderDirectory(file.filepath, libraryPath)) {
				throw new ORPCError("FORBIDDEN", {
					message: "File is outside the library directory",
				});
			}
			await fs.unlink(file.filepath);
		}

		await desktopDb.delete(localFiles).where(eq(localFiles.id, input.id));
		await db.delete(tracks).where(eq(tracks.id, input.id));
		return { success: true };
	});

const rescan = baseProcedure
	.use(requirePlatform("electron", "node"))
	.handler(async ({ context }) => {
		const { db } = context;
		const desktopDb = requireDesktopDb(context);
		const libraryPath = await getLibraryPath(desktopDb);

		const audioFiles = await readAudioFiles(libraryPath);
		const filePaths = audioFiles.map((file) => path.join(libraryPath, file));
		const diskPaths = new Set(filePaths);

		const { added, existingFiles } = await syncNewFiles(
			db,
			desktopDb,
			filePaths,
		);

		const removedIds: string[] = [];
		for (const file of existingFiles) {
			if (!diskPaths.has(file.filepath)) {
				removedIds.push(file.id);
			}
		}

		if (removedIds.length > 0) {
			await db.delete(tracks).where(inArray(tracks.id, removedIds));
			await desktopDb
				.delete(localFiles)
				.where(inArray(localFiles.id, removedIds));
		}

		return { added, removed: removedIds.length };
	});

const findDuplicates = baseProcedure
	.input(findDuplicatesInputSchema)
	.handler(async ({ input, context }) => {
		const files = await joinTracksWithFiles(context.db, context.desktopDb);

		type FileEntry = (typeof files)[number];
		const calculateSimilarity = (file1: FileEntry, file2: FileEntry) => {
			const similarities: number[] = [];

			if (input.matchTags) {
				if (file1.title && file2.title) {
					similarities.push(compareTwoStrings(file1.title, file2.title));
				}
				if (file1.artist && file2.artist) {
					similarities.push(compareTwoStrings(file1.artist, file2.artist));
				}
			}
			if (input.matchFilename && file1.filename && file2.filename) {
				similarities.push(compareTwoStrings(file1.filename, file2.filename));
			}

			if (similarities.length === 0) return 0;
			return similarities.reduce((a, b) => a + b, 0) / similarities.length;
		};

		const duplicateGroups: FileEntry[][] = [];
		const processedIds = new Set<string>();

		for (let i = 0; i < files.length; i++) {
			const current = files[i];
			if (!current || processedIds.has(current.id)) continue;

			const group = [current];
			processedIds.add(current.id);

			for (let j = i + 1; j < files.length; j++) {
				const candidate = files[j];
				if (!candidate || processedIds.has(candidate.id)) continue;

				if (calculateSimilarity(current, candidate) >= input.probability) {
					group.push(candidate);
					processedIds.add(candidate.id);
				}
			}

			if (group.length > 1) {
				duplicateGroups.push(group);
			}
		}

		return { duplicateGroups };
	});

export const libraryRouter = {
	scan,
	list,
	facets,
	update,
	batchUpdate,
	batchDelete,
	delete: deleteFile,
	rescan,
	findDuplicates,
};
