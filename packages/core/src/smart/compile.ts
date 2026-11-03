import {
	camelotString,
	compatibleKeys,
	parseCamelot,
} from "../harmonic/camelot.ts";
import type {
	CompiledRule,
	Condition,
	Rule,
	SmartSchema,
	SmartTrack,
} from "./types.ts";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const DAY_MS = 86_400_000;

function ident(name: string): string {
	if (!IDENT.test(name)) throw new Error(`unsafe SQL identifier: ${name}`);
	return name;
}

export const isGroup = (
	r: Rule,
): r is { all: Rule[] } | { any: Rule[] } | { not: Rule } =>
	"all" in r || "any" in r || "not" in r;

const likeEscape = (s: string): string => s.replace(/[\\%_]/g, "\\$&");

const CMP: Record<string, string> = {
	eq: "=",
	ne: "<>",
	gt: ">",
	gte: ">=",
	lt: "<",
	lte: "<=",
};

// Camelot strings a key condition matches (what the key column must hold).
export function keySet(c: Extract<Condition, { field: "key" }>): string[] {
	if (c.op === "in")
		return [
			...new Set(
				c.value.flatMap((k) => {
					const p = parseCamelot(k);
					return p ? [camelotString(p)] : [];
				}),
			),
		];
	const from = parseCamelot(c.value);
	if (!from) return [];
	return compatibleKeys(from, { includeBoosts: c.includeBoosts }).map((k) =>
		camelotString(k.key),
	);
}

// A parameterized WHERE fragment (no leading "WHERE") and its params, in order.
// `now` is epoch ms, for the relative-date conditions.
export function compileRule(
	rule: Rule,
	schema: SmartSchema,
	now = Date.now(),
): CompiledRule {
	const params: Array<string | number> = [];
	const col = (field: string): string => {
		const name = (schema.columns as Record<string, string | undefined>)[field];
		if (!name) throw new Error(`smart schema has no column for "${field}"`);
		const scale = (schema.scale as Record<string, number> | undefined)?.[field];
		if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0))
			throw new Error(`smart schema scale for "${field}" must be positive`);
		return scale === undefined ? ident(name) : `(${ident(name)} / ${scale}.0)`;
	};
	const unit = (ms: number): number =>
		schema.dateUnit === "s" ? Math.floor(ms / 1000) : ms;
	const marks = (n: number): string => Array(n).fill("?").join(",");

	const cond = (c: Condition): string => {
		switch (c.field) {
			case "tags": {
				const t = schema.tags;
				if (!t) throw new Error("smart schema has no tags mapping");
				const tag = ident(t.tagColumn);
				const link = ident(t.table);
				const named = t.join ? ident(t.join.table) : link;
				const from = t.join
					? `${link} JOIN ${named} ON ${named}.${ident(t.join.idColumn)} = ${link}.${ident(t.join.linkColumn)}`
					: link;
				const inner = `FROM ${from} WHERE ${link}.${ident(t.trackColumn)} = ${ident(t.trackId)} AND ${named}.${tag} COLLATE NOCASE IN (${marks(c.value.length)})`;
				if (c.value.length === 0) return c.op === "hasNone" ? "1" : "0";
				params.push(...c.value);
				if (c.op === "hasAll") {
					return `(SELECT COUNT(DISTINCT lower(${named}.${tag})) ${inner}) >= ${new Set(c.value.map((v) => v.toLowerCase())).size}`;
				}
				return `${c.op === "hasNone" ? "NOT " : ""}EXISTS (SELECT 1 ${inner})`;
			}
			case "key": {
				const keys = keySet(c);
				if (keys.length === 0) return "0";
				params.push(...keys);
				return `${col("key")} IN (${marks(keys.length)})`;
			}
			case "addedAt":
			case "lastPlayedAt": {
				const name = col(c.field);
				if (c.op === "never") return `${name} IS NULL`;
				const cutoff = unit(now - c.value.days * DAY_MS);
				params.push(cutoff);
				if (c.op === "within") return `${name} >= ?`;
				return c.includeNever === false
					? `${name} < ?`
					: `(${name} IS NULL OR ${name} < ?)`;
			}
			case "genre":
			case "artist":
			case "title":
			case "album":
			case "label":
			case "remixer": {
				const name = col(c.field);
				if (c.op === "in" || c.op === "notIn") {
					if (c.value.length === 0) return c.op === "in" ? "0" : "1";
					params.push(...c.value);
					return `${name} COLLATE NOCASE ${c.op === "notIn" ? "NOT " : ""}IN (${marks(c.value.length)})`;
				}
				if (c.op === "eq") {
					params.push(c.value);
					return `${name} = ? COLLATE NOCASE`;
				}
				const text = likeEscape(c.value as string);
				params.push(c.op === "contains" ? `%${text}%` : `${text}%`);
				return `${name} LIKE ? ESCAPE '\\'`;
			}
			default: {
				const name = col(c.field);
				if (c.op === "between") {
					params.push(c.value[0], c.value[1]);
					return `${name} BETWEEN ? AND ?`;
				}
				params.push(c.value);
				return `${name} ${CMP[c.op]} ?`;
			}
		}
	};

	const walk = (r: Rule): string => {
		if ("all" in r || "any" in r) {
			const list = "all" in r ? r.all : r.any;
			if (list.length === 0) return "all" in r ? "1" : "0";
			return `(${list.map(walk).join("all" in r ? " AND " : " OR ")})`;
		}
		if ("not" in r) return `NOT (${walk(r.not)})`;
		return cond(r);
	};
	return { sql: walk(rule), params };
}

