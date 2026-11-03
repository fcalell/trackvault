import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { selector, z } from "@fcalell/plugin-api/schema";
import {
	and,
	asc,
	count,
	eq,
	inArray,
	notInArray,
	type SQL,
} from "@fcalell/plugin-db/orm";
import type { InboxDecision } from "@trackvault/core/inbox";
import { INBOX_PIPELINE } from "@trackvault/core/inbox";
import { inboxItems, settings as settingsTable } from "../../schema/index.ts";
import inboxApprove from "../../server/jobs/inbox-approve.ts";
import { db } from "../../server/lib/db.ts";
import {
	effectiveTags,
	getItem,
	type ItemRow,
	itemLabel,
	itemName,
	libraryCopies,
	matchesOf,
	type Override,
	patchItem,
	proposedOf,
	stepsOf,
	tagsOf,
} from "../../server/lib/inbox/items.ts";
import { retryItems } from "../../server/lib/inbox/run.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { requestInbox } from "../../server/services/inbox.ts";
import { enqueue } from "../../server/services/jobs.ts";
import {
	INBOX_FILTERS,
	INBOX_GROUPS,
	type InboxFilterGroup,
	type InboxGroup,
} from "../../shared/acquire.ts";
import { jobViewSchema } from "../../shared/channels.ts";

const STATES_OF: Record<InboxGroup, ItemRow["state"][]> = {
	ready: ["awaiting-approval"],
	review: ["duplicate", "needs-review", "failed"],
	processing: ["queued", "processing"],
	done: ["approved", "rejected"],
};
const STATES_OF_FILTER: Record<InboxFilterGroup, ItemRow["state"][]> = {
	...STATES_OF,
	waiting: [...STATES_OF.ready, ...STATES_OF.review],
};
// Without a filter the inbox lists what is still open.
const OPEN: ItemRow["state"][] = [
	...STATES_OF.ready,
	...STATES_OF.review,
	...STATES_OF.processing,
];

const inboxFilter = z.object({ group: z.enum(INBOX_FILTERS).optional() });
type InboxFilter = z.infer<typeof inboxFilter>;
const itemsInput = selector(inboxFilter);

const whereOf = (filter: InboxFilter): SQL | undefined =>
	inArray(
		inboxItems.state,
		filter.group ? STATES_OF_FILTER[filter.group] : OPEN,
	);

function idsOf(selection: z.infer<typeof itemsInput>): string[] {
	if ("ids" in selection) return selection.ids;
	return db()
		.select({ id: inboxItems.id })
		.from(inboxItems)
		.where(
			and(
				whereOf(selection.query),
				selection.except.length > 0
					? notInArray(inboxItems.id, selection.except)
					: undefined,
			),
		)
		.all()
		.map((row) => row.id);
}

const decisionOf = (row: ItemRow): InboxDecision | null =>
	(row.decision ?? null) as InboxDecision | null;

const listRow = z.object({
	id: z.string(),
	label: z.string(),
	source: z.enum(["upload", "soulseek", "watch", "agent"]),
	sourceRef: z.string().nullable(),
	artist: z.string().nullable(),
	title: z.string(),
	// The library track an approved item became.
	trackId: z.string().nullable(),
	state: z.enum([
		"queued",
		"processing",
		"awaiting-approval",
		"duplicate",
		"needs-review",
		"approved",
		"rejected",
		"failed",
	]),
	decision: z
		.enum(["accept", "duplicate-of", "better-than-existing", "needs-review"])
		.nullable(),
	reason: z.string().nullable(),
	format: z.string().nullable(),
	bitrate: z.number().nullable(),
	durationMs: z.number().nullable(),
	size: z.number(),
	target: z.string().nullable(),
	stepsDone: z.number(),
	stepsTotal: z.number(),
	createdAt: z.date(),
	error: z.string().nullable(),
});

const IDLE = new Set(["done", "skipped"]);

function asListRow(row: ItemRow): z.infer<typeof listRow> {
	const steps = stepsOf(row);
	return {
		id: row.id,
		label: itemLabel(row),
		...itemName(row),
		trackId: row.trackId,
		source: row.source,
		sourceRef: row.sourceRef,
		state: row.state,
		decision: row.decisionKind,
		reason: row.error ?? decisionOf(row)?.reason ?? null,
		format: row.format,
		bitrate: row.bitrate,
		durationMs: row.durationMs,
		size: row.size,
		target: row.target,
		stepsDone: INBOX_PIPELINE.filter((s) => IDLE.has(steps[s.id]?.status ?? ""))
			.length,
		stepsTotal: INBOX_PIPELINE.length,
		createdAt: row.createdAt,
		error: row.error,
	};
}

