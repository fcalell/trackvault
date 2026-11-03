import { fold, splitArtists } from "../normalize/index.ts";
import { resolveName } from "../taxonomy/index.ts";
import {
	collapseWhitespace,
	extractFeaturing,
	joinFeatures,
	looksLikeMix,
	normalizeMixBrackets,
	normalizeSeparators,
	sentenceCase,
	stripJunk,
	stripTrackNumber,
	titleCase,
} from "./text.ts";
import {
	type Action,
	type Condition,
	type FieldChange,
	type FieldValue,
	RULE_FIELDS,
	RULE_NUMBER_FIELDS,
	RULE_TEXT_FIELDS,
	type Rule,
	type RuleContext,
	type RuleField,
	type RulePatch,
	type RuleResult,
	type RuleTrack,
	type TextField,
} from "./types.ts";

// The working copy of one track while its rules run.
class Working {
	readonly cur: Record<string, FieldValue> = {};
	readonly before: Record<string, FieldValue> = {};
	readonly touched = new Map<RuleField, string[]>();
	ruleId = "";

	constructor(track: RuleTrack) {
		for (const f of RULE_FIELDS) {
			const v = track[f];
			const value = v === undefined || v === "" ? null : v;
			this.cur[f] = value;
			this.before[f] = value;
		}
	}

	get(field: RuleField): FieldValue {
		return this.cur[field] ?? null;
	}

	text(field: RuleField): string | null {
		const v = this.cur[field];
		return typeof v === "string" ? v : null;
	}

	set(field: RuleField, value: FieldValue): void {
		const next = value === "" ? null : value;
		if (this.cur[field] === next) return;
		this.cur[field] = next;
		const ids = this.touched.get(field);
		if (!ids) this.touched.set(field, [this.ruleId]);
		else if (ids[ids.length - 1] !== this.ruleId) ids.push(this.ruleId);
	}
}

type Test = (w: Working) => boolean;
type Step = (w: Working, ctx: RuleContext) => void;

const regexCache = new Map<string, RegExp>();
function regexOf(pattern: string, flags: string): RegExp {
	const key = `${flags}/${pattern}`;
	let re = regexCache.get(key);
	if (!re) {
		re = new RegExp(pattern, flags);
		if (regexCache.size > 500) regexCache.clear();
		regexCache.set(key, re);
	}
	return re;
}

const isEmpty = (v: FieldValue) => v === null || v === "" || v === 0;

function compileCondition(c: Condition): Test {
	if ("all" in c) {
		const parts = c.all.map(compileCondition);
		return (w) => parts.every((p) => p(w));
	}
	if ("any" in c) {
		const parts = c.any.map(compileCondition);
		return (w) => parts.some((p) => p(w));
	}
	if ("not" in c) {
		const inner = compileCondition(c.not);
		return (w) => !inner(w);
	}
	const field = c.field;
	switch (c.op) {
		case "empty":
			return (w) => isEmpty(w.get(field));
		case "notEmpty":
			return (w) => !isEmpty(w.get(field));
		case "gt":
		case "gte":
		case "lt":
		case "lte": {
			const op = c.op;
			const value = c.value;
			return (w) => {
				const v = w.get(field);
				if (typeof v !== "number") return false;
				return op === "gt"
					? v > value
					: op === "gte"
						? v >= value
						: op === "lt"
							? v < value
							: v <= value;
			};
		}
		case "matches": {
			const re = regexOf(c.value, (c.flags ?? "").replace(/[gy]/g, ""));
			return (w) => {
				const v = w.get(field);
				return v !== null && re.test(String(v));
			};
		}
		case "in": {
			const ic = c.ignoreCase !== false;
			const set = new Set(
				c.value.map((v) => (ic ? String(v).toLowerCase() : String(v))),
			);
			return (w) => {
				const v = w.get(field);
				if (v === null) return false;
				return set.has(ic ? String(v).toLowerCase() : String(v));
			};
		}
		default: {
			const op = c.op;
			const ic = c.ignoreCase !== false;
			const want = ic ? String(c.value).toLowerCase() : String(c.value);
			return (w) => {
				const raw = w.get(field);
				if (raw === null) return op === "neq";
				const v = ic ? String(raw).toLowerCase() : String(raw);
				switch (op) {
					case "eq":
						return v === want;
					case "neq":
						return v !== want;
					case "contains":
						return v.includes(want);
					case "startsWith":
						return v.startsWith(want);
					default:
						return v.endsWith(want);
				}
			};
		}
	}
}