// ---- in-memory evaluator ----------------------------------------------------

const lower = (s: string | null | undefined): string => (s ?? "").toLowerCase();

export function matchesRule(
	track: SmartTrack,
	rule: Rule,
	now = Date.now(),
): boolean {
	if ("all" in rule) return rule.all.every((r) => matchesRule(track, r, now));
	if ("any" in rule) return rule.any.some((r) => matchesRule(track, r, now));
	if ("not" in rule) return !matchesRule(track, rule.not, now);
	const c = rule;
	switch (c.field) {
		case "tags": {
			const have = new Set((track.tags ?? []).map(lower));
			const want = c.value.map(lower);
			if (c.op === "hasAny") return want.some((t) => have.has(t));
			if (c.op === "hasAll") return want.every((t) => have.has(t));
			return !want.some((t) => have.has(t));
		}
		case "key": {
			const k = parseCamelot(track.key);
			return k ? keySet(c).includes(camelotString(k)) : false;
		}
		case "addedAt":
		case "lastPlayedAt": {
			const v = track[c.field];
			if (c.op === "never") return v == null;
			const cutoff = now - c.value.days * DAY_MS;
			if (c.op === "within") return v != null && v >= cutoff;
			return v == null ? c.includeNever !== false : v < cutoff;
		}
		case "genre":
		case "artist":
		case "title":
		case "album":
		case "label":
		case "remixer": {
			const v = lower(track[c.field]);
			if (c.op === "in") return c.value.map(lower).includes(v);
			if (c.op === "notIn") return !c.value.map(lower).includes(v);
			if (c.op === "eq") return v === lower(c.value as string);
			// SQL LIKE on NULL is false, as is a missing value here.
			if (track[c.field] == null) return false;
			const needle = lower(c.value as string);
			return c.op === "contains" ? v.includes(needle) : v.startsWith(needle);
		}
		default: {
			const v = track[c.field];
			if (v == null) return false;
			if (c.op === "between") return v >= c.value[0] && v <= c.value[1];
			switch (c.op) {
				case "eq":
					return v === c.value;
				case "ne":
					return v !== c.value;
				case "gt":
					return v > c.value;
				case "gte":
					return v >= c.value;
				case "lt":
					return v < c.value;
				default:
					return v <= c.value;
			}
		}
	}
}
