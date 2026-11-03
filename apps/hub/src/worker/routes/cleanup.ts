import { randomUUID } from "node:crypto";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { asc, eq } from "@fcalell/plugin-db/orm";
import {
	type Action,
	compileRules,
	RULE_FIELDS,
	RULE_TEXT_FIELDS,
	type Rule,
	type TextField,
} from "@trackvault/core/rules";
import { rules } from "../../schema/index.ts";
import rulesJob from "../../server/jobs/rules.ts";
import { db } from "../../server/lib/db.ts";
import { rerunPreview } from "../../server/lib/preview-rerun.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";

// The actions the screen edits as data. Each takes the fields below it uses.
const ACTION_KINDS = [
	"whitespace",
	"stripJunk",
	"case",
	"normalizeSeparators",
	"replace",
	"set",
] as const;
type ActionKind = (typeof ACTION_KINDS)[number];

const ruleInput = z.object({
	// Absent makes a new rule.
	id: z.string().optional(),
	name: z.string().trim().min(1, "Name the rule").max(80),
	action: z.enum(ACTION_KINDS),
	// The tags it touches; none is every text tag. (Used by every action but Set.)
	fields: z.array(z.enum(RULE_TEXT_FIELDS)).default([]),
	// Case: title, lower, upper or sentence.
	caseMode: z.enum(["title", "lower", "upper", "sentence"]).optional(),
	// Replace: the text to find (a pattern unless Literal), and what replaces it.
	pattern: z.string().optional(),
	replacement: z.string().optional(),
	literal: z.boolean().default(true),
	// Set: the tag and the value; only fills the tag when it is empty by default.
	setField: z.enum(RULE_FIELDS).optional(),
	setValue: z.string().optional(),
	onlyIfEmpty: z.boolean().default(true),
});

function actionOf(input: z.infer<typeof ruleInput>): Action {
	const fields: TextField[] | undefined =
		input.fields.length > 0 ? input.fields : undefined;
	switch (input.action) {
		case "whitespace":
			return { do: "whitespace", fields };
		case "stripJunk":
			return { do: "stripJunk", fields };
		case "case":
			if (!input.caseMode)
				throw new ApiError("BAD_REQUEST", { message: "Choose a case" });
			return { do: "case", mode: input.caseMode, fields };
		case "normalizeSeparators":
			return { do: "normalizeSeparators", fields };
		case "replace":
			if (!input.pattern)
				throw new ApiError("BAD_REQUEST", {
					message: "Enter the text to find",
				});
			return {
				do: "replace",
				pattern: input.pattern,
				with: input.replacement ?? "",
				literal: input.literal,
				fields,
			};
		case "set":
			if (!input.setField)
				throw new ApiError("BAD_REQUEST", { message: "Choose the tag to set" });
			return {
				do: "set",
				field: input.setField,
				value:
					input.setValue === undefined || input.setValue === ""
						? null
						: input.setValue,
				onlyIfEmpty: input.onlyIfEmpty,
			};
	}
}

const dropUndefined = <T extends object>(action: T): T =>
	JSON.parse(JSON.stringify(action)) as T;

// A short phrase for what a rule does.
function summaryOf(rule: Rule): string {
	return rule.actions
		.map((action) => {
			switch (action.do) {
				case "case":
					return `${action.mode} case`;
				case "replace":
					return `replace "${action.pattern}"`;
				case "set":
					return `set ${action.field}`;
				case "alias":
					return `unify ${action.field}`;
				default:
					return action.do.replace(/([A-Z])/g, " $1").toLowerCase();
			}
		})
		.join(", ");
}

