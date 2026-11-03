import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { and, asc, count, eq, sql } from "@fcalell/plugin-db/orm";
import {
	playlists as playlistsTable,
	playlistTracks,
	tracks,
} from "../../schema/index.ts";
import analyse from "../../server/jobs/analyse.ts";
import art from "../../server/jobs/art.ts";
import autotag from "../../server/jobs/autotag.ts";
import { CHUNK } from "../../server/lib/changes.ts";
import { db } from "../../server/lib/db.ts";
import { libraryWhere, prepareQuery } from "../../server/lib/library-query.ts";
import {
	addMembers,
	createNode,
	getPlaylist,
	PlaylistError,
} from "../../server/lib/playlists.ts";
import { mixTracks, suggestAfter } from "../../server/lib/sets.ts";
import { readSettings } from "../../server/lib/settings.ts";
import {
	addedPerMonth,
	bpmHistogram,
	formats,
	freshness,
	genres,
	keyWheel,
	played,
	totals,
} from "../../server/lib/stats.ts";
import { notifyPlaylists } from "../../server/lib/sync/wake.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { ISSUE_FILTERS } from "../../shared/library.ts";

// The procedures an MCP client may call (src/worker/mcp.ts lists them). Inputs are
// small, outputs compact, ids are the library's own track ids.

const filter = z.object({
	q: z
		.string()
		.optional()
		.describe("Words from the title, artist, label, album or genre"),
	genre: z.string().optional(),
	artist: z.string().optional(),
	key: z.string().optional().describe("Camelot key, e.g. 8A"),
	bpmMin: z.number().optional(),
	bpmMax: z.number().optional(),
	energy: z.number().int().min(1).max(10).optional(),
	neverPlayed: z.boolean().optional(),
	issue: z
		.enum(ISSUE_FILTERS)
		.optional()
		.describe("Only tracks with this problem, e.g. noArt, noGenre"),
});

const trackRow = z.object({
	id: z.string(),
	title: z.string().nullable(),
	artist: z.string().nullable(),
	mix: z.string().nullable(),
	genre: z.string().nullable(),
	bpm: z.number().nullable(),
	key: z.string().nullable(),
	energy: z.number().nullable(),
	year: z.number().nullable(),
	rating: z.number(),
	seconds: z.number().nullable(),
	plays: z.number(),
	lastPlayed: z.string().nullable(),
	added: z.string(),
});

const COLUMNS = {
	id: tracks.id,
	title: tracks.title,
	artist: tracks.artist,
	mix: tracks.mixName,
	genre: tracks.genre,
	bpm: tracks.bpm,
	key: tracks.key,
	energy: tracks.energy,
	year: tracks.year,
	rating: tracks.rating,
	durationMs: tracks.durationMs,
	plays: tracks.playCount,
	lastPlayedAt: tracks.lastPlayedAt,
	addedAt: tracks.addedAt,
};

const rowOf = (row: {
	id: string;
	title: string | null;
	artist: string | null;
	mix: string | null;
	genre: string | null;
	bpm: number | null;
	key: string | null;
	energy: number | null;
	year: number | null;
	rating: number;
	durationMs: number | null;
	plays: number;
	lastPlayedAt: Date | null;
	addedAt: Date;
}): z.infer<typeof trackRow> => ({
	id: row.id,
	title: row.title,
	artist: row.artist,
	mix: row.mix,
	genre: row.genre,
	bpm: row.bpm,
	key: row.key,
	energy: row.energy,
	year: row.year,
	rating: row.rating,
	seconds: row.durationMs ? Math.round(row.durationMs / 1000) : null,
	plays: row.plays,
	lastPlayed: row.lastPlayedAt?.toISOString() ?? null,
	added: row.addedAt.toISOString(),
});

const ids = z.array(z.string()).min(1).max(5000);

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
	origin: "mcp" as const,
	label,
});

// Tracks to work on: named ones, or everything a filter matches.
const target = z
	.object({
		trackIds: ids.optional(),
		filter: filter.optional(),
	})
	.refine((v) => v.trackIds || v.filter, {
		message: "Give trackIds or a filter",
	});

function selectionOf(input: z.infer<typeof target>) {
	return input.trackIds
		? { ids: input.trackIds }
		: { query: input.filter ?? {}, except: [] as string[] };
}

