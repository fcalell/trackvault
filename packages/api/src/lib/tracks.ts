import { tracks } from "@repo/db/schema";
import { localFiles } from "@repo/db-desktop/schema";
import type { BaseOrpcContext } from "#lib/orpc";

export async function joinTracksWithFiles(
	db: BaseOrpcContext["db"],
	desktopDb?: BaseOrpcContext["desktopDb"],
) {
	const allTracks = await db.select().from(tracks);
	if (!desktopDb) {
		return allTracks.map((t) => ({ ...t, filepath: null, filename: null }));
	}
	const allFiles = await desktopDb.select().from(localFiles);
	const fileMap = new Map(allFiles.map((f) => [f.id, f]));
	return allTracks.map((t) => ({
		...t,
		filepath: fileMap.get(t.id)?.filepath ?? null,
		filename: fileMap.get(t.id)?.filename ?? null,
	}));
}
