import { procedure } from "virtual:stack-procedure";
import { selectionWhere } from "@fcalell/plugin-api/lib/selection";
import { selector, z } from "@fcalell/plugin-api/schema";
import {
	and,
	asc,
	eq,
	gte,
	inArray,
	type SQL,
	sql,
} from "@fcalell/plugin-db/orm";
import {
	proposals,
	settings as settingsTable,
	tracks,
} from "../../schema/index.ts";
import autotagApply from "../../server/jobs/autotag-apply.ts";
import { buildProviders, PROVIDER_LABELS } from "../../server/lib/autotag.ts";
import { db } from "../../server/lib/db.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";
import { AUTOTAG_POLICIES, PROPOSAL_VIEWS } from "../../shared/intelligence.ts";

// A review view: a state, the proposals of one source, those at or above a confidence
// (percent). A row of the review is a track, so a selection is of track ids.
const query = z.object({
	state: z.enum(PROPOSAL_VIEWS).default("pending"),
	source: z.string().optional(),
	confidence: z.number().int().min(0).max(100).optional(),
});
type Query = z.infer<typeof query>;
const pick = selector(query);
const choice = z.object({ proposals: pick, within: query });

// The proposals a view holds; waiting ones include those accepted and not yet applied.
const viewWhere = (view: Query): SQL | undefined =>
	and(
		view.state === "pending"
			? sql`${proposals.state} IN ('pending', 'accepted')`
			: eq(proposals.state, view.state),
		view.source ? eq(proposals.source, view.source) : undefined,
		view.confidence === undefined
			? undefined
			: gte(proposals.confidence, view.confidence / 100),
	);

// The waiting proposals of the tracks a choice names, within the view it was made in.
const chosenWhere = (input: z.infer<typeof choice>): SQL | undefined =>
	and(
		eq(proposals.state, "pending"),
		viewWhere(input.within),
		selectionWhere(input.proposals, {
			id: proposals.trackId,
			where: viewWhere,
		}),
	);

const mask = (secret: string | null): string | null =>
	secret
		? `${"•".repeat(Math.max(4, Math.min(secret.length - 4, 12)))}${secret.slice(-4)}`
		: null;

const settingsView = z.object({
	autotagMusicbrainz: z.boolean(),
	autotagMusicbrainzAgent: z.string().nullable(),
	autotagAcoustid: z.boolean(),
	autotagAcoustidKey: z.string().nullable(),
	autotagDiscogs: z.boolean(),
	autotagDiscogsToken: z.string().nullable(),
	autotagBeatport: z.boolean(),
	autotagBeatportToken: z.string().nullable(),
	autotagDeezer: z.boolean(),
	autotagPolicy: z.enum(AUTOTAG_POLICIES),
	autotagMinConfidence: z.number(),
	autotagCacheDays: z.number(),
	autotagInbox: z.boolean(),
	artMinSide: z.number(),
	analyseAuto: z.boolean(),
	analyseFillConfidence: z.number(),
	// The providers that will be asked, by name.
	ready: z.array(z.string()),
});

function settingsOf() {
	const s = readSettings();
	const set = buildProviders(s);
	return {
		autotagMusicbrainz: s.autotagMusicbrainz,
		autotagMusicbrainzAgent: s.autotagMusicbrainzAgent,
		autotagAcoustid: s.autotagAcoustid,
		autotagAcoustidKey: mask(s.autotagAcoustidKey),
		autotagDiscogs: s.autotagDiscogs,
		autotagDiscogsToken: mask(s.autotagDiscogsToken),
		autotagBeatport: s.autotagBeatport,
		autotagBeatportToken: mask(s.autotagBeatportToken),
		autotagDeezer: s.autotagDeezer,
		autotagPolicy: s.autotagPolicy,
		autotagMinConfidence: s.autotagMinConfidence,
		autotagCacheDays: s.autotagCacheDays,
		autotagInbox: s.autotagInbox,
		artMinSide: s.artMinSide,
		analyseAuto: s.analyseAuto,
		analyseFillConfidence: s.analyseFillConfidence,
		ready: set.providers.map((p) => PROVIDER_LABELS[p.name]),
	};
}

const percent = (max = 100) =>
	z
		.number("Enter a number")
		.int("Enter a whole number")
		.min(0, "Enter 0 or more")
		.max(max, `Enter ${max} or less`);

// A secret: null (or empty) takes it away, a value replaces it, absent keeps it; the masked
// echo (it has bullets) is never written.
const secret = z.string().trim().nullable().optional();
const orNull = (v: string): string | null => (v === "" ? null : v);

function queued() {
	return enqueue(autotagApply, {}, { reuse: () => true });
}

