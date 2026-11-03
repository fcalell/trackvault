import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { and, count, desc, eq, inArray } from "@fcalell/plugin-db/orm";
import { binaryAvailable } from "@trackvault/core/exec";
import {
	dupeGroups,
	dupeMembers,
	fingerprints,
	tracks,
} from "../../schema/index.ts";
import dedupe from "../../server/jobs/dedupe.ts";
import fingerprint from "../../server/jobs/fingerprint.ts";
import merge from "../../server/jobs/merge.ts";
import { db } from "../../server/lib/db.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

export const dupes = {
	// The open groups, the surest first, each with its members and its pre-picked
	// keeper and the reason it was kept.
	groups: procedure({
		auth: true,
		reads: ["dupeGroups", "dupeMembers", "tracks"],
	})
		.input(
			z.object({
				limit: z.number().int().min(1).max(500).default(100),
				state: z.enum(["open", "dismissed"]).default("open"),
			}),
		)
		.query(({ input }) => {
			const database = db();
			const groups = database
				.select()
				.from(dupeGroups)
				.where(eq(dupeGroups.state, input.state))
				.orderBy(
					desc(dupeGroups.confidence),
					desc(dupeGroups.size),
					dupeGroups.id,
				)
				.limit(input.limit)
				.all();
			const total =
				database
					.select({ n: count() })
					.from(dupeGroups)
					.where(eq(dupeGroups.state, input.state))
					.get()?.n ?? 0;
			const members = groups.length
				? database
						.select({
							groupId: dupeMembers.groupId,
							id: tracks.id,
							title: tracks.title,
							artist: tracks.artist,
							mixName: tracks.mixName,
							format: tracks.format,
							bitrate: tracks.bitrate,
							durationMs: tracks.durationMs,
							size: tracks.size,
						})
						.from(dupeMembers)
						.innerJoin(tracks, eq(tracks.id, dupeMembers.trackId))
						.where(
							inArray(
								dupeMembers.groupId,
								groups.map((group) => group.id),
							),
						)
						.all()
				: [];
			return {
				total,
				groups: groups.map((group) => ({
					id: group.id,
					reason: group.reason,
					confidence: group.confidence,
					keeperId: group.keeperId,
					keeperReason: group.keeperReason,
					members: members
						.filter((member) => member.groupId === group.id)
						.map(({ groupId: _groupId, ...member }) => member)
						.sort(
							(a, b) =>
								Number(b.id === group.keeperId) -
									Number(a.id === group.keeperId) ||
								(b.bitrate ?? 0) - (a.bitrate ?? 0),
						),
				})),
			};
		}),

	// What the search can use on this hub, and the counts of the last run.
	status: procedure({
		auth: true,
		reads: ["dupeGroups", "fingerprints"],
	}).query(async () => {
		const database = db();
		const states = database
			.select({ state: dupeGroups.state, n: count() })
			.from(dupeGroups)
			.groupBy(dupeGroups.state)
			.all();
		return {
			open: states.find((each) => each.state === "open")?.n ?? 0,
			dismissed: states.find((each) => each.state === "dismissed")?.n ?? 0,
			fingerprints:
				database.select({ n: count() }).from(fingerprints).get()?.n ?? 0,
			fpcalc: await binaryAvailable("fpcalc", "-version"),
		};
	}),

	// Fingerprints (when fpcalc is there) and then the three-tier search over the library.
	run: procedure({ auth: true, writes: ["dupeGroups", "fingerprints", "jobs"] })
		.output(jobViewSchema)
		.mutation(async () =>
			(await binaryAvailable("fpcalc", "-version"))
				? enqueue(fingerprint, { afterwards: {} })
				: enqueue(dedupe, {}),
		),

	// "These are not duplicates": the group stays dismissed through later runs.
	dismiss: procedure({ auth: true, writes: ["dupeGroups"] })
		.input(z.object({ id: z.number().int() }))
		.mutation(({ input }) => {
			db()
				.update(dupeGroups)
				.set({ state: "dismissed", updatedAt: new Date() })
				.where(eq(dupeGroups.id, input.id))
				.run();
		}),

	restore: procedure({ auth: true, writes: ["dupeGroups"] })
		.input(z.object({ id: z.number().int() }))
		.mutation(({ input }) => {
			db()
				.update(dupeGroups)
				.set({ state: "open", updatedAt: new Date() })
				.where(eq(dupeGroups.id, input.id))
				.run();
		}),

	// Picks another track of the group to keep.
	keep: procedure({ auth: true, writes: ["dupeGroups"] })
		.input(z.object({ id: z.number().int(), trackId: z.string() }))
		.mutation(({ input }) => {
			const member = db()
				.select()
				.from(dupeMembers)
				.where(
					and(
						eq(dupeMembers.groupId, input.id),
						eq(dupeMembers.trackId, input.trackId),
					),
				)
				.get();
			if (!member) throw new ApiError("NOT_FOUND");
			db()
				.update(dupeGroups)
				.set({
					keeperId: input.trackId,
					keeperReason: "chosen by you",
					updatedAt: new Date(),
				})
				.where(eq(dupeGroups.id, input.id))
				.run();
		}),

	// Merges groups into their keepers: fills tags, quarantines the others. One
	// group, a list of them, or every open group of a tier.
	merge: procedure({
		auth: true,
		writes: ["dupeGroups", "tracks", "files", "jobs"],
	})
		.input(
			z.object({
				groupIds: z.array(z.number().int()).optional(),
				reason: z.enum(["exact", "acoustic", "fuzzy"]).optional(),
			}),
		)
		.output(jobViewSchema)
		.mutation(({ input }) => enqueue(merge, input)),
};
