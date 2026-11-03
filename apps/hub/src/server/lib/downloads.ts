import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import type { SlskdClient } from "@trackvault/core/slskd";
import { downloads, searchResults, wishlist } from "../../schema/index.ts";
import { db } from "./db.ts";
import { announceTransfer } from "./transfers.ts";

export type ResultRow = typeof searchResults.$inferSelect;

// Asks a peer for a candidate through slskd and records the transfer. The same
// file asked twice is one download (a failed or cancelled one starts over).
export async function startDownload(
	client: SlskdClient,
	candidate: Pick<
		ResultRow,
		| "username"
		| "filename"
		| "size"
		| "artist"
		| "title"
		| "format"
		| "bitrate"
		| "score"
		| "needsCutoffCheck"
	>,
	wantId: number | null,
): Promise<string> {
	const database = db();
	const now = new Date();
	const existing = database
		.select()
		.from(downloads)
		.where(
			and(
				eq(downloads.username, candidate.username),
				eq(downloads.filename, candidate.filename),
			),
		)
		.get();
	let id = existing?.id ?? randomUUID();
	if (
		existing &&
		(existing.state === "requested" ||
			existing.state === "queued" ||
			existing.state === "downloading" ||
			existing.state === "completed")
	) {
		id = existing.id;
	} else if (existing) {
		database
			.update(downloads)
			.set({
				state: "requested",
				rawState: null,
				slskdId: null,
				bytes: 0,
				speed: 0,
				error: null,
				inboxItemId: null,
				wantId,
				score: candidate.score,
				needsCutoffCheck: candidate.needsCutoffCheck,
				updatedAt: now,
			})
			.where(eq(downloads.id, existing.id))
			.run();
	} else {
		database
			.insert(downloads)
			.values({
				id,
				username: candidate.username,
				filename: candidate.filename,
				size: candidate.size,
				artist: candidate.artist,
				title: candidate.title,
				format: candidate.format,
				bitrate: candidate.bitrate,
				score: candidate.score,
				needsCutoffCheck: candidate.needsCutoffCheck,
				wantId,
				createdAt: now,
				updatedAt: now,
			})
			.run();
	}
	try {
		await client.downloads.enqueue(candidate.username, [
			{ filename: candidate.filename, size: candidate.size },
		]);
	} catch (error) {
		database
			.update(downloads)
			.set({
				state: "failed",
				error: error instanceof Error ? error.message : String(error),
				updatedAt: new Date(),
			})
			.where(eq(downloads.id, id))
			.run();
		announceTransfer(id);
		throw error;
	}
	if (wantId !== null)
		database
			.update(wishlist)
			.set({ status: "downloading", updatedAt: new Date() })
			.where(eq(wishlist.id, wantId))
			.run();
	announceTransfer(id);
	return id;
}

export function resultsByIds(ids: readonly number[]): ResultRow[] {
	return db()
		.select()
		.from(searchResults)
		.where(inArray(searchResults.id, [...ids]))
		.all();
}
