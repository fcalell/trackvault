import { asc, eq } from "@fcalell/plugin-db/orm";
import {
	BUILTIN_RULES,
	RULE_FIELDS,
	type Rule,
	type RulePatch,
	type RuleTrack,
} from "@trackvault/core/rules";
import { rules } from "../../schema/index.ts";
import { db } from "./db.ts";
import type { TagKey, TagValues, TrackRow } from "./track-fields.ts";

// The built-in rules of core, as rows the owner can switch on (never overwritten
// once present, so an edit or a switch survives a restart).
export function ensureRules(): void {
	const database = db();
	const have = new Set(
		database
			.select({ id: rules.id })
			.from(rules)
			.all()
			.map((row) => row.id),
	);
	const now = new Date();
	BUILTIN_RULES.forEach((rule, position) => {
		if (have.has(rule.id)) return;
		database
			.insert(rules)
			.values({
				id: rule.id,
				name: rule.name,
				enabled: false,
				builtin: true,
				position,
				definition: rule,
				updatedAt: now,
			})
			.run();
	});
}

// The rules to run, enabled ones in order (or the ones named).
export function activeRules(ids?: readonly string[]): Rule[] {
	const rows = db().select().from(rules).orderBy(asc(rules.position)).all();
	return rows
		.filter((row) => (ids ? ids.includes(row.id) : row.enabled))
		.map((row) => ({
			...(row.definition as Rule),
			id: row.id,
			name: row.name,
		}));
}

export function ruleOf(id: string) {
	return db().select().from(rules).where(eq(rules.id, id)).get();
}

// What a rule reads of a track.
export function ruleTrack(row: TrackRow): RuleTrack {
	const out: RuleTrack = {};
	for (const field of RULE_FIELDS) {
		if (field === "featured") continue;
		out[field] = (row as unknown as Record<string, string | number | null>)[
			field
		];
	}
	return out;
}

// The tag values a rule's patch sets (`featured` is no tag).
export function patchOf(patch: RulePatch): TagValues {
	const out: TagValues = {};
	for (const [field, value] of Object.entries(patch)) {
		if (field === "featured") continue;
		out[field as TagKey] = value;
	}
	return out;
}