// The form of a rule one action long, to edit it again.
function formOf(rule: Rule) {
	const [action] = rule.actions;
	if (rule.actions.length !== 1 || !action) return null;
	if (!(ACTION_KINDS as readonly string[]).includes(action.do)) return null;
	return {
		action: action.do as ActionKind,
		fields: ("fields" in action && action.fields
			? action.fields
			: []) as TextField[],
		caseMode: action.do === "case" ? action.mode : undefined,
		pattern: action.do === "replace" ? action.pattern : undefined,
		replacement: action.do === "replace" ? action.with : undefined,
		literal: action.do === "replace" ? (action.literal ?? false) : true,
		setField: action.do === "set" ? action.field : undefined,
		setValue:
			action.do === "set" && action.value !== null
				? String(action.value)
				: undefined,
		onlyIfEmpty: action.do === "set" ? (action.onlyIfEmpty ?? false) : true,
	};
}

export const cleanup = {
	list: procedure({ auth: true, reads: ["rules"] }).query(() =>
		db()
			.select()
			.from(rules)
			.orderBy(asc(rules.position), asc(rules.name))
			.all()
			.map((row) => {
				const rule = row.definition as Rule;
				return {
					id: row.id,
					name: row.name,
					enabled: row.enabled,
					builtin: row.builtin,
					summary: summaryOf(rule),
					// What the Form shows when the rule is edited; null for a rule of
					// several actions (a built-in), which can only be switched.
					form: formOf(rule),
				};
			}),
	),

	save: procedure({ auth: true, writes: ["rules", "previews", "jobs"] })
		.input(ruleInput)
		.mutation(({ input }) => {
			const id = input.id ?? `rule.${randomUUID()}`;
			const rule: Rule = {
				id,
				name: input.name,
				actions: [dropUndefined(actionOf(input))],
			};
			try {
				compileRules([rule]);
			} catch (error) {
				throw new ApiError("BAD_REQUEST", {
					message:
						error instanceof Error ? error.message : "The rule is not valid",
				});
			}
			const database = db();
			const existing = input.id
				? database.select().from(rules).where(eq(rules.id, id)).get()
				: undefined;
			if (existing?.builtin)
				throw new ApiError("BAD_REQUEST", {
					message: "A built-in rule is switched, not edited",
				});
			const position =
				existing?.position ??
				database
					.select({ p: rules.position })
					.from(rules)
					.all()
					.reduce((max, row) => Math.max(max, row.p), 0) + 1;
			database
				.insert(rules)
				.values({
					id,
					name: input.name,
					enabled: existing?.enabled ?? false,
					builtin: false,
					position,
					definition: rule,
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: rules.id,
					set: { name: input.name, definition: rule, updatedAt: new Date() },
				})
				.run();
			rerunPreview(rulesJob, { mode: "preview" });
			return { id };
		}),

	toggle: procedure({ auth: true, writes: ["rules", "previews", "jobs"] })
		.input(z.object({ id: z.string(), enabled: z.boolean() }))
		.mutation(({ input }) => {
			db()
				.update(rules)
				.set({ enabled: input.enabled, updatedAt: new Date() })
				.where(eq(rules.id, input.id))
				.run();
			rerunPreview(rulesJob, { mode: "preview" });
		}),

	remove: procedure({ auth: true, writes: ["rules", "previews", "jobs"] })
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) => {
			const row = db().select().from(rules).where(eq(rules.id, input.id)).get();
			if (row?.builtin)
				throw new ApiError("BAD_REQUEST", {
					message: "A built-in rule can only be switched off",
				});
			db().delete(rules).where(eq(rules.id, input.id)).run();
			rerunPreview(rulesJob, { mode: "preview" });
		}),

	// What the enabled rules would change across the library: a job that stores the
	// rows for the screen to page through. Every change to the rules plans again.
	preview: procedure({ auth: true, writes: ["previews", "jobs"] })
		.output(jobViewSchema)
		.mutation(() => rerunPreview(rulesJob, { mode: "preview" })),

	apply: procedure({ auth: true, writes: ["tracks", "jobs"] })
		.output(jobViewSchema)
		.mutation(() => enqueue(rulesJob, { mode: "apply" })),
};