function perText(
	fields: readonly TextField[] | undefined,
	fn: (value: string, w: Working, field: TextField) => string | null,
): Step {
	const list = fields ?? RULE_TEXT_FIELDS;
	return (w) => {
		for (const f of list) {
			const v = w.text(f);
			if (v === null) continue;
			w.set(f, fn(v, w, f));
		}
	};
}

function compileAction(a: Action): Step {
	switch (a.do) {
		case "whitespace":
			return perText(a.fields, (v) => collapseWhitespace(v));
		case "case": {
			const mode = a.mode;
			return perText(
				a.fields ?? ["title", "artist", "albumArtist", "album", "remixer"],
				(v) =>
					mode === "title"
						? titleCase(v)
						: mode === "lower"
							? v.toLowerCase()
							: mode === "upper"
								? v.toUpperCase()
								: sentenceCase(v),
			);
		}
		case "stripJunk":
			return perText(a.fields, (v) => stripJunk(v));
		case "stripTrackNumber":
			return perText(["title"], (v) => stripTrackNumber(v));
		case "normalizeMixBrackets":
			return perText(["title"], (v) => normalizeMixBrackets(v));
		case "normalizeSeparators": {
			const joiner = a.joiner ?? " & ";
			return perText(a.fields ?? ["artist", "albumArtist", "remixer"], (v) =>
				normalizeSeparators(v, joiner),
			);
		}
		case "moveFeaturing": {
			const to = a.to;
			return (w) => {
				const title = w.text("title");
				if (title === null) return;
				const found = extractFeaturing(title);
				if (found.features.length === 0) return;
				if (to === "artist") {
					const artist = w.text("artist") ?? "";
					const known = new Set(splitArtists(artist).map(fold));
					const fresh = found.features.filter((f) => !known.has(fold(f)));
					if (fresh.length > 0) {
						const credit = joinFeatures(fresh);
						const hasFeat = /\s(?:feat\.|ft\.)\s/i.test(artist);
						w.set(
							"artist",
							artist === ""
								? credit
								: hasFeat
									? `${artist}, ${credit}`
									: `${artist} feat. ${credit}`,
						);
					}
				} else {
					const prior = w.text("featured");
					const merged = [...splitArtists(prior), ...found.features];
					const seen = new Set<string>();
					const unique = merged.filter((n) => {
						const k = fold(n);
						if (seen.has(k)) return false;
						seen.add(k);
						return true;
					});
					w.set("featured", unique.join(", "));
				}
				w.set("title", found.title);
			};
		}
		case "splitArtistTitle":
			return (w) => {
				const title = w.text("title");
				if (title === null) return;
				const at = title.indexOf(" - ");
				if (at <= 0) return;
				const left = title.slice(0, at).trim();
				const right = title.slice(at + 3).trim();
				if (
					left === "" ||
					right === "" ||
					(looksLikeMix(right) && !right.includes(" - "))
				)
					return;
				const artist = w.text("artist");
				if (artist === null) {
					w.set("artist", left);
					w.set("title", right);
				} else if (fold(left) === fold(artist)) {
					w.set("title", right);
				}
			};
		case "set": {
			const { field, value } = a;
			const onlyIfEmpty = a.onlyIfEmpty === true;
			return (w) => {
				if (onlyIfEmpty && !isEmpty(w.get(field))) return;
				w.set(field, value);
			};
		}
		case "replace": {
			const re = a.literal ? null : regexOf(a.pattern, a.flags ?? "g");
			const needle = a.literal ? a.pattern : "";
			const repl = a.with;
			return perText(a.fields, (v) =>
				re ? v.replace(re, repl) : v.split(needle).join(repl),
			);
		}
		case "map": {
			const table = new Map<string, string>();
			for (const [k, v] of Object.entries(a.table)) table.set(fold(k), v);
			return perText(a.fields, (v) => table.get(fold(v)) ?? v);
		}
		case "alias": {
			const { field, table, threshold } = a;
			const fuzzy = a.fuzzy ?? table === "genre";
			return (w, ctx) => {
				const taxonomy = ctx.taxonomies?.[table];
				const v = w.text(field);
				if (!taxonomy || v === null) return;
				const res = resolveName(v, taxonomy, { fuzzy, threshold });
				if (res.name !== null) w.set(field, res.name);
			};
		}
	}
}

