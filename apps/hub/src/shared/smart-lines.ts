import type { Condition, Rule } from "@trackvault/core/smart";

// The smart-playlist editor writes a rule as lines of words, one condition each, which the
// hub reads back into core's `Rule` (a flat group: every line, or any line). The lines
// are the editor's language; the stored rule is core's JSON.
//
//   bpm >= 120            bpm between 120 128      rating > 3
//   genre is House        title contains edit      artist starts Kal
//   genre in House, Techno
//   key compatible 8A     key in 8A, 9A
//   tag any peak, warm    tag all a, b             tag none closing
//   added within 30       added before 90          played within 14
//   played before 60      played never
//   not <any line above>

const NUMERIC = {
	bpm: "bpm",
	rating: "rating",
	energy: "energy",
	year: "year",
	plays: "playCount",
	seconds: "durationSec",
	lufs: "lufs",
} as const;
const TEXT = {
	genre: "genre",
	artist: "artist",
	title: "title",
	album: "album",
	label: "label",
	remixer: "remixer",
} as const;
const COMPARE: Record<string, "eq" | "ne" | "gt" | "gte" | "lt" | "lte"> = {
	"=": "eq",
	"==": "eq",
	"!=": "ne",
	">": "gt",
	">=": "gte",
	"<": "lt",
	"<=": "lte",
};
const COMPARE_BACK: Record<string, string> = {
	eq: "=",
	ne: "!=",
	gt: ">",
	gte: ">=",
	lt: "<",
	lte: "<=",
};

const list = (text: string): string[] =>
	text
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

function number(text: string | undefined, line: number): number {
	const value = Number(text);
	if (text === undefined || text === "" || !Number.isFinite(value))
		throw new Error(`Line ${line}: "${text ?? ""}" is not a number`);
	return value;
}

function parseLine(raw: string, line: number): Rule {
	let text = raw.trim();
	if (/^not\s+/i.test(text)) {
		return { not: parseLine(text.replace(/^not\s+/i, ""), line) };
	}
	const [word = "", ...rest] = text.split(/\s+/);
	const field = word.toLowerCase();
	text = rest.join(" ");
	const fail = (why: string): never => {
		throw new Error(`Line ${line}: ${why}`);
	};

	if (field in NUMERIC) {
		const target = NUMERIC[field as keyof typeof NUMERIC];
		const [op = "", ...values] = text.split(/\s+/);
		if (op.toLowerCase() === "between") {
			return {
				field: target,
				op: "between",
				value: [number(values[0], line), number(values[1], line)],
			};
		}
		const compare = COMPARE[op];
		if (!compare) return fail(`"${field}" takes = != > >= < <= or between`);
		return {
			field: target,
			op: compare,
			value: number(values[0], line),
		} as Condition;
	}
	if (field in TEXT) {
		const target = TEXT[field as keyof typeof TEXT];
		const [op = "", ...values] = text.split(/\s+/);
		const value = values.join(" ").trim();
		if (value === "") return fail(`"${field} ${op}" needs a value`);
		switch (op.toLowerCase()) {
			case "is":
				return { field: target, op: "eq", value };
			case "contains":
				return { field: target, op: "contains", value };
			case "starts":
				return { field: target, op: "startsWith", value };
			case "in":
				return { field: target, op: "in", value: list(value) };
			case "notin":
				return { field: target, op: "notIn", value: list(value) };
			default:
				return fail(`"${field}" takes is, contains, starts, in or notin`);
		}
	}
	if (field === "key") {
		const [op = "", ...values] = text.split(/\s+/);
		const value = values.join(" ").trim();
		if (op.toLowerCase() === "compatible" && value)
			return { field: "key", op: "compatibleWith", value };
		if (op.toLowerCase() === "in" && value)
			return { field: "key", op: "in", value: list(value) };
		return fail('"key" takes compatible <key> or in <keys>');
	}
	if (field === "tag" || field === "tags") {
		const [op = "", ...values] = text.split(/\s+/);
		const names = list(values.join(" "));
		const kinds = { any: "hasAny", all: "hasAll", none: "hasNone" } as const;
		const kind = kinds[op.toLowerCase() as keyof typeof kinds];
		if (!kind || names.length === 0)
			return fail('"tag" takes any, all or none, then names');
		return { field: "tags", op: kind, value: names };
	}
	if (field === "added" || field === "played") {
		const [op = "", amount] = text.split(/\s+/);
		const target = field === "added" ? "addedAt" : "lastPlayedAt";
		if (field === "played" && op.toLowerCase() === "never")
			return { field: "lastPlayedAt", op: "never" };
		if (op.toLowerCase() !== "within" && op.toLowerCase() !== "before")
			return fail(`"${field}" takes within or before, then days`);
		return {
			field: target,
			op: op.toLowerCase() as "within" | "before",
			value: { days: number(amount, line) },
		};
	}
	return fail(`"${word}" is not a field`);
}

