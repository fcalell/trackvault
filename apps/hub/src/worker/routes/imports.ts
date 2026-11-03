import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { and, asc, count, desc, eq, inArray } from "@fcalell/plugin-db/orm";
import { composeTitle } from "@trackvault/core/normalize";
import type { NewWant } from "@trackvault/core/wishlist";
import {
	importItems,
	imports as importsTable,
	settings as settingsTable,
	tracks,
	wishlist as wishlistTable,
} from "../../schema/index.ts";
import playlistImport from "../../server/jobs/playlist-import.ts";
import wishlistJob from "../../server/jobs/wishlist.ts";
import { db } from "../../server/lib/db.ts";
import {
	addMembers,
	createNode,
	PlaylistError,
} from "../../server/lib/playlists.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { NotConfigured, slskdConfigured } from "../../server/lib/slskd.ts";
import { notifyPlaylists } from "../../server/lib/sync/wake.ts";
import { addWants, wantKey } from "../../server/lib/wishlist.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const STATUSES = ["matched", "missing", "uncertain", "other-version"] as const;

const importView = z.object({
	id: z.string(),
	name: z.string(),
	source: z.string(),
	ref: z.string(),
	state: z.enum(["parsing", "ready", "failed"]),
	error: z.string().nullable(),
	warnings: z.array(z.string()),
	tracks: z.number(),
	matched: z.number(),
	missing: z.number(),
	uncertain: z.number(),
	otherVersion: z.number(),
	playlistId: z.string().nullable(),
	createdAt: z.date(),
});
type ImportView = z.infer<typeof importView>;

function viewOf(row: typeof importsTable.$inferSelect): ImportView {
	const counts = db()
		.select({ status: importItems.status, n: count() })
		.from(importItems)
		.where(eq(importItems.importId, row.id))
		.groupBy(importItems.status)
		.all();
	const n = (status: (typeof STATUSES)[number]) =>
		counts.find((c) => c.status === status)?.n ?? 0;
	const matched = n("matched");
	const missing = n("missing");
	const uncertain = n("uncertain");
	const otherVersion = n("other-version");
	return {
		id: row.id,
		name: row.name,
		source: row.source,
		ref: row.ref,
		state: row.state,
		error: row.error,
		warnings: row.warnings as string[],
		tracks: matched + missing + uncertain + otherVersion,
		matched,
		missing,
		uncertain,
		otherVersion,
		playlistId: row.playlistId,
		createdAt: row.createdAt,
	};
}

const item = z.object({
	id: z.number(),
	artist: z.string(),
	title: z.string(),
	status: z.enum(STATUSES),
	confidence: z.number(),
	// The library track it matched.
	match: z
		.object({
			id: z.string(),
			artist: z.string().nullable(),
			title: z.string().nullable(),
		})
		.nullable(),
	resolution: z.enum(["wishlist", "confirmed", "ignored"]).nullable(),
});

function getImport(id: string) {
	const row = db()
		.select()
		.from(importsTable)
		.where(eq(importsTable.id, id))
		.get();
	if (!row) throw new ApiError("NOT_FOUND");
	return row;
}

const wantOf = (row: typeof importItems.$inferSelect): NewWant => ({
	artist: row.artist,
	title: row.title,
	mix: row.mix,
	source: row.source as NewWant["source"],
	sourceRef: row.sourceRef,
	durationSec: row.durationSec,
	isrc: row.isrc,
	label: row.label,
});

const spotifyView = z.object({
	spotifyClientId: z.string().nullable(),
	spotifyClientSecret: z.string().nullable(),
});

const maskSecret = (v: string | null): string | null =>
	v ? `${"•".repeat(8)}${v.slice(-4)}` : null;

const spotifyOf = () => {
	const s = readSettings();
	return {
		spotifyClientId: s.spotifyClientId,
		spotifyClientSecret: maskSecret(s.spotifyClientSecret),
	};
};