const settingsView = z.object({
	inboxAutoApprove: z.boolean(),
	inboxAutoReplace: z.boolean(),
	inboxAutoRejectDuplicates: z.boolean(),
	inboxBitrateMarginKbps: z.number(),
	inboxFuzzyPercent: z.number(),
	inboxAcousticPercent: z.number(),
});

const settingsOf = () => {
	const s = readSettings();
	return {
		inboxAutoApprove: s.inboxAutoApprove,
		inboxAutoReplace: s.inboxAutoReplace,
		inboxAutoRejectDuplicates: s.inboxAutoRejectDuplicates,
		inboxBitrateMarginKbps: s.inboxBitrateMarginKbps,
		inboxFuzzyPercent: s.inboxFuzzyPercent,
		inboxAcousticPercent: s.inboxAcousticPercent,
	};
};

const percent = (what: string) =>
	z
		.number(`Enter a number`)
		.int("Enter a whole number")
		.min(50, `${what} must be at least 50`)
		.max(100, `${what} must be 100 or less`);

export const inbox = {
	// The open items (or one group of them), oldest first, in windows.
	list: procedure({
		auth: true,
		paginated: "window",
		maxLimit: 200,
		reads: ["inboxItems"],
	})
		.input(inboxFilter)
		.query(({ input }) => {
			const database = db();
			const where = whereOf(input);
			const data = database
				.select()
				.from(inboxItems)
				.where(where)
				.orderBy(asc(inboxItems.createdAt), asc(inboxItems.id))
				.limit(input.limit)
				.offset(input.offset)
				.all()
				.map(asListRow);
			const total =
				database.select({ n: count() }).from(inboxItems).where(where).get()
					?.n ?? 0;
			return { data, total, offset: input.offset };
		}),

	// How many items stand in each group, for the filter's counts.
	counts: procedure({ auth: true, reads: ["inboxItems"] })
		.output(z.record(z.enum(INBOX_GROUPS), z.number()))
		.query(() => {
			const rows = db()
				.select({ state: inboxItems.state, n: count() })
				.from(inboxItems)
				.groupBy(inboxItems.state)
				.all();
			const out = { ready: 0, review: 0, processing: 0, done: 0 };
			for (const group of INBOX_GROUPS)
				for (const row of rows)
					if (STATES_OF[group].includes(row.state)) out[group] += row.n;
			return out;
		}),

	// One item: where it stands in the pipeline, what was decided and why, the tags it
	// has and the ones the pipeline would write, what it matched, where it will be filed.
	get: procedure({ auth: true, reads: ["inboxItems", "tracks"] })
		.input(z.object({ id: z.string() }))
		.query(({ input }) => {
			const row = getItem(input.id);
			if (!row) throw new ApiError("NOT_FOUND");
			const steps = stepsOf(row);
			const decision = decisionOf(row);
			const raw = tagsOf(row) as Record<string, string | number | null>;
			const proposed = proposedOf(row) as Record<
				string,
				string | number | null
			>;
			const matches = libraryCopies(matchesOf(row));
			const fields = [
				"title",
				"artist",
				"remixer",
				"album",
				"albumArtist",
				"genre",
				"label",
				"year",
				"bpm",
				"key",
				"isrc",
				"comment",
			];
			const word = (v: unknown): string | null =>
				v === null || v === undefined || v === "" ? null : String(v);
			const effective = effectiveTags(row);
			const cutoff = (row.cutoff ?? null) as {
				verdict: string;
				explanation: string;
			} | null;
			const replaced =
				decision?.kind === "better-than-existing"
					? matches.find((m) => m.trackId === String(decision.replaces))
					: undefined;
			return {
				id: row.id,
				label: itemLabel(row),
				...itemName(row),
				trackId: row.trackId,
				genre: word(effective.genre),
				key: word(effective.key),
				bpm: word(effective.bpm),
				year: word(effective.year),
				path: row.path,
				source: row.source,
				sourceRef: row.sourceRef,
				state: row.state,
				error: row.error,
				format: row.format,
				bitrate: row.bitrate,
				sampleRate: row.sampleRate,
				durationMs: row.durationMs,
				size: row.size,
				target: row.target,
				decision: decision
					? {
							kind: decision.kind,
							reason: decision.reason,
							replaces: replaced ? { trackId: replaced.trackId } : null,
						}
					: null,
				overridden: row.override !== null,
				// "Identical audio" is not kept twice.
				canKeep:
					(row.state === "duplicate" || row.state === "needs-review") &&
					decision?.reason !== "identical audio" &&
					!String(
						(decision as { trackId?: unknown } | null)?.trackId ?? "",
					).startsWith("inbox:"),
				steps: INBOX_PIPELINE.map((step) => ({
					id: step.id,
					label: step.label,
					status: steps[step.id]?.status ?? ("pending" as const),
					reason: steps[step.id]?.reason ?? steps[step.id]?.error ?? null,
				})),
				tags: fields
					.filter((f) => word(raw[f]) !== null || word(proposed[f]) !== null)
					.map((f) => ({
						field: f,
						before: word(raw[f]),
						after: word(effective[f]),
					})),
				matches,
				cutoff: cutoff
					? { verdict: cutoff.verdict, explanation: cutoff.explanation }
					: null,
				wantId: row.wantId,
			};
		}),

	// Files the chosen items into the library (a job).
	approve: procedure({ auth: true, writes: ["inboxItems", "tracks", "jobs"] })
		.input(z.object({ items: itemsInput }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			const ids = idsOf(input.items);
			const ready = db()
				.select({ id: inboxItems.id })
				.from(inboxItems)
				.where(
					and(
						inArray(inboxItems.id, ids),
						eq(inboxItems.state, "awaiting-approval"),
					),
				)
				.all()
				.map((row) => row.id);
			if (ready.length === 0)
				throw new ApiError("BAD_REQUEST", {
					message: "Nothing chosen is ready to approve.",
				});
			return enqueue(inboxApprove, { action: "approve", ids: ready });
		}),

	// Sets the chosen items aside; their files wait in the quarantine's folder.
	reject: procedure({ auth: true, writes: ["inboxItems", "jobs"] })
		.input(z.object({ items: itemsInput }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(inboxApprove, { action: "reject", ids: idsOf(input.items) }),
		),

	// "Keep it anyway": the owner's call over a duplicate or a question.
	keep: procedure({ auth: true, writes: ["inboxItems", "jobs"] })
		.input(z.object({ items: itemsInput }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			let kept = 0;
			for (const id of idsOf(input.items)) {
				const row = getItem(id);
				if (!row || !["duplicate", "needs-review"].includes(row.state))
					continue;
				if (decisionOf(row)?.reason === "identical audio") continue;
				overrideItem(row, { kind: "accept" });
				kept++;
			}
			if (kept === 0)
				throw new ApiError("BAD_REQUEST", {
					message:
						"Nothing chosen can be kept: identical audio is never kept twice.",
				});
			return requestInbox();
		}),

	// The file replaces this library track once approved.
	replace: procedure({ auth: true, writes: ["inboxItems", "jobs"] })
		.input(z.object({ id: z.string(), trackId: z.string() }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			const row = getItem(input.id);
			if (!row) throw new ApiError("NOT_FOUND");
			overrideItem(row, { kind: "replace", trackId: input.trackId });
			return requestInbox();
		}),

	// Runs a failed item again from the step that failed.
	retry: procedure({ auth: true, writes: ["inboxItems", "jobs"] })
		.input(z.object({ items: itemsInput }))
		.output(jobViewSchema)
		.mutation(({ input }) => {
			retryItems(idsOf(input.items));
			return requestInbox();
		}),

	// Looks in the inbox folder now.
	check: procedure({ auth: true, writes: ["inboxItems", "jobs"] })
		.output(jobViewSchema)
		.mutation(() => requestInbox()),

	settings: procedure({ auth: true, reads: ["settings"] })
		.output(settingsView)
		.query(() => settingsOf()),

	updateSettings: procedure({ auth: true, writes: ["settings"] })
		.input(
			z.object({
				inboxAutoApprove: z.boolean().optional(),
				inboxAutoReplace: z.boolean().optional(),
				inboxAutoRejectDuplicates: z.boolean().optional(),
				inboxBitrateMarginKbps: z
					.number("Enter a number")
					.int("Enter a whole number")
					.min(0, "Enter 0 or more")
					.max(2000, "Enter 2000 or less")
					.optional(),
				inboxFuzzyPercent: percent("The fuzzy threshold").optional(),
				inboxAcousticPercent: percent("The acoustic threshold").optional(),
			}),
		)
		.output(settingsView)
		.mutation(({ input }) => {
			readSettings();
			db()
				.update(settingsTable)
				.set({ ...input, updatedAt: new Date() })
				.where(eq(settingsTable.id, 1))
				.run();
			return settingsOf();
		}),
};

// Records the owner's decision and sends the item back through the duplicate check.
function overrideItem(row: ItemRow, override: Override): void {
	const steps = stepsOf(row);
	delete steps.dedupe;
	patchItem(row.id, {
		override,
		steps,
		state: "queued",
		error: null,
	});
}