export interface CompiledRule {
	id: string;
	test: Test | null;
	steps: Step[];
}

export interface CompiledRules {
	rules: CompiledRule[];
}

const compiled = new WeakMap<readonly Rule[], CompiledRules>();

// Compiles rule data into closures once; the same array is reused afterwards.
export function compileRules(rules: readonly Rule[]): CompiledRules {
	const hit = compiled.get(rules);
	if (hit) return hit;
	const out: CompiledRules = {
		rules: rules
			.filter((r) => r.enabled !== false)
			.map((r) => ({
				id: r.id,
				test: r.when ? compileCondition(r.when) : null,
				steps: r.actions.map(compileAction),
			})),
	};
	compiled.set(rules, out);
	return out;
}

// Problems that would make a rule throw or never match, one string each.
export function validateRules(rules: readonly Rule[]): string[] {
	const problems: string[] = [];
	const ids = new Set<string>();
	for (const r of rules) {
		if (ids.has(r.id)) problems.push(`${r.id}: duplicate id`);
		ids.add(r.id);
		if (r.actions.length === 0) problems.push(`${r.id}: no actions`);
		try {
			compileRules([r]);
			if (r.when) checkFields(r.when);
		} catch (e) {
			problems.push(`${r.id}: ${(e as Error).message}`);
		}
		for (const a of r.actions) {
			if (a.do === "set" && !RULE_FIELDS.includes(a.field))
				problems.push(`${r.id}: unknown field ${a.field}`);
			if (
				a.do === "set" &&
				(RULE_NUMBER_FIELDS as readonly string[]).includes(a.field) &&
				typeof a.value === "string"
			)
				problems.push(`${r.id}: ${a.field} takes a number`);
		}
	}
	return problems;
}

function checkFields(c: Condition): void {
	if ("all" in c) c.all.forEach(checkFields);
	else if ("any" in c) c.any.forEach(checkFields);
	else if ("not" in c) checkFields(c.not);
	else if (!RULE_FIELDS.includes(c.field))
		throw new Error(`unknown field ${c.field}`);
}

const NO_CONTEXT: RuleContext = {};

// Runs the rules in order over one track. A later rule sees what the earlier
// ones wrote. Pure: the track is not touched; the result is the patch and, per
// field, the first before and the last after.
export function applyRules(
	track: RuleTrack,
	rules: readonly Rule[] | CompiledRules,
	ctx: RuleContext = NO_CONTEXT,
): RuleResult {
	const list = Array.isArray(rules)
		? compileRules(rules as readonly Rule[]).rules
		: (rules as CompiledRules).rules;
	const w = new Working(track);
	const matched: string[] = [];
	for (const rule of list) {
		if (rule.test && !rule.test(w)) continue;
		matched.push(rule.id);
		w.ruleId = rule.id;
		for (const step of rule.steps) step(w, ctx);
	}
	const patch: RulePatch = {};
	const changes: FieldChange[] = [];
	for (const [field, ruleIds] of w.touched) {
		const before = w.before[field] ?? null;
		const after = w.cur[field] ?? null;
		if (before === after) continue;
		patch[field] = after;
		changes.push({ field, before, after, ruleIds });
	}
	return { patch, changes, matched };
}
