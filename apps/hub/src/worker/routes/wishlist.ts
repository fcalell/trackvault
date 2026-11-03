import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { selector, z } from "@fcalell/plugin-api/schema";
import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	notInArray,
	type SQL,
} from "@fcalell/plugin-db/orm";
import { composeTitle } from "@trackvault/core/normalize";
import { makeWant } from "@trackvault/core/playlist-import";
import {
	inboxItems,
	searchResults,
	tracks,
	wishlist as wishlistTable,
} from "../../schema/index.ts";
import wishlistJob, { searchIdOf } from "../../server/jobs/wishlist.ts";
import { db } from "../../server/lib/db.ts";
import { losslessOf } from "../../server/lib/lossless.ts";
import { NotConfigured, slskdConfigured } from "../../server/lib/slskd.ts";
import {
	addWants,
	setStatus,
	type WantRow,
	wantKey as wantKeyOf,
} from "../../server/lib/wishlist.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { formatScoreOf, WISHLIST_VIEWS } from "../../shared/acquire.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const VIEW_STATUSES: Record<
	(typeof WISHLIST_VIEWS)[number],
	WantRow["status"][]
> = {
	active: ["wanted", "searching", "downloading", "downloaded"],
	found: ["found"],
	done: ["in-library"],
	closed: ["gave-up", "ignored"],
};

const filter = z.object({ view: z.enum(WISHLIST_VIEWS).optional() });
const wantsInput = selector(filter);

const whereOf = (f: z.infer<typeof filter>): SQL | undefined =>
	f.view ? inArray(wishlistTable.status, VIEW_STATUSES[f.view]) : undefined;

const wantRow = z.object({
	id: z.number(),
	artist: z.string(),
	title: z.string(),
	status: z.enum([
		"wanted",
		"searching",
		"found",
		"downloading",
		"downloaded",
		"in-library",
		"gave-up",
		"ignored",
	]),
	source: z.string(),
	sourceRef: z.string(),
	attempts: z.number(),
	lastAttemptAt: z.date().nullable(),
	nextSearchAt: z.date().nullable(),
	bestScore: z.number().nullable(),
	note: z.string().nullable(),
	betterCopy: z.boolean(),
	// The library track a filed download of this want became.
	trackId: z.string().nullable(),
	createdAt: z.date(),
});

const asRow = (
	row: WantRow,
	trackId: string | null,
): z.infer<typeof wantRow> => ({
	id: row.id,
	artist: row.artist,
	title: composeTitle(row.title, row.mix),
	status: row.status,
	source: row.source,
	sourceRef: row.sourceRef,
	attempts: row.attempts,
	lastAttemptAt: row.lastAttemptAt,
	nextSearchAt: row.nextSearchAt,
	bestScore: row.bestScore,
	note: row.note,
	betterCopy: row.betterThanTrackId !== null,
	trackId,
	createdAt: row.createdAt,
});

// The track each want's filed download became, by want id.
function filedTracks(ids: readonly number[]): Map<number, string> {
	const filed = new Map<number, string>();
	if (ids.length === 0) return filed;
	for (const item of db()
		.select({ wantId: inboxItems.wantId, trackId: inboxItems.trackId })
		.from(inboxItems)
		.where(
			and(inArray(inboxItems.wantId, [...ids]), isNotNull(inboxItems.trackId)),
		)
		.all())
		if (item.wantId !== null && item.trackId !== null)
			filed.set(item.wantId, item.trackId);
	return filed;
}

function idsOf(selection: z.infer<typeof wantsInput>): number[] {
	const raw =
		"ids" in selection
			? selection.ids
			: db()
					.select({ id: wishlistTable.id })
					.from(wishlistTable)
					.where(
						and(
							whereOf(selection.query),
							selection.except.length > 0
								? notInArray(wishlistTable.id, selection.except.map(Number))
								: undefined,
						),
					)
					.all()
					.map((row) => String(row.id));
	return raw.map(Number).filter((n) => Number.isInteger(n));
}

