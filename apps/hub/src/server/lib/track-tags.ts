import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import { changes, tags, trackTags } from "../../schema/index.ts";
import type { BatchInfo } from "./changes.ts";
import type { Tx } from "./db.ts";
import { inserter } from "./raw.ts";

const insertChange = inserter(changes);

// Adds and removes custom tags on `ids` inside the caller's transaction, and logs
// each track's tags as one change ("tags": the names before and after) so an undo
// restores the set. Returns the tracks that changed and the changes logged.
export function applyTagSets(
	tx: Tx,
	ids: readonly string[],
	add: readonly number[],
	remove: readonly number[],
	info: BatchInfo,
	now: Date,
): { touched: string[]; logged: number } {
	if (add.length === 0 && remove.length === 0)
		return { touched: [], logged: 0 };
	const names = new Map<number, string>();
	for (const row of tx.select().from(tags).all()) names.set(row.id, row.name);
	const before = new Map<string, Set<number>>();
	for (const row of tx
		.select()
		.from(trackTags)
		.where(inArray(trackTags.trackId, [...ids]))
		.all()) {
		const set = before.get(row.trackId) ?? new Set<number>();
		set.add(row.tagId);
		before.set(row.trackId, set);
	}
	const named = (set: Set<number>): string[] =>
		[...set]
			.flatMap((id) => (names.has(id) ? [names.get(id) as string] : []))
			.sort((a, b) => a.localeCompare(b));
	const touched: string[] = [];
	for (const id of ids) {
		const was = before.get(id) ?? new Set<number>();
		const next = new Set(was);
		for (const tag of add) if (names.has(tag)) next.add(tag);
		for (const tag of remove) next.delete(tag);
		const gained = [...next].filter((tag) => !was.has(tag));
		const lost = [...was].filter((tag) => !next.has(tag));
		if (gained.length === 0 && lost.length === 0) continue;
		for (const tagId of gained)
			tx.insert(trackTags).values({ trackId: id, tagId }).run();
		if (lost.length > 0)
			tx.delete(trackTags)
				.where(and(inArray(trackTags.tagId, lost), eq(trackTags.trackId, id)))
				.run();
		insertChange({
			entity: "track",
			entityId: id,
			field: "tags",
			before: named(was),
			after: named(next),
			origin: info.origin,
			batchId: info.batchId,
			at: now,
		});
		touched.push(id);
	}
	return { touched, logged: touched.length };
}

// Sets a track's tags to exactly `names` (an undo), creating a tag the owner has
// since deleted. Inside the caller's transaction.
export function setTagNames(
	tx: Tx,
	trackId: string,
	nameList: readonly string[],
	now: Date,
): void {
	const byName = new Map<string, number>();
	for (const row of tx.select().from(tags).all())
		byName.set(row.name.toLowerCase(), row.id);
	const wanted = new Set<number>();
	for (const name of nameList) {
		let id = byName.get(name.toLowerCase());
		if (id === undefined) {
			id = tx
				.insert(tags)
				.values({ name, createdAt: now })
				.returning({ id: tags.id })
				.get().id;
			byName.set(name.toLowerCase(), id);
		}
		wanted.add(id);
	}
	tx.delete(trackTags)
		.where(inArray(trackTags.trackId, [trackId]))
		.run();
	for (const tagId of wanted)
		tx.insert(trackTags).values({ trackId, tagId }).run();
}
