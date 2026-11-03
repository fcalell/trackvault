import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { selector, z } from "@fcalell/plugin-api/schema";
import { asc, count, eq, sql, sum } from "@fcalell/plugin-db/orm";
import {
	playlists as playlistsTable,
	playlistTracks,
	tracks,
} from "../../schema/index.ts";
import playlistAdd from "../../server/jobs/playlist-add.ts";
import playlistRemove from "../../server/jobs/playlist-remove.ts";
import { CHUNK } from "../../server/lib/changes.ts";
import { db } from "../../server/lib/db.ts";
import { SORT_COLUMNS } from "../../server/lib/library-query.ts";
import { playlistPage, smartCount } from "../../server/lib/playlist-query.ts";
import { playlistSource } from "../../server/lib/playlist-selection.ts";
import {
	addMembers,
	createNode,
	getPlaylist,
	isSmart,
	moveMember,
	moveNode,
	PlaylistError,
	removeNode,
	renameNode,
	setRule,
	smartWhere,
} from "../../server/lib/playlists.ts";
import { notifyPlaylists } from "../../server/lib/sync/wake.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";
import {
	SMART_SORTS,
	type SmartSort,
	type StoredSmart,
} from "../../shared/playlists.ts";
import { formatLines, parseLines } from "../../shared/smart-lines.ts";

const name = z.string().trim().min(1, "Enter a name").max(80);
const parentId = z.string().nullable().optional();

const smartInput = {
	match: z.enum(["all", "any"]).default("all"),
	conditions: z.array(z.string()).default([]),
	sortBy: z.enum(SMART_SORTS).optional(),
	descending: z.boolean().optional(),
	limit: z.number().int().min(1).max(50_000).optional(),
};

function smartOf(input: {
	match: "all" | "any";
	conditions: string[];
	sortBy?: SmartSort | undefined;
	descending?: boolean | undefined;
	limit?: number | undefined;
}): StoredSmart {
	let rule: StoredSmart["rule"];
	try {
		rule = parseLines(input.match, input.conditions);
	} catch (error) {
		throw new ApiError("BAD_REQUEST", {
			message:
				error instanceof Error ? error.message : "That rule is not valid",
		});
	}
	const def: StoredSmart = { rule };
	if (input.sortBy)
		def.sort = { field: input.sortBy, dir: input.descending ? "desc" : "asc" };
	if (input.limit) def.limit = input.limit;
	return def;
}

// A playlist's own mistakes (a deleted folder, a smart playlist given tracks) answer as
// the owner's to fix.
function guard<T>(run: () => T): T {
	try {
		return run();
	} catch (error) {
		if (error instanceof PlaylistError)
			throw new ApiError("BAD_REQUEST", { message: error.message });
		throw error;
	}
}

const info = (label: string) => ({
	batchId: randomUUID(),
	origin: "ui" as const,
	label,
});