export const wishlist = {
	// The wants in windows, newest first, for one view of them.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["wishlist", "inboxItems"],
	})
		.input(filter)
		.query(({ input }) => {
			const database = db();
			const where = whereOf(input);
			const rows = database
				.select()
				.from(wishlistTable)
				.where(where)
				.orderBy(desc(wishlistTable.createdAt), desc(wishlistTable.id))
				.limit(input.limit)
				.offset(input.offset)
				.all();
			const filed = filedTracks(rows.map((row) => row.id));
			const total =
				database.select({ n: count() }).from(wishlistTable).where(where).get()
					?.n ?? 0;
			return {
				data: rows.map((row) => asRow(row, filed.get(row.id) ?? null)),
				total,
				offset: input.offset,
			};
		}),

	counts: procedure({ auth: true, reads: ["wishlist"] })
		.output(z.record(z.enum(WISHLIST_VIEWS), z.number()))
		.query(() => {
			const rows = db()
				.select({ status: wishlistTable.status, n: count() })
				.from(wishlistTable)
				.groupBy(wishlistTable.status)
				.all();
			const out = { active: 0, found: 0, done: 0, closed: 0 };
			for (const view of WISHLIST_VIEWS)
				for (const row of rows)
					if (VIEW_STATUSES[view].includes(row.status)) out[view] += row.n;
			return out;
		}),

	// One want, and the number of candidates its last search kept.
	get: procedure({
		auth: true,
		reads: ["wishlist", "searchResults", "inboxItems"],
	})
		.input(z.object({ id: z.number().int() }))
		.output(wantRow.extend({ candidates: z.number() }))
		.query(({ input }) => {
			const row = db()
				.select()
				.from(wishlistTable)
				.where(eq(wishlistTable.id, input.id))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			const candidates =
				db()
					.select({ n: count() })
					.from(searchResults)
					.where(eq(searchResults.searchId, searchIdOf(row.id)))
					.get()?.n ?? 0;
			return {
				...asRow(row, filedTracks([row.id]).get(row.id) ?? null),
				candidates,
			};
		}),

	add: procedure({ auth: true, writes: ["wishlist"] })
		.input(
			z.object({
				artist: z.string().trim().min(1, "Enter the artist"),
				title: z.string().trim().min(1, "Enter the title"),
				mix: z.string().trim().optional(),
			}),
		)
		.output(z.object({ id: z.number(), added: z.boolean() }))
		.mutation(({ input }) => {
			const want = makeWant("manual", "manual", input.artist, input.title, {
				mix: input.mix || null,
			});
			if (!want)
				throw new ApiError("BAD_REQUEST", {
					message: "Enter an artist and a title",
				});
			const made = addWants([want]);
			const id =
				made.ids[0] ??
				db()
					.select({ id: wishlistTable.id })
					.from(wishlistTable)
					.where(eq(wishlistTable.key, wantKeyOf(want)))
					.get()?.id;
			if (id === undefined) throw new ApiError("INTERNAL_SERVER_ERROR");
			return { id, added: made.added > 0 };
		}),

	// "Find a better version" of a library track: a want that only a copy of higher
	// quality than the library's own satisfies.
	addFromTrack: procedure({
		auth: true,
		writes: ["wishlist"],
		reads: ["tracks"],
	})
		.input(z.object({ trackId: z.string() }))
		.output(z.object({ id: z.number(), added: z.boolean() }))
		.mutation(({ input }) => {
			const track = db()
				.select()
				.from(tracks)
				.where(eq(tracks.id, input.trackId))
				.get();
			if (!track) throw new ApiError("NOT_FOUND");
			if (!track.artist || !track.title)
				throw new ApiError("BAD_REQUEST", {
					message: "Give the track an artist and a title first.",
				});
			const have = losslessOf(track.format, track.codec)
				? 0.95
				: formatScoreOf(track.format, track.bitrate);
			if (have >= 0.95)
				throw new ApiError("BAD_REQUEST", {
					message: "This track is already lossless.",
				});
			const want = makeWant(
				"manual",
				`track:${track.id}`,
				track.artist,
				track.title,
				{
					durationSec: track.durationMs ? track.durationMs / 1000 : null,
				},
			);
			if (!want)
				throw new ApiError("BAD_REQUEST", {
					message: "The track has no usable name",
				});
			const made = addWants([want], {
				betterThanTrackId: track.id,
				minFormatScore: have + 0.001,
				note: `Better than ${track.format.toUpperCase()}${track.bitrate ? ` ${track.bitrate} kbps` : ""}`,
			});
			const id =
				made.ids[0] ??
				db()
					.select({ id: wishlistTable.id })
					.from(wishlistTable)
					.where(eq(wishlistTable.key, wantKeyOf(want)))
					.get()?.id;
			if (id === undefined) throw new ApiError("INTERNAL_SERVER_ERROR");
			return { id, added: made.added > 0 };
		}),

	// Searches these wants now, due or not.
	searchNow: procedure({ auth: true, writes: ["wishlist", "jobs"] })
		.input(z.object({ wants: wantsInput }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			if (!slskdConfigured())
				throw new ApiError("BAD_REQUEST", {
					message: new NotConfigured().message,
				});
			const ids = idsOf(input.wants);
			if (ids.length === 0)
				throw new ApiError("BAD_REQUEST", { message: "Choose wants first." });
			return enqueue(wishlistJob, { wantIds: ids });
		}),

	// A run over the wants that are due now.
	searchDue: procedure({ auth: true, writes: ["wishlist", "jobs"] })
		.output(jobViewSchema)
		.mutation(() => {
			if (!slskdConfigured())
				throw new ApiError("BAD_REQUEST", {
					message: new NotConfigured().message,
				});
			return enqueue(
				wishlistJob,
				{},
				{ reuse: (existing) => !existing.wantIds },
			);
		}),

	// Leaves a want alone (ignored), or takes it up again.
	ignore: procedure({ auth: true, writes: ["wishlist"] })
		.input(z.object({ wants: wantsInput, ignored: z.boolean() }))
		.mutation(({ input }) => {
			for (const id of idsOf(input.wants))
				setStatus(id, input.ignored ? "ignored" : "wanted", {
					nextSearchAt: null,
				});
		}),

	remove: procedure({ auth: true, writes: ["wishlist", "searchResults"] })
		.input(z.object({ wants: wantsInput }))
		.mutation(({ input }) => {
			const ids = idsOf(input.wants);
			for (let i = 0; i < ids.length; i += 400) {
				const group = ids.slice(i, i + 400);
				db()
					.delete(wishlistTable)
					.where(inArray(wishlistTable.id, group))
					.run();
				db()
					.delete(searchResults)
					.where(inArray(searchResults.searchId, group.map(searchIdOf)))
					.run();
			}
		}),
};
