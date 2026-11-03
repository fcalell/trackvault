import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { selector, z } from "@fcalell/plugin-api/schema";
import { sql } from "@fcalell/plugin-db/orm";
import { tracks } from "../../schema/index.ts";
import { db } from "../../server/lib/db.ts";
import { libraryWhere } from "../../server/lib/library-query.ts";
import {
	playlistSource,
	selectionIds,
} from "../../server/lib/playlist-selection.ts";
import { addMembers, createNode } from "../../server/lib/playlists.ts";
import {
	flowOf,
	mixTracks,
	readDraft,
	SET_LIMIT,
	suggestAfter,
	writeDraft,
} from "../../server/lib/sets.ts";
import { notifyPlaylists } from "../../server/lib/sync/wake.ts";

const trackView = z.object({
	id: z.string(),
	title: z.string().nullable(),
	mixName: z.string().nullable(),
	artist: z.string().nullable(),
	bpm: z.number().nullable(),
	key: z.string().nullable(),
	energy: z.number().nullable(),
	genre: z.string().nullable(),
	hasArt: z.boolean(),
});

const view = (t: {
	id: string;
	title: string | null;
	mixName: string | null;
	artist: string | null;
	bpm?: number | null;
	key?: string | null;
	energy?: number | null;
	genre?: string | null;
	hasArt: boolean;
}) => ({
	id: t.id,
	title: t.title,
	mixName: t.mixName,
	artist: t.artist,
	bpm: t.bpm ?? null,
	key: t.key ?? null,
	energy: t.energy ?? null,
	genre: t.genre ?? null,
	hasArt: t.hasArt,
});

const options = z.object({
	pitch: z.number().min(0).max(20).default(8),
	direction: z.enum(["up", "flat", "down"]).default("flat"),
});

const add = (ids: readonly string[]): number => {
	const have = readDraft();
	const known = new Set(have);
	const next = [...have];
	for (const id of ids) if (!known.has(id)) next.push(id);
	if (next.length > SET_LIMIT)
		throw new ApiError("BAD_REQUEST", {
			message: `A set holds at most ${SET_LIMIT} tracks`,
		});
	writeDraft(next);
	return next.length - have.length;
};