export const playlists = {
	// Every folder and playlist, flat in tree order for the client to nest: a manual
	// playlist's count is its rows, a smart one's what its rule matches now.
	tree: procedure({
		auth: true,
		reads: ["playlists", "playlistTracks", "tracks"],
	}).query(() => {
		const database = db();
		const rows = database
			.select()
			.from(playlistsTable)
			.orderBy(asc(playlistsTable.position), asc(playlistsTable.id))
			.all();
		const counts = new Map(
			database
				.select({ id: playlistTracks.playlistId, n: count() })
				.from(playlistTracks)
				.groupBy(playlistTracks.playlistId)
				.all()
				.map((row) => [row.id, row.n]),
		);
		return rows.map((row) => ({
			id: row.id,
			parentId: row.parentId,
			kind: row.kind,
			name: row.name,
			position: row.position,
			// A smart playlist's conditions, one sentence.
			rule:
				row.kind === "smart" && isSmart(row.rule)
					? (formatLines((row.rule as StoredSmart).rule)?.lines.join("; ") ??
						null)
					: null,
			tracks:
				row.kind === "manual"
					? (counts.get(row.id) ?? 0)
					: row.kind === "smart" && isSmart(row.rule)
						? smartCount(database, row.rule as StoredSmart)
						: 0,
		}));
	}),

	// One playlist, with its track count and length, and a smart one's rule in the editor's words.
	get: procedure({ auth: true, reads: ["playlists", "playlistTracks"] })
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			const row = getPlaylist(input.id);
			if (!row) throw new ApiError("NOT_FOUND");
			const def = isSmart(row.rule) ? (row.rule as StoredSmart) : null;
			const lines = def ? formatLines(def.rule) : null;
			const held = def
				? db()
						.select({ n: count(), ms: sum(tracks.durationMs) })
						.from(tracks)
						.where(smartWhere(def))
						.get()
				: db()
						.select({ n: count(), ms: sum(tracks.durationMs) })
						.from(playlistTracks)
						.innerJoin(tracks, eq(tracks.id, playlistTracks.trackId))
						.where(eq(playlistTracks.playlistId, row.id))
						.get();
			return {
				id: row.id,
				parentId: row.parentId,
				kind: row.kind,
				name: row.name,
				tracks: held?.n ?? 0,
				durationMs: Number(held?.ms ?? 0),
				rule: def
					? {
							editable: lines !== null,
							match: lines?.match ?? ("all" as const),
							conditions: lines?.lines ?? [],
							sortBy: def.sort?.field,
							descending: def.sort ? def.sort.dir === "desc" : undefined,
							limit: def.limit,
						}
					: null,
			};
		}),

	// The playlist as library rows, a window at a time. Unsorted, the playlist's own order.
	tracks: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		sort: SORT_COLUMNS,
		reads: ["playlists", "playlistTracks", "tracks"],
	})
		.input(z.object({ playlistId: z.string() }))
		.query(async ({ input }) => {
			const page = await playlistPage(db(), input);
			if (!page) throw new ApiError("NOT_FOUND");
			return page;
		}),

	create: procedure({ auth: true, writes: ["playlists"] })
		.input(
			z.object({
				name,
				kind: z.enum(["manual", "folder"]).default("manual"),
				parentId,
			}),
		)
		.mutation(({ input }) =>
			guard(() => {
				const row = db().transaction((tx) =>
					createNode(
						tx,
						info(input.kind === "folder" ? "New folder" : "New playlist"),
						{
							parentId: input.parentId ?? null,
							kind: input.kind,
							name: input.name,
						},
						new Date(),
					),
				);
				notifyPlaylists();
				return { id: row.id };
			}),
		),

	createSmart: procedure({ auth: true, writes: ["playlists"] })
		.input(z.object({ name, parentId, ...smartInput }))
		.mutation(({ input }) =>
			guard(() => {
				const def = smartOf(input);
				const row = db().transaction((tx) =>
					createNode(
						tx,
						info("New smart playlist"),
						{
							parentId: input.parentId ?? null,
							kind: "smart",
							name: input.name,
							rule: def,
						},
						new Date(),
					),
				);
				notifyPlaylists();
				return { id: row.id };
			}),
		),

	updateSmart: procedure({ auth: true, writes: ["playlists"] })
		.input(z.object({ id: z.string(), ...smartInput }))
		.mutation(({ input }) =>
			guard(() => {
				const def = smartOf(input);
				db().transaction((tx) =>
					setRule(tx, info("Change smart rule"), input.id, def, new Date()),
				);
				notifyPlaylists();
			}),
		),

	// What a rule would hold now, without saving it: the count and the first few tracks.
	preview: procedure({ auth: true, reads: ["tracks"] })
		.input(z.object({ ...smartInput }))
		.query(({ input }) => {
			const def = smartOf(input);
			const database = db();
			const rows = database
				.select({ id: tracks.id, title: tracks.title, artist: tracks.artist })
				.from(tracks)
				.where(smartWhere(def))
				.orderBy(sql`${tracks.title} collate nocase`, tracks.id)
				.limit(8)
				.all();
			return { count: smartCount(database, def), sample: rows };
		}),

	rename: procedure({ auth: true, writes: ["playlists"] })
		.input(z.object({ id: z.string(), name }))
		.mutation(({ input }) =>
			guard(() => {
				db().transaction((tx) =>
					renameNode(
						tx,
						info("Rename playlist"),
						input.id,
						input.name,
						new Date(),
					),
				);
				notifyPlaylists();
			}),
		),

	// Moves a playlist or folder into a folder (null: the top) between two siblings.
	move: procedure({ auth: true, writes: ["playlists"] })
		.input(
			z.object({
				id: z.string(),
				parentId: z.string().nullable(),
				after: z.string().nullable().optional(),
				before: z.string().nullable().optional(),
			}),
		)
		.mutation(({ input }) =>
			guard(() => {
				db().transaction((tx) =>
					moveNode(
						tx,
						info("Move playlist"),
						input.id,
						input.parentId,
						input.after ?? null,
						input.before ?? null,
						new Date(),
					),
				);
				notifyPlaylists();
			}),
		),

	remove: procedure({ auth: true, writes: ["playlists", "playlistTracks"] })
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			guard(() => {
				const row = getPlaylist(input.id);
				if (!row) return;
				db().transaction((tx) =>
					removeNode(tx, info(`Delete ${row.name}`), input.id, new Date()),
				);
				notifyPlaylists();
			}),
		),

	// Adds a selection of the library. A few named tracks go in at once; a query or a
	// long list is a job.
	add: procedure({ auth: true, writes: ["playlistTracks", "jobs"] })
		.input(
			z.object({ playlistId: z.string(), tracks: selector(playlistSource) }),
		)
		.output(z.object({ added: z.number(), job: jobViewSchema.nullable() }))
		.mutation(({ input }) =>
			guard(() => {
				const playlist = getPlaylist(input.playlistId);
				if (!playlist) throw new PlaylistError("That playlist is gone");
				if (playlist.kind !== "manual")
					throw new PlaylistError(
						playlist.kind === "smart"
							? "A smart playlist fills itself from its rule"
							: "Choose a playlist, not a folder",
					);
				if ("ids" in input.tracks && input.tracks.ids.length <= CHUNK) {
					const ids = input.tracks.ids;
					const added = db().transaction((tx) =>
						addMembers(
							tx,
							info(`Add to ${playlist.name}`),
							input.playlistId,
							ids,
							new Date(),
						),
					);
					if (added > 0) notifyPlaylists();
					return { added, job: null };
				}
				const job = enqueue(playlistAdd, {
					playlistId: input.playlistId,
					tracks: input.tracks,
				});
				return { added: 0, job };
			}),
		),

	// Takes tracks out of a manual playlist: the ticked ones, or all but the unticked.
	removeTracks: procedure({ auth: true, writes: ["playlistTracks", "jobs"] })
		.input(
			z.object({
				playlistId: z.string(),
				tracks: selector(z.object({ playlistId: z.string() })),
			}),
		)
		.output(z.object({ removed: z.number(), job: jobViewSchema.nullable() }))
		.mutation(({ input }) =>
			guard(() => {
				const picked = input.tracks;
				if ("ids" in picked && picked.ids.length <= CHUNK) {
					const playlist = getPlaylist(input.playlistId);
					const removed = db().transaction((tx) =>
						removeMembersFor(
							tx,
							input.playlistId,
							picked.ids,
							playlist?.name ?? "",
						),
					);
					if (removed > 0) notifyPlaylists();
					return { removed, job: null };
				}
				const job = enqueue(
					playlistRemove,
					"ids" in picked
						? { playlistId: input.playlistId, ids: picked.ids }
						: { playlistId: input.playlistId, except: picked.except },
				);
				return { removed: 0, job };
			}),
		),

	// Moves one track of a manual playlist between two others: one number is written.
	reorder: procedure({ auth: true, writes: ["playlistTracks"] })
		.input(
			z.object({
				playlistId: z.string(),
				trackId: z.string(),
				after: z.string().nullable().optional(),
				before: z.string().nullable().optional(),
			}),
		)
		.mutation(({ input }) =>
			guard(() => {
				db().transaction((tx) =>
					moveMember(
						tx,
						info("Reorder playlist"),
						input.playlistId,
						input.trackId,
						input.after ?? null,
						input.before ?? null,
						new Date(),
					),
				);
				notifyPlaylists();
			}),
		),

	// The playlists a track is in (its record lists them).
	forTrack: procedure({ auth: true, reads: ["playlists", "playlistTracks"] })
		.input(z.object({ trackId: z.string() }))
		.query(({ input }) =>
			db()
				.select({ id: playlistsTable.id, name: playlistsTable.name })
				.from(playlistTracks)
				.innerJoin(
					playlistsTable,
					eq(playlistsTable.id, playlistTracks.playlistId),
				)
				.where(eq(playlistTracks.trackId, input.trackId))
				.orderBy(sql`${playlistsTable.name} collate nocase`)
				.all(),
		),
};

import type { Tx } from "../../server/lib/db.ts";
import { removeMembers } from "../../server/lib/playlists.ts";

function removeMembersFor(
	tx: Tx,
	playlistId: string,
	ids: string[],
	name: string,
): number {
	return removeMembers(
		tx,
		info(`Remove from ${name}`),
		playlistId,
		ids,
		new Date(),
	);
}
