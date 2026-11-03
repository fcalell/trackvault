import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import {
	and,
	asc,
	count,
	eq,
	inArray,
	notInArray,
} from "@fcalell/plugin-db/orm";
import {
	downloads,
	searchResults,
	settings as settingsTable,
	tracks,
	wishlist,
} from "../../schema/index.ts";
import search from "../../server/jobs/search.ts";
import { db } from "../../server/lib/db.ts";
import { resultsByIds, startDownload } from "../../server/lib/downloads.ts";
import { readSettings } from "../../server/lib/settings.ts";
import {
	NotConfigured,
	slskdClient,
	slskdConfigured,
	slskdWords,
} from "../../server/lib/slskd.ts";
import {
	announceTransfer,
	removeTransferView,
} from "../../server/lib/transfers.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { WANTED_QUALITY } from "../../shared/acquire.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const settingsView = z.object({
	slskdUrl: z.string().nullable(),
	// The key is never sent back whole: its last four characters say which it is.
	slskdApiKey: z.string().nullable(),
	slskdDownloadsDir: z.string().nullable(),
	wantedQuality: z.enum(WANTED_QUALITY),
	slskdMaxQueue: z.number(),
	wishlistAutoDownload: z.boolean(),
	wishlistMinScore: z.number(),
	configured: z.boolean(),
});

const mask = (key: string | null): string | null =>
	key
		? `${"•".repeat(Math.max(4, Math.min(key.length - 4, 12)))}${key.slice(-4)}`
		: null;

function settingsOf() {
	const s = readSettings();
	return {
		slskdUrl: s.slskdUrl,
		slskdApiKey: mask(s.slskdApiKey),
		slskdDownloadsDir: s.slskdDownloadsDir,
		wantedQuality: s.wantedQuality,
		slskdMaxQueue: s.slskdMaxQueue,
		wishlistAutoDownload: s.wishlistAutoDownload,
		wishlistMinScore: s.wishlistMinScore,
		configured: slskdConfigured(),
	};
}

const resultRow = z.object({
	id: z.number(),
	username: z.string(),
	name: z.string(),
	folder: z.string(),
	size: z.number(),
	format: z.string(),
	bitrate: z.number().nullable(),
	sampleRate: z.number().nullable(),
	bitDepth: z.number().nullable(),
	lengthSec: z.number().nullable(),
	queueLength: z.number(),
	freeSlot: z.boolean(),
	artist: z.string().nullable(),
	title: z.string().nullable(),
	mix: z.string().nullable(),
	score: z.number(),
	rejected: z.boolean(),
	reasons: z.array(z.string()),
	needsCutoffCheck: z.boolean(),
	have: z.enum(["have", "other-version", "maybe", "none"]),
	haveTrackId: z.string().nullable(),
	haveLabel: z.string().nullable(),
	download: z.string().nullable(),
});

const parts = (path: string): string[] => path.split(/[\\/]+/).filter(Boolean);