export function parseLines(
	match: "all" | "any",
	lines: readonly string[],
): Rule {
	const rules: Rule[] = [];
	lines.forEach((text, index) => {
		if (text.trim() !== "") rules.push(parseLine(text, index + 1));
	});
	return match === "all" ? { all: rules } : { any: rules };
}

const NUMERIC_BACK = Object.fromEntries(
	Object.entries(NUMERIC).map(([word, field]) => [field, word]),
);
const TEXT_BACK = Object.fromEntries(
	Object.entries(TEXT).map(([word, field]) => [field, word]),
);

type TextFieldName = (typeof TEXT)[keyof typeof TEXT];

function formatCondition(c: Condition): string | null {
	if (c.field in NUMERIC_BACK) {
		const word = NUMERIC_BACK[c.field];
		const n = c as Extract<
			Condition,
			{ field: keyof typeof NUMERIC_BACK & string }
		> & {
			value: number | [number, number];
		};
		if (n.op === "between") {
			const [low, high] = n.value as [number, number];
			return `${word} between ${low} ${high}`;
		}
		return `${word} ${COMPARE_BACK[n.op]} ${n.value}`;
	}
	if (c.field in TEXT_BACK) {
		const word = TEXT_BACK[c.field];
		const t = c as Extract<Condition, { field: TextFieldName }>;
		const v = t.value;
		switch (t.op) {
			case "eq":
				return `${word} is ${v}`;
			case "contains":
				return `${word} contains ${v}`;
			case "startsWith":
				return `${word} starts ${v}`;
			case "in":
				return `${word} in ${(v as string[]).join(", ")}`;
			default:
				return `${word} notin ${(v as string[]).join(", ")}`;
		}
	}
	if (c.field === "key")
		return c.op === "compatibleWith"
			? `key compatible ${c.value}`
			: `key in ${(c.value as string[]).join(", ")}`;
	if (c.field === "tags")
		return `tag ${{ hasAny: "any", hasAll: "all", hasNone: "none" }[c.op]} ${c.value.join(", ")}`;
	if (c.field === "lastPlayedAt" && c.op === "never") return "played never";
	if (c.field === "addedAt" || c.field === "lastPlayedAt") {
		const days = (c as { value: { days: number }; op: string }).value.days;
		const word = c.field === "addedAt" ? "added" : "played";
		return `${word} ${c.op} ${days}`;
	}
	return null;
}

function formatRule(rule: Rule): string | null {
	if ("not" in rule) {
		const inner = formatRule(rule.not);
		return inner === null || /^not /.test(inner) ? null : `not ${inner}`;
	}
	if ("all" in rule || "any" in rule) return null;
	return formatCondition(rule);
}

// The editor's form of a stored rule, or null when the rule has a shape the lines
// cannot say (nested groups).
export function formatLines(
	rule: Rule,
): { match: "all" | "any"; lines: string[] } | null {
	if (!("all" in rule) && !("any" in rule)) {
		const one = formatRule(rule);
		return one === null ? null : { match: "all", lines: [one] };
	}
	const match = "all" in rule ? "all" : "any";
	const children = "all" in rule ? rule.all : rule.any;
	const lines: string[] = [];
	for (const child of children) {
		const line = formatRule(child);
		if (line === null) return null;
		lines.push(line);
	}
	return { match, lines };
}
