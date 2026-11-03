import { procedure } from "virtual:stack-procedure";
import { selectionWhere } from "@fcalell/plugin-api/lib/selection";
import { selector, z } from "@fcalell/plugin-api/schema";
import { and, asc, count, eq, gte, sql } from "@fcalell/plugin-db/orm";
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

const query = z.object({ state: z.enum(PROPOSAL_VIEWS).default("pending") });
const pick = selector(query);

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

	// How many proposals wait, per state.
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
			const rows = db()
				.select({ state: proposals.state, n: count() })
				.from(proposals)
				.groupBy(proposals.state)
				.all();
			const n = (state: string): number =>
				rows
					.filter((row) =>
						state === "pending"
							? row.state === "pending" || row.state === "accepted"
							: row.state === state,
					)
					.reduce((sum, row) => sum + row.n, 0);
			return {
				pending: n("pending"),
				applied: n("applied"),
				rejected: n("rejected"),
				stale: n("stale"),
			};
		}),

	// The proposals to review, a window, tracks in name order with their fields together.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["proposals"],
	})
		.input(query)
		.query(({ input }) => {
			const database = db();
			const where =
				input.state === "pending"
					? sql`${proposals.state} IN ('pending', 'accepted')`
					: eq(proposals.state, input.state);
			const data = database
				.select({
					row: proposals,
					title: tracks.title,
					mixName: tracks.mixName,
					artist: tracks.artist,
				})
				.from(proposals)
				.leftJoin(tracks, eq(tracks.id, proposals.trackId))
				.where(where)
				.orderBy(sql`${proposals.label} collate nocase`, asc(proposals.id))
				.limit(input.limit)
				.offset(input.offset)
				.all()
				.map(({ row, title, mixName, artist }) => ({
					id: String(row.id),
					trackId: row.trackId,
					title,
					mixName,
					artist,
					field: row.field,
					before: row.before,
					after: row.after,
					source: row.source,
					sourceUrl: row.sourceUrl,
					confidence: Math.round(row.confidence * 100),
					state: row.state,
					alternatives: (
						(row.alternatives ?? []) as Array<{
							value: string;
							source: string;
						}>
					)
						.map((each) => `${each.value} (${each.source})`)
						.join(", "),
				}));
			const total =
				database.select({ n: count() }).from(proposals).where(where).get()?.n ??
				0;
			return { data, total, offset: input.offset };
		}),

	// Accepts the chosen proposals; they are applied as one batch.
	accept: procedure({ auth: true, writes: ["proposals", "jobs"] })
		.input(z.object({ proposals: pick }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			db()
				.update(proposals)
				.set({ state: "accepted" })
				.where(
					and(
						eq(proposals.state, "pending"),
						selectionWhere(input.proposals, {
							id: proposals.id,
							where: (q) =>
								eq(
									proposals.state,
									q.state === "pending" ? "pending" : q.state,
								),
						}),
					),
				)
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
		.input(z.object({ proposals: pick }))
		.output(z.object({ rejected: z.number() }))
		.mutation(({ input }) => {
			const r = db()
				.update(proposals)
				.set({ state: "rejected" })
				.where(
					and(
						eq(proposals.state, "pending"),
						selectionWhere(input.proposals, {
							id: proposals.id,
							where: (q) =>
								eq(
									proposals.state,
									q.state === "pending" ? "pending" : q.state,
								),
						}),
					),
				)
				.run();
			return { rejected: r.changes };
		}),
};