export const autotag = {
	settings: procedure({ auth: true, reads: ["settings"] })
		.output(settingsView)
		.query(() => settingsOf()),

	updateSettings: procedure({ auth: true, writes: ["settings"] })
		.input(
			z.object({
				autotagMusicbrainz: z.boolean().optional(),
				autotagMusicbrainzAgent: z.string().trim().optional(),
				autotagAcoustid: z.boolean().optional(),
				autotagAcoustidKey: secret,
				autotagDiscogs: z.boolean().optional(),
				autotagDiscogsToken: secret,
				autotagBeatport: z.boolean().optional(),
				autotagBeatportToken: secret,
				autotagDeezer: z.boolean().optional(),
				autotagPolicy: z.enum(AUTOTAG_POLICIES).optional(),
				autotagMinConfidence: percent().optional(),
				autotagCacheDays: percent(365).optional(),
				autotagInbox: z.boolean().optional(),
				artMinSide: z
					.number("Enter a number")
					.int("Enter a whole number")
					.min(100, "Enter 100 or more")
					.max(3000, "Enter 3000 or less")
					.optional(),
				analyseAuto: z.boolean().optional(),
				analyseFillConfidence: percent().optional(),
			}),
		)
		.output(settingsView)
		.mutation(({ input }) => {
			readSettings();
			const set: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(input)) {
				if (value === undefined) continue;
				if (typeof value === "string") {
					if (value.includes("•")) continue;
					set[key] = orNull(value);
				} else set[key] = value;
			}
			db()
				.update(settingsTable)
				.set({ ...set, updatedAt: new Date() })
				.where(eq(settingsTable.id, 1))
				.run();
			return settingsOf();
		}),

	// How many tracks each state holds.
	summary: procedure({ auth: true, reads: ["proposals"] })
		.output(
			z.object({
				pending: z.number(),
				applied: z.number(),
				rejected: z.number(),
				stale: z.number(),
			}),
		)
		.query(() => {
			const tracksIn = (state: Query["state"]): number =>
				db()
					.select({ n: sql<number>`count(distinct ${proposals.trackId})` })
					.from(proposals)
					.where(viewWhere({ state }))
					.get()?.n ?? 0;
			return {
				pending: tracksIn("pending"),
				applied: tracksIn("applied"),
				rejected: tracksIn("rejected"),
				stale: tracksIn("stale"),
			};
		}),

	// The tracks to review, a window in name order, each with its proposed fields together.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["proposals", "tracks"],
	})
		.input(query)
		.query(({ input }) => {
			const database = db();
			const where = viewWhere(input);
			const page = database
				.select({ trackId: proposals.trackId })
				.from(proposals)
				.where(where)
				.groupBy(proposals.trackId)
				.orderBy(
					sql`min(${proposals.label}) collate nocase`,
					asc(proposals.trackId),
				)
				.limit(input.limit)
				.offset(input.offset)
				.all()
				.map((row) => row.trackId);
			const rows = page.length
				? database
						.select({
							id: proposals.id,
							trackId: proposals.trackId,
							title: tracks.title,
							artist: tracks.artist,
							mixName: tracks.mixName,
							field: proposals.field,
							before: proposals.before,
							after: proposals.after,
							source: proposals.source,
							confidence: proposals.confidence,
							alternatives: proposals.alternatives,
						})
						.from(proposals)
						.innerJoin(tracks, eq(tracks.id, proposals.trackId))
						.where(and(where, inArray(proposals.trackId, page)))
						.orderBy(asc(proposals.id))
						.all()
				: [];
			const data = page.flatMap((trackId) => {
				const own = rows.filter((row) => row.trackId === trackId);
				const first = own[0];
				return first
					? [
							{
								id: trackId,
								title: first.title,
								artist: first.artist,
								mixName: first.mixName,
								proposals: own.map((row) => ({
									field: row.field,
									before: row.before,
									after: row.after,
									source: row.source,
									confidence: Math.round(row.confidence * 100),
									alternatives: (
										(row.alternatives ?? []) as Array<{
											value: string;
											source: string;
										}>
									)
										.map((each) => `${each.value} (${each.source})`)
										.join(", "),
								})),
							},
						]
					: [];
			});
			const total =
				database
					.select({ n: sql<number>`count(distinct ${proposals.trackId})` })
					.from(proposals)
					.where(where)
					.get()?.n ?? 0;
			return { data, total, offset: input.offset };
		}),

	// Accepts the proposals of the chosen tracks; they are applied as one batch.
	accept: procedure({ auth: true, writes: ["proposals", "jobs"] })
		.input(choice)
		.output(jobViewSchema)
		.mutation(({ input }) => {
			db()
				.update(proposals)
				.set({ state: "accepted" })
				.where(chosenWhere(input))
				.run();
			return queued();
		}),

	// Accepts every waiting proposal at or above the confidence (percent).
	acceptAbove: procedure({ auth: true, writes: ["proposals", "jobs"] })
		.input(z.object({ confidence: percent() }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			db()
				.update(proposals)
				.set({ state: "accepted" })
				.where(
					and(
						eq(proposals.state, "pending"),
						gte(proposals.confidence, input.confidence / 100),
					),
				)
				.run();
			return queued();
		}),

	reject: procedure({ auth: true, writes: ["proposals"] })
		.input(choice)
		.output(z.object({ rejected: z.number() }))
		.mutation(({ input }) => {
			const r = db()
				.update(proposals)
				.set({ state: "rejected" })
				.where(chosenWhere(input))
				.run();
			return { rejected: r.changes };
		}),
};