export const agent = {
	search: procedure({ auth: true, reads: ["tracks"] })
		.input(
			filter.extend({
				limit: z.number().int().min(1).max(50).default(20),
				offset: z.number().int().min(0).default(0),
				sort: z
					.enum(["title", "artist", "bpm", "added", "plays", "lastPlayed"])
					.default("title"),
			}),
		)
		.output(z.object({ total: z.number(), tracks: z.array(trackRow) }))
		.query(({ input }) => {
			const database = db();
			const { limit, offset, sort, ...rest } = input;
			const query = prepareQuery(database, rest, readSettings().libraryVersion);
			const where = libraryWhere(query);
			const order = {
				title: sql`${tracks.title} collate nocase`,
				artist: sql`${tracks.artist} collate nocase`,
				bpm: sql`${tracks.bpm}`,
				added: sql`${tracks.addedAt} desc`,
				plays: sql`${tracks.playCount} desc`,
				lastPlayed: sql`${tracks.lastPlayedAt} desc`,
			}[sort];
			return {
				total:
					database.select({ n: count() }).from(tracks).where(where).get()?.n ??
					0,
				tracks: database
					.select(COLUMNS)
					.from(tracks)
					.where(where)
					.orderBy(order, asc(tracks.id))
					.limit(limit)
					.offset(offset)
					.all()
					.map(rowOf),
			};
		}),

	track: procedure({ auth: true, reads: ["tracks"] })
		.input(z.object({ id: z.string() }))
		.output(
			trackRow.extend({
				album: z.string().nullable(),
				label: z.string().nullable(),
				lufs: z.number().nullable(),
				format: z.string(),
				bitrate: z.number().nullable(),
				hasArt: z.boolean(),
				comment: z.string().nullable(),
			}),
		)
		.query(({ input }) => {
			const full = db()
				.select({
					...COLUMNS,
					album: tracks.album,
					label: tracks.label,
					lufs: tracks.loudness,
					format: tracks.format,
					bitrate: tracks.bitrate,
					hasArt: tracks.hasArt,
					comment: tracks.comment,
				})
				.from(tracks)
				.where(eq(tracks.id, input.id))
				.get();
			if (!full) throw new ApiError("NOT_FOUND");
			return {
				...rowOf(full),
				album: full.album,
				label: full.label,
				lufs: full.lufs,
				format: full.format,
				bitrate: full.bitrate,
				hasArt: full.hasArt,
				comment: full.comment,
			};
		}),

	playlists: procedure({
		auth: true,
		reads: ["playlists", "playlistTracks"],
	})
		.output(
			z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					kind: z.enum(["folder", "manual", "smart"]),
					parentId: z.string().nullable(),
					tracks: z.number().nullable(),
				}),
			),
		)
		.query(() => {
			const database = db();
			const counts = new Map(
				database
					.select({ id: playlistTracks.playlistId, n: count() })
					.from(playlistTracks)
					.groupBy(playlistTracks.playlistId)
					.all()
					.map((row) => [row.id, row.n]),
			);
			return database
				.select()
				.from(playlistsTable)
				.orderBy(asc(playlistsTable.position))
				.all()
				.map((row) => ({
					id: row.id,
					name: row.name,
					kind: row.kind,
					parentId: row.parentId,
					tracks: row.kind === "manual" ? (counts.get(row.id) ?? 0) : null,
				}));
		}),

	playlistTracks: procedure({
		auth: true,
		reads: ["playlists", "playlistTracks", "tracks"],
	})
		.input(
			z.object({
				id: z.string(),
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.output(z.object({ total: z.number(), tracks: z.array(trackRow) }))
		.query(({ input }) => {
			const list = getPlaylist(input.id);
			if (list?.kind !== "manual") throw new ApiError("NOT_FOUND");
			const database = db();
			const where = eq(playlistTracks.playlistId, input.id);
			return {
				total:
					database
						.select({ n: count() })
						.from(playlistTracks)
						.where(where)
						.get()?.n ?? 0,
				tracks: database
					.select(COLUMNS)
					.from(playlistTracks)
					.innerJoin(tracks, eq(tracks.id, playlistTracks.trackId))
					.where(and(where))
					.orderBy(playlistTracks.position)
					.limit(input.limit)
					.offset(input.offset)
					.all()
					.map(rowOf),
			};
		}),

	stats: procedure({ auth: true, reads: ["tracks"] }).query(() => ({
		totals: totals(),
		formats: formats(),
		genres: genres(),
		bpm: bpmHistogram(),
		keys: keyWheel(),
		addedPerMonth: addedPerMonth(),
		mostPlayed: played().most,
		freshness: freshness(),
	})),

	nextTracks: procedure({ auth: true, reads: ["tracks"] })
		.input(
			z.object({
				trackId: z.string(),
				limit: z.number().int().min(1).max(30).default(10),
				pitchRangePercent: z.number().min(0).max(20).default(8),
				energy: z.enum(["up", "flat", "down"]).default("flat"),
				exclude: z.array(z.string()).max(500).default([]),
			}),
		)
		.output(
			z.array(
				z.object({
					id: z.string(),
					title: z.string().nullable(),
					artist: z.string().nullable(),
					bpm: z.number().nullable(),
					key: z.string().nullable(),
					energy: z.number().nullable(),
					score: z.number(),
					why: z.string(),
				}),
			),
		)
		.query(({ input }) => {
			const [current] = mixTracks([input.trackId]);
			if (!current) throw new ApiError("NOT_FOUND");
			return suggestAfter(current, [input.trackId, ...input.exclude], {
				limit: input.limit,
				pitchRangePercent: input.pitchRangePercent,
				energyDirection: input.energy,
			}).map((row) => ({
				id: row.track.id,
				title: row.track.title,
				artist: row.track.artist,
				bpm: row.track.bpm ?? null,
				key: row.track.key ?? null,
				energy: row.track.energy ?? null,
				score: Math.round(row.score * 100),
				why: row.explanation,
			}));
		}),

	addToPlaylist: procedure({ auth: true, writes: ["playlistTracks"] })
		.input(
			z.object({
				playlistId: z.string(),
				trackIds: z.array(z.string()).min(1).max(CHUNK),
			}),
		)
		.output(z.object({ added: z.number() }))
		.mutation(({ input }) =>
			guard(() => {
				const list = getPlaylist(input.playlistId);
				if (!list) throw new ApiError("NOT_FOUND");
				const added = db().transaction((tx) =>
					addMembers(
						tx,
						info(`Add to ${list.name} (Claude)`),
						input.playlistId,
						input.trackIds,
						new Date(),
					),
				);
				if (added > 0) notifyPlaylists();
				return { added };
			}),
		),

	createPlaylist: procedure({
		auth: true,
		writes: ["playlists", "playlistTracks"],
	})
		.input(
			z.object({
				name: z.string().trim().min(1).max(80),
				trackIds: z.array(z.string()).max(CHUNK).default([]),
			}),
		)
		.output(z.object({ id: z.string(), added: z.number() }))
		.mutation(({ input }) =>
			guard(() => {
				const batch = info(`New playlist ${input.name} (Claude)`);
				const out = db().transaction((tx) => {
					const now = new Date();
					const node = createNode(
						tx,
						batch,
						{ parentId: null, kind: "manual", name: input.name },
						now,
					);
					const added = addMembers(tx, batch, node.id, input.trackIds, now);
					return { id: node.id, added };
				});
				notifyPlaylists();
				return out;
			}),
		),

	queueAutotag: procedure({ auth: true, writes: ["jobs", "proposals"] })
		.input(target)
		.output(z.object({ jobId: z.string() }))
		.mutation(({ input }) => ({
			jobId: enqueue(autotag, { tracks: selectionOf(input) }).id,
		})),

	queueAnalyse: procedure({ auth: true, writes: ["jobs"] })
		.input(target)
		.output(z.object({ jobId: z.string() }))
		.mutation(({ input }) => ({
			jobId: enqueue(analyse, { tracks: selectionOf(input) }).id,
		})),

	queueArt: procedure({ auth: true, writes: ["jobs"] })
		.input(target)
		.output(z.object({ jobId: z.string() }))
		.mutation(({ input }) => ({
			jobId: enqueue(art, { tracks: selectionOf(input) }).id,
		})),
};
