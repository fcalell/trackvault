import { randomUUID } from "node:crypto";
import { eq } from "@fcalell/plugin-db/orm";
import type { InboxStepId, StepResult } from "@trackvault/core/inbox";
import type { TrackTags } from "@trackvault/core/tags";
import { inboxItems } from "../../../schema/index.ts";
import { db } from "../db.ts";
import type { TagValues } from "../track-fields.ts";

export type ItemRow = typeof inboxItems.$inferSelect;
export type Steps = Partial<Record<InboxStepId, StepResult>>;

export interface MatchView {
	trackId: string;
	label: string;
	kind: "exact" | "acoustic" | "fuzzy";
	confidence: number;
	version: "same" | "different" | "unknown";
	format: string;
	bitrate: number | null;
}

// What an owner decided over the pipeline's verdict: keep the file as a new track, or
// let it replace one of the library's.
export type Override =
	| { kind: "accept" }
	| { kind: "replace"; trackId: string };

export const stepsOf = (row: Pick<ItemRow, "steps">): Steps =>
	(row.steps ?? {}) as Steps;

export const tagsOf = (row: Pick<ItemRow, "tags">): Partial<TrackTags> =>
	(row.tags ?? {}) as Partial<TrackTags>;

export const proposedOf = (row: Pick<ItemRow, "proposed">): TagValues =>
	(row.proposed ?? {}) as TagValues;

export const matchesOf = (row: Pick<ItemRow, "matches">): MatchView[] =>
	(row.matches ?? []) as MatchView[];

// The tags the file would carry once approved: what it has, then what the pipeline set.
export function effectiveTags(
	row: Pick<ItemRow, "tags" | "proposed">,
): Record<string, string | number | null> {
	return {
		...(tagsOf(row) as Record<string, string | number | null>),
		...proposedOf(row),
	};
}

export interface NewItem {
	path: string;
	source: ItemRow["source"];
	sourceRef?: string | null;
	size?: number;
	mtimeMs?: number;
	wantId?: number | null;
	downloadId?: string | null;
	needsCutoffCheck?: boolean;
}

// Registers a file as an item; a path already registered is left as it is.
export function registerItem(input: NewItem): ItemRow | undefined {
	const now = new Date();
	return db()
		.insert(inboxItems)
		.values({
			id: randomUUID(),
			path: input.path,
			source: input.source,
			sourceRef: input.sourceRef ?? null,
			state: "queued",
			steps: {},
			size: input.size ?? 0,
			mtimeMs: input.mtimeMs ?? 0,
			wantId: input.wantId ?? null,
			downloadId: input.downloadId ?? null,
			needsCutoffCheck: input.needsCutoffCheck ?? false,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()
		.returning()
		.get();
}

export function getItem(id: string): ItemRow | undefined {
	return db().select().from(inboxItems).where(eq(inboxItems.id, id)).get();
}

export function patchItem(id: string, patch: Partial<ItemRow>): void {
	db()
		.update(inboxItems)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(inboxItems.id, id))
		.run();
}

// "Artist - Title" of an item for a list: the tags, else the file's name.
export function itemLabel(
	row: Pick<ItemRow, "tags" | "proposed" | "path">,
): string {
	const tags = effectiveTags(row);
	const artist = typeof tags.artist === "string" ? tags.artist : null;
	const title = typeof tags.title === "string" ? tags.title : null;
	if (title) return [artist, title].filter(Boolean).join(" - ");
	return row.path.slice(row.path.lastIndexOf("/") + 1);
}