export const soulseek = {
	settings: procedure({ auth: true, reads: ["settings"] })
		.output(settingsView)
		.query(() => settingsOf()),

	updateSettings: procedure({ auth: true, writes: ["settings"] })
		.input(
			z.object({
				slskdUrl: z
					.string()
					.trim()
					.refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), {
						message: "Enter an address like http://localhost:5030",
					})
					.optional(),
				slskdApiKey: z.string().trim().optional(),
				slskdDownloadsDir: z.string().trim().optional(),
				wantedQuality: z.enum(WANTED_QUALITY).optional(),
				slskdMaxQueue: z
					.number("Enter a number")
					.int("Enter a whole number")
					.min(0, "Enter 0 or more")
					.max(10_000, "Enter 10000 or less")
					.optional(),
				wishlistAutoDownload: z.boolean().optional(),
				wishlistMinScore: z
					.number("Enter a number")
					.int("Enter a whole number")
					.min(0, "Enter 0 or more")
					.max(100, "Enter 100 or less")
					.optional(),
			}),
		)
		.output(settingsView)
		.mutation(({ input }) => {
			readSettings();
			const orNull = (v: string): string | null => (v === "" ? null : v);
			db()
				.update(settingsTable)
				.set({
					...(input.slskdUrl !== undefined && {
						slskdUrl: orNull(input.slskdUrl),
					}),
					...(input.slskdApiKey !== undefined &&
						!input.slskdApiKey.includes("•") && {
							slskdApiKey: orNull(input.slskdApiKey),
						}),
					...(input.slskdDownloadsDir !== undefined && {
						slskdDownloadsDir: orNull(input.slskdDownloadsDir),
					}),
					...(input.wantedQuality !== undefined && {
						wantedQuality: input.wantedQuality,
					}),
					...(input.slskdMaxQueue !== undefined && {
						slskdMaxQueue: input.slskdMaxQueue,
					}),
					...(input.wishlistAutoDownload !== undefined && {
						wishlistAutoDownload: input.wishlistAutoDownload,
					}),
					...(input.wishlistMinScore !== undefined && {
						wishlistMinScore: input.wishlistMinScore,
					}),
					updatedAt: new Date(),
				})
				.where(eq(settingsTable.id, 1))
				.run();
			return settingsOf();
		}),

	// Asks slskd who it is and whether it is on the Soulseek network.
	test: procedure({ auth: true })
		.output(z.object({ message: z.string() }))
		.mutation(async () => {
			try {
				const client = slskdClient();
				const [app, server] = await Promise.all([
					client.application.state(),
					client.server.state(),
				]);
				const version = (app.version as { current?: string } | undefined)
					?.current;
				const where = server.isLoggedIn
					? `logged in as ${server.username ?? "?"}`
					: `Soulseek ${server.state}`;
				return {
					message: `Connected to slskd${version ? ` ${version}` : ""}, ${where}`,
				};
			} catch (error) {
				throw new ApiError("BAD_REQUEST", { message: slskdWords(error) });
			}
		}),

	// Starts a search (a job); its id is the search's id, and the results appear under it.
	search: procedure({ auth: true, writes: ["jobs", "searchResults"] })
		.input(
			z.object({ query: z.string().trim().min(2, "Enter what to search for") }),
		)
		.output(jobViewSchema)
		.mutation(({ input }) => {
			if (!slskdConfigured())
				throw new ApiError("BAD_REQUEST", {
					message: new NotConfigured().message,
				});
			return enqueue(search, { query: input.query });
		}),

	// The ranked candidates of a search or a want (`want-<id>`), best first, in windows.
	results: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["searchResults", "downloads", "tracks"],
	})
		.input(z.object({ searchId: z.string() }))
		.query(({ input }) => {
			const database = db();
			const where = eq(searchResults.searchId, input.searchId);
			const rows = database
				.select()
				.from(searchResults)
				.where(where)
				.orderBy(asc(searchResults.pos))
				.limit(input.limit)
				.offset(input.offset)
				.all();
			const trackIds = rows.flatMap((r) =>
				r.haveTrackId ? [r.haveTrackId] : [],
			);
			const labels = new Map<string, string>();
			if (trackIds.length > 0)
				for (const t of database
					.select({ id: tracks.id, title: tracks.title, artist: tracks.artist })
					.from(tracks)
					.where(inArray(tracks.id, trackIds))
					.all())
					labels.set(
						t.id,
						[t.artist, t.title ?? "Untitled"].filter(Boolean).join(" - "),
					);
			const requested = new Map<string, string>();
			if (rows.length > 0)
				for (const d of database
					.select({
						username: downloads.username,
						filename: downloads.filename,
						state: downloads.state,
					})
					.from(downloads)
					.where(
						inArray(
							downloads.username,
							rows.map((r) => r.username),
						),
					)
					.all())
					requested.set(`${d.username}\0${d.filename}`, d.state);
			const data = rows.map((r) => {
				const path = parts(r.filename);
				return {
					id: r.id,
					username: r.username,
					name: path.pop() ?? r.filename,
					folder: path.slice(-2).join(" / "),
					size: r.size,
					format: r.format,
					bitrate: r.bitrate,
					sampleRate: r.sampleRate,
					bitDepth: r.bitDepth,
					lengthSec: r.lengthSec,
					queueLength: r.queueLength,
					freeSlot: r.freeSlot,
					artist: r.artist,
					title: r.title,
					mix: r.mix,
					score: r.score,
					rejected: r.rejected,
					reasons: r.reasons as string[],
					needsCutoffCheck: r.needsCutoffCheck,
					have: r.have as "have" | "other-version" | "maybe" | "none",
					haveTrackId: r.haveTrackId,
					haveLabel: r.haveTrackId ? (labels.get(r.haveTrackId) ?? null) : null,
					download: requested.get(`${r.username}\0${r.filename}`) ?? null,
				};
			});
			const total =
				database.select({ n: count() }).from(searchResults).where(where).get()
					?.n ?? 0;
			return {
				data: data.map((row) => resultRow.parse(row)),
				total,
				offset: input.offset,
			};
		}),

	// Downloads one candidate; for a want's candidate the want is marked downloading.
	download: procedure({ auth: true, writes: ["downloads", "wishlist"] })
		.input(
			z.object({
				resultId: z.number().int(),
				wantId: z.number().int().optional(),
			}),
		)
		.output(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			const [candidate] = resultsByIds([input.resultId]);
			if (!candidate) throw new ApiError("NOT_FOUND");
			try {
				const id = await startDownload(
					slskdClient(),
					candidate,
					input.wantId ?? null,
				);
				return { id };
			} catch (error) {
				throw new ApiError("BAD_REQUEST", { message: slskdWords(error) });
			}
		}),

	// Stops a transfer (and drops slskd's record of it).
	cancel: procedure({ auth: true, writes: ["downloads", "wishlist"] })
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			const row = db()
				.select()
				.from(downloads)
				.where(eq(downloads.id, input.id))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			if (row.slskdId && slskdConfigured())
				await slskdClient()
					.downloads.cancel(row.username, row.slskdId, true)
					.catch(() => undefined);
			db()
				.update(downloads)
				.set({ state: "cancelled", updatedAt: new Date() })
				.where(eq(downloads.id, row.id))
				.run();
			if (row.wantId !== null)
				db()
					.update(wishlist)
					.set({ status: "wanted", updatedAt: new Date() })
					.where(
						and(
							eq(wishlist.id, row.wantId),
							eq(wishlist.status, "downloading"),
						),
					)
					.run();
			announceTransfer(row.id);
		}),

	// Asks for a failed or cancelled file again.
	retry: procedure({ auth: true, writes: ["downloads"] })
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input }) => {
			const row = db()
				.select()
				.from(downloads)
				.where(eq(downloads.id, input.id))
				.get();
			if (!row) throw new ApiError("NOT_FOUND");
			try {
				await startDownload(
					slskdClient(),
					{
						username: row.username,
						filename: row.filename,
						size: row.size,
						artist: row.artist,
						title: row.title,
						format: row.format ?? "",
						bitrate: row.bitrate,
						score: row.score ?? 0,
						needsCutoffCheck: row.needsCutoffCheck,
					},
					row.wantId,
				);
			} catch (error) {
				throw new ApiError("BAD_REQUEST", { message: slskdWords(error) });
			}
		}),

	// Takes the finished, failed and cancelled rows off the list.
	clear: procedure({ auth: true, writes: ["downloads"] }).mutation(() => {
		const done = db()
			.select({ id: downloads.id })
			.from(downloads)
			.where(
				notInArray(downloads.state, [
					"requested",
					"queued",
					"downloading",
					"completed",
				]),
			)
			.all();
		for (const row of done) removeTransferView(row.id);
		if (done.length > 0)
			db()
				.delete(downloads)
				.where(
					inArray(
						downloads.id,
						done.map((row) => row.id),
					),
				)
				.run();
	}),
};
