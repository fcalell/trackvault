import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "@fcalell/plugin-db/orm";
import type { InboxStepId, StepResult } from "@trackvault/core/inbox";
import { fold, parseTitle, splitArtists } from "@trackvault/core/normalize";
import { joinFeatures } from "@trackvault/core/rules";
import type { TrackTags } from "@trackvault/core/tags";
import { files, inboxItems, tracks } from "../../../schema/index.ts";
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

// The file's artist, title and mix as the track row names them; a file with no
// title tag goes by its file name.
export function itemName(row: Pick<ItemRow, "tags" | "proposed" | "path">): {
	artist: string | null;
	title: string;
	mixName: string | null;
} {
	const tags = effectiveTags(row);
	const artist = typeof tags.artist === "string" ? tags.artist : null;
	if (typeof tags.title !== "string" || tags.title === "")
		return {
			artist,
			title: row.path.slice(row.path.lastIndexOf("/") + 1),
			mixName: null,
		};
	const parsed = parseTitle(tags.title);
	// The title's "feat." credit is shown with the artist, as the cleanup rule files it.
	const known = new Set(splitArtists(artist).map(fold));
	const fresh = parsed.features.filter((name) => !known.has(fold(name)));
	const credit = joinFeatures(fresh);
	return {
		artist:
			fresh.length === 0
				? artist
				: artist
					? `${artist} feat. ${credit}`
					: credit,
		title: parsed.base || tags.title,
		mixName: parsed.mixName,
	};
}

// The library tracks an item matched, with what the owner compares a copy by.
export function libraryCopies(matches: readonly MatchView[]) {
	if (matches.length === 0) return [];
	const ids = matches.map((match) => match.trackId);
	const database = db();
	const found = new Map(
		database
			.select({
				id: tracks.id,
				artist: tracks.artist,
				title: tracks.title,
				mixName: tracks.mixName,
				sampleRate: tracks.sampleRate,
				durationMs: tracks.durationMs,
				size: tracks.size,
				genre: tracks.genre,
				key: tracks.key,
				bpm: tracks.bpm,
				year: tracks.year,
			})
			.from(tracks)
			.where(inArray(tracks.id, ids))
			.all()
			.map((track) => [track.id, track]),
	);
	const paths = new Map<string, string>();
	for (const file of database
		.select({ trackId: files.trackId, path: files.path })
		.from(files)
		.where(and(inArray(files.trackId, ids), eq(files.state, "ok")))
		.orderBy(desc(files.id))
		.all())
		if (file.trackId) paths.set(file.trackId, file.path);
	return matches.flatMap((match) => {
		const track = found.get(match.trackId);
		return track
			? [
					{
						trackId: match.trackId,
						kind: match.kind,
						confidence: match.confidence,
						version: match.version,
						format: match.format,
						bitrate: match.bitrate,
						artist: track.artist,
						title: track.title ?? "Untitled",
						mixName: track.mixName,
						sampleRate: track.sampleRate,
						durationMs: track.durationMs,
						size: track.size,
						path: paths.get(match.trackId) ?? null,
						genre: track.genre,
						key: track.key,
						bpm: track.bpm,
						year: track.year,
					},
				]
			: [];
	});
}