// The set builder: a draft set (one at a time), the next-track suggestions after
// its last track, the flow of its transitions, and saving it as a playlist.
export const sets = {
	draft: procedure({ auth: true, reads: ["setDrafts", "tracks"] })
		.input(options)
		.output(
			z.object({
				tracks: z.array(
					trackView.extend({
						// The score of the step from the track before; null for the first.
						score: z.number().nullable(),
						weak: z.boolean(),
						why: z.string().nullable(),
					}),
				),
				average: z.number(),
				weak: z.number(),
				curve: z.array(
					z.object({
						id: z.string(),
						bpm: z.number().nullable(),
						camelot: z.string().nullable(),
						energy: z.number().nullable(),
					}),
				),
			}),
		)
		.query(({ input }) => {
			const list = mixTracks(readDraft());
			const flow = flowOf(list, {
				pitchRangePercent: input.pitch,
				energyDirection: input.direction,
			});
			return {
				tracks: list.map((track, i) => {
					const step = i === 0 ? undefined : flow.transitions[i - 1];
					return {
						...view(track),
						score: step ? Math.round(step.score * 100) : null,
						weak: step ? flow.weak.includes(step.index) : false,
						why: step?.explanation ?? null,
					};
				}),
				average: Math.round(flow.average * 100),
				weak: flow.weak.length,
				curve: flow.curve.map((c) => ({ ...c, id: String(c.id) })),
			};
		}),

	// Tracks that could follow the set's last track (or `from`), best first, with why.
	suggest: procedure({ auth: true, reads: ["setDrafts", "tracks"] })
		.input(
			options.extend({
				from: z.string().optional(),
				limit: z.number().int().min(1).max(50).default(15),
			}),
		)
		.output(
			z.array(
				trackView.extend({
					score: z.number(),
					why: z.string(),
					lastPlayedAt: z.number().nullable(),
				}),
			),
		)
		.query(({ input }) => {
			const draft = readDraft();
			const fromId = input.from ?? draft[draft.length - 1];
			if (!fromId) return [];
			const [current] = mixTracks([fromId]);
			if (!current) return [];
			return suggestAfter(
				current,
				draft.includes(fromId) ? draft : [...draft, fromId],
				{
					pitchRangePercent: input.pitch,
					energyDirection: input.direction,
					limit: input.limit,
				},
			).map((row) => ({
				...view(row.track),
				score: Math.round(row.score * 100),
				why: row.explanation,
				lastPlayedAt: row.track.lastPlayedAt ?? null,
			}));
		}),

	// Library search for a track to start or extend the set with.
	find: procedure({ auth: true, reads: ["tracks"] })
		.input(z.object({ q: z.string().trim().default("") }))
		.output(z.array(trackView))
		.query(({ input }) => {
			if (input.q.length < 2) return [];
			return db()
				.select({
					id: tracks.id,
					title: tracks.title,
					mixName: tracks.mixName,
					artist: tracks.artist,
					bpm: tracks.bpm,
					key: tracks.key,
					energy: tracks.energy,
					genre: tracks.genre,
					hasArt: tracks.hasArt,
				})
				.from(tracks)
				.where(libraryWhere({ q: input.q }))
				.orderBy(sql`${tracks.title} collate nocase`)
				.limit(15)
				.all();
		}),

	append: procedure({ auth: true, writes: ["setDrafts"] })
		.input(z.object({ trackIds: z.array(z.string()).min(1).max(SET_LIMIT) }))
		.output(z.object({ added: z.number() }))
		.mutation(({ input }) => ({ added: add(input.trackIds) })),

	// A selection of the library, or a playlist's tracks in its order, goes on the set.
	appendSelection: procedure({ auth: true, writes: ["setDrafts"] })
		.input(z.object({ tracks: selector(playlistSource) }))
		.output(z.object({ added: z.number() }))
		.mutation(({ input }) => ({ added: add(selectionIds(input.tracks)) })),

	// Starts from a playlist: replaces the set with its tracks.
	fromPlaylist: procedure({ auth: true, writes: ["setDrafts"] })
		.input(z.object({ playlistId: z.string() }))
		.output(z.object({ added: z.number() }))
		.mutation(({ input }) => {
			writeDraft([]);
			return {
				added: add(
					selectionIds({
						query: { playlistId: input.playlistId },
						except: [],
					}),
				),
			};
		}),

	remove: procedure({ auth: true, writes: ["setDrafts"] })
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) => {
			writeDraft(readDraft().filter((id) => id !== input.id));
		}),

	// Moves a track to a place (0 is first).
	move: procedure({ auth: true, writes: ["setDrafts"] })
		.input(z.object({ id: z.string(), index: z.number().int().min(0) }))
		.mutation(({ input }) => {
			const rest = readDraft().filter((id) => id !== input.id);
			rest.splice(Math.min(input.index, rest.length), 0, input.id);
			writeDraft(rest);
		}),

	clear: procedure({ auth: true, writes: ["setDrafts"] }).mutation(() => {
		writeDraft([]);
	}),

	// Saves the set as a manual playlist, in its order.
	save: procedure({
		auth: true,
		writes: ["setDrafts", "playlists", "playlistTracks"],
	})
		.input(z.object({ name: z.string().trim().min(1, "Enter a name").max(80) }))
		.output(z.object({ id: z.string() }))
		.mutation(({ input }) => {
			const ids = readDraft();
			if (ids.length === 0)
				throw new ApiError("BAD_REQUEST", { message: "The set is empty" });
			const info = {
				batchId: randomUUID(),
				origin: "ui" as const,
				label: `Save set ${input.name}`,
			};
			const row = db().transaction((tx) => {
				const now = new Date();
				const node = createNode(
					tx,
					info,
					{ parentId: null, kind: "manual", name: input.name },
					now,
				);
				addMembers(tx, info, node.id, ids, now);
				return node;
			});
			notifyPlaylists();
			return { id: row.id };
		}),
};