export const imports = {
	// Starts an import (a job): a link, pasted text, or a picked file. The result screen
	// opens at the import's id while the job reads and matches.
	start: procedure({ auth: true, writes: ["imports", "importItems", "jobs"] })
		.input(
			z.object({
				url: z.string().trim().optional(),
				text: z.string().optional(),
				file: z.string().optional(),
				fileName: z.string().optional(),
				name: z.string().trim().optional(),
			}),
		)
		.output(z.object({ id: z.string(), job: jobViewSchema }))
		.mutation(({ input }) => {
			const text = (input.file || input.text || "").trim();
			if (!input.url && !text)
				throw new ApiError("BAD_REQUEST", {
					message: "Paste a link or some text, or pick a file.",
				});
			const id = randomUUID();
			db()
				.insert(importsTable)
				.values({
					id,
					name:
						input.name || input.fileName || input.url || "Imported playlist",
					source: "text",
					ref: input.url ?? input.fileName ?? "pasted text",
					state: "parsing",
					input: JSON.stringify({
						url: input.url || undefined,
						text: text || undefined,
						fileName: input.fileName || undefined,
					}),
					warnings: [],
					createdAt: new Date(),
				})
				.run();
			return { id, job: enqueue(playlistImport, { importId: id }) };
		}),

	list: procedure({ auth: true, reads: ["imports", "importItems"] })
		.output(z.array(importView))
		.query(() =>
			db()
				.select()
				.from(importsTable)
				.orderBy(desc(importsTable.createdAt))
				.limit(30)
				.all()
				.map(viewOf),
		),

	get: procedure({ auth: true, reads: ["imports", "importItems"] })
		.input(z.object({ id: z.string() }))
		.output(importView)
		.query(({ input }) => viewOf(getImport(input.id))),

	// The tracks of an import in the order they were listed, in windows.
	items: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["importItems", "tracks"],
	})
		.input(
			z.object({ importId: z.string(), status: z.enum(STATUSES).optional() }),
		)
		.query(({ input }) => {
			const database = db();
			const where = and(
				eq(importItems.importId, input.importId),
				input.status ? eq(importItems.status, input.status) : undefined,
			);
			const rows = database
				.select()
				.from(importItems)
				.where(where)
				.orderBy(asc(importItems.pos))
				.limit(input.limit)
				.offset(input.offset)
				.all();
			const best = rows
				.map((r) => (r.trackIds as string[])[0])
				.filter(Boolean) as string[];
			const matched = new Map<
				string,
				{
					id: string;
					artist: string | null;
					title: string | null;
				}
			>();
			if (best.length > 0)
				for (const t of database
					.select({
						id: tracks.id,
						title: tracks.title,
						artist: tracks.artist,
					})
					.from(tracks)
					.where(inArray(tracks.id, best))
					.all())
					matched.set(t.id, t);
			const data = rows.map((r) => {
				const trackId = (r.trackIds as string[])[0] ?? null;
				return {
					id: r.id,
					artist: r.artist,
					title: composeTitle(r.title, r.mix),
					status: r.status,
					confidence: r.confidence,
					match: trackId ? (matched.get(trackId) ?? null) : null,
					resolution: r.resolution,
				};
			});
			const total =
				database.select({ n: count() }).from(importItems).where(where).get()
					?.n ?? 0;
			return {
				data: data.map((row) => item.parse(row)),
				total,
				offset: input.offset,
			};
		}),

	// A TrackVault playlist from what matched (and the uncertain ones confirmed), in
	// the order of the source.
	createPlaylist: procedure({
		auth: true,
		writes: ["imports", "playlists", "playlistTracks"],
	})
		.input(
			z.object({ id: z.string(), name: z.string().trim().min(1).optional() }),
		)
		.output(z.object({ playlistId: z.string(), added: z.number() }))
		.mutation(({ input }) => {
			const row = getImport(input.id);
			if (row.state !== "ready")
				throw new ApiError("BAD_REQUEST", {
					message: "The import is not ready.",
				});
			const members = db()
				.select()
				.from(importItems)
				.where(
					and(
						eq(importItems.importId, row.id),
						eq(importItems.status, "matched"),
					),
				)
				.orderBy(asc(importItems.pos))
				.all()
				.map((r) => (r.trackIds as string[])[0])
				.filter((id): id is string => Boolean(id));
			if (members.length === 0)
				throw new ApiError("BAD_REQUEST", {
					message: "No track of this list is in the library.",
				});
			try {
				const info = {
					batchId: randomUUID(),
					origin: "ui" as const,
					label: "Playlist import",
				};
				const made = db().transaction((tx) => {
					const now = new Date();
					const node = createNode(
						tx,
						info,
						{ parentId: null, kind: "manual", name: input.name ?? row.name },
						now,
					);
					const added = addMembers(
						tx,
						info,
						node.id,
						[...new Set(members)],
						now,
					);
					tx.update(importsTable)
						.set({ playlistId: node.id })
						.where(eq(importsTable.id, row.id))
						.run();
					return { playlistId: node.id, added };
				});
				notifyPlaylists();
				return made;
			} catch (error) {
				if (error instanceof PlaylistError)
					throw new ApiError("BAD_REQUEST", { message: error.message });
				throw error;
			}
		}),

	// The missing tracks (and the ones owned only in another mix) go to the wishlist.
	addToWishlist: procedure({
		auth: true,
		writes: ["wishlist", "importItems"],
	})
		.input(z.object({ id: z.string() }))
		.output(z.object({ added: z.number(), existing: z.number() }))
		.mutation(({ input }) => {
			const rows = db()
				.select()
				.from(importItems)
				.where(
					and(
						eq(importItems.importId, input.id),
						inArray(importItems.status, ["missing", "other-version"]),
					),
				)
				.orderBy(asc(importItems.pos))
				.all();
			if (rows.length === 0)
				throw new ApiError("BAD_REQUEST", { message: "Nothing is missing." });
			const made = addWants(rows.map(wantOf));
			db()
				.update(importItems)
				.set({ resolution: "wishlist" })
				.where(
					inArray(
						importItems.id,
						rows.map((r) => r.id),
					),
				)
				.run();
			return { added: made.added, existing: made.existing };
		}),

	// Adds one missing track to the wishlist and searches Soulseek for it now.
	searchItem: procedure({
		auth: true,
		writes: ["wishlist", "importItems", "jobs"],
	})
		.input(z.object({ itemId: z.number().int() }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			if (!slskdConfigured())
				throw new ApiError("BAD_REQUEST", {
					message: new NotConfigured().message,
				});
			const row = db()
				.select()
				.from(importItems)
				.where(eq(importItems.id, input.itemId))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			const want = wantOf(row);
			const made = addWants([want]);
			const id =
				made.ids[0] ??
				db()
					.select({ id: wishlistTable.id })
					.from(wishlistTable)
					.where(eq(wishlistTable.key, wantKey(want)))
					.get()?.id;
			if (id === undefined) throw new ApiError("INTERNAL_SERVER_ERROR");
			db()
				.update(importItems)
				.set({ resolution: "wishlist" })
				.where(eq(importItems.id, row.id))
				.run();
			return enqueue(wishlistJob, { wantIds: [id] });
		}),

	// An uncertain match: the same track (it counts as matched), or not (it is missing).
	confirm: procedure({ auth: true, writes: ["importItems"] })
		.input(z.object({ itemId: z.number().int(), same: z.boolean() }))
		.mutation(({ input }) => {
			const row = db()
				.select()
				.from(importItems)
				.where(eq(importItems.id, input.itemId))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			db()
				.update(importItems)
				.set(
					input.same
						? { status: "matched", resolution: "confirmed" }
						: { status: "missing", resolution: null, trackIds: [] },
				)
				.where(eq(importItems.id, row.id))
				.run();
		}),

	remove: procedure({ auth: true, writes: ["imports", "importItems"] })
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) => {
			db().delete(importsTable).where(eq(importsTable.id, input.id)).run();
		}),

	spotify: procedure({ auth: true, reads: ["settings"] })
		.output(spotifyView)
		.query(() => spotifyOf()),

	updateSpotify: procedure({ auth: true, writes: ["settings"] })
		.input(
			z.object({
				spotifyClientId: z.string().trim().optional(),
				// A secret: null (or empty) takes it away, a value replaces it, absent keeps it.
				spotifyClientSecret: z.string().trim().nullable().optional(),
			}),
		)
		.output(spotifyView)
		.mutation(({ input }) => {
			readSettings();
			const orNull = (v: string | null): string | null => (v ? v : null);
			db()
				.update(settingsTable)
				.set({
					...(input.spotifyClientId !== undefined && {
						spotifyClientId: orNull(input.spotifyClientId),
					}),
					...(input.spotifyClientSecret !== undefined && {
						spotifyClientSecret: orNull(input.spotifyClientSecret),
					}),
					updatedAt: new Date(),
				})
				.where(eq(settingsTable.id, 1))
				.run();
			return spotifyOf();
		}),
};
