import { and, eq, inArray, isNull, lte, or } from "@fcalell/plugin-db/orm";
import { fold } from "@trackvault/core/normalize";
import type { NewWant } from "@trackvault/core/wishlist";
import { wishlist } from "../../schema/index.ts";
import { db } from "./db.ts";

export type WantRow = typeof wishlist.$inferSelect;

// One want is one artist, title and mix, however often it is asked for.
export const wantKey = (w: {
	artist: string;
	title: string;
	mix?: string | null | undefined;
}): string => `${fold(w.artist)}|${fold(w.title)}|${fold(w.mix)}`;

export interface AddOptions {
	betterThanTrackId?: string | null;
	minFormatScore?: number | null;
	note?: string | null;
}

// Adds wants the wishlist lacks; a want already there is left as it is (and counted).
export function addWants(
	wants: readonly NewWant[],
	options: AddOptions = {},
): { added: number; existing: number; ids: number[] } {
	const database = db();
	const now = new Date();
	let added = 0;
	let existing = 0;
	const ids: number[] = [];
	database.transaction((tx) => {
		for (const want of wants) {
			const row = tx
				.insert(wishlist)
				.values({
					key: wantKey(want),
					artist: want.artist,
					title: want.title,
					mix: want.mix ?? null,
					source: want.source,
					sourceRef: want.sourceRef,
					status: "wanted",
					durationSec: want.durationSec ?? null,
					isrc: want.isrc ?? null,
					label: want.label ?? null,
					betterThanTrackId: options.betterThanTrackId ?? null,
					minFormatScore: options.minFormatScore ?? null,
					note: options.note ?? null,
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoNothing()
				.returning({ id: wishlist.id })
				.get();
			if (row) {
				added++;
				ids.push(row.id);
			} else existing++;
		}
	});
	return { added, existing, ids };
}

// Wants whose next search is due, oldest due first.
export function dueWants(limit: number, now = new Date()): WantRow[] {
	return db()
		.select()
		.from(wishlist)
		.where(
			and(
				inArray(wishlist.status, ["wanted", "searching"]),
				or(isNull(wishlist.nextSearchAt), lte(wishlist.nextSearchAt, now)),
			),
		)
		.orderBy(wishlist.nextSearchAt, wishlist.id)
		.limit(limit)
		.all();
}

export function setStatus(
	id: number,
	status: WantRow["status"],
	extra: Partial<WantRow> = {},
): void {
	db()
		.update(wishlist)
		.set({ status, ...extra, updatedAt: new Date() })
		.where(eq(wishlist.id, id))
		.run();
}
