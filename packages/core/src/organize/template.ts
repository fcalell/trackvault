export const TEMPLATE_TOKENS = [
	"artist",
	"albumartist",
	"album",
	"title",
	"mix",
	"remixer",
	"genre",
	"year",
	"bpm",
	"key",
	"label",
	"ext",
] as const;

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

export type Part =
	| { kind: "text"; text: string }
	| { kind: "token"; token: TemplateToken; fallback: string | null }
	// Dropped whole when any of its tokens is empty.
	| { kind: "optional"; parts: Part[] };

export interface ParsedTemplate {
	// One entry per "/"-separated path segment.
	segments: Part[][];
	tokens: Set<TemplateToken>;
	endsWithExt: boolean;
}

const TOKEN_SET = new Set<string>(TEMPLATE_TOKENS);

// Syntax: {token}, {token|fallback}, [ optional ({token}) text ], "/" between
// path segments, backslash escapes one of { } [ ] / |.
export function parseTemplate(template: string): ParsedTemplate {
	const tokens = new Set<TemplateToken>();
	let i = 0;

	function parseParts(stopAtBracket: boolean): Part[][] {
		const segments: Part[][] = [[]];
		let text = "";
		const cur = () => segments[segments.length - 1] as Part[];
		const flush = () => {
			if (text !== "") cur().push({ kind: "text", text });
			text = "";
		};
		while (i < template.length) {
			const ch = template[i] as string;
			if (ch === "\\" && i + 1 < template.length) {
				text += template[i + 1];
				i += 2;
			} else if (ch === "{") {
				const end = template.indexOf("}", i);
				if (end < 0) throw new Error("unclosed { in template");
				const body = template.slice(i + 1, end);
				const bar = body.indexOf("|");
				const name = (bar < 0 ? body : body.slice(0, bar)).trim().toLowerCase();
				if (!TOKEN_SET.has(name)) throw new Error(`unknown token {${name}}`);
				flush();
				tokens.add(name as TemplateToken);
				cur().push({
					kind: "token",
					token: name as TemplateToken,
					fallback: bar < 0 ? null : body.slice(bar + 1),
				});
				i = end + 1;
			} else if (ch === "[") {
				if (stopAtBracket) throw new Error("nested [ in template");
				flush();
				i++;
				const inner = parseParts(true);
				if (inner.length !== 1) throw new Error("/ inside [ ] in template");
				cur().push({ kind: "optional", parts: inner[0] as Part[] });
			} else if (ch === "]") {
				if (!stopAtBracket) throw new Error("unmatched ] in template");
				flush();
				i++;
				return segments;
			} else if (ch === "/") {
				flush();
				if (stopAtBracket) {
					segments.push([]);
					i++;
				} else {
					segments.push([]);
					i++;
				}
			} else {
				text += ch;
				i++;
			}
		}
		if (stopAtBracket) throw new Error("unclosed [ in template");
		flush();
		return segments;
	}

	const segments = parseParts(false).filter((s) => s.length > 0);
	if (segments.length === 0) throw new Error("empty template");
	const lastSeg = segments[segments.length - 1] as Part[];
	const last = lastSeg[lastSeg.length - 1];
	return {
		segments,
		tokens,
		endsWithExt: last?.kind === "token" && last.token === "ext",
	};
}

export type TokenValues = Partial<Record<TemplateToken, string>>;

function render(parts: Part[], values: TokenValues): string {
	let out = "";
	for (const p of parts) {
		if (p.kind === "text") out += p.text;
		else if (p.kind === "token") out += values[p.token] ?? p.fallback ?? "";
		else {
			const missing = p.parts.some(
				(q) => q.kind === "token" && !(values[q.token] ?? q.fallback),
			);
			if (!missing) out += render(p.parts, values);
		}
	}
	return out;
}

export function renderSegments(
	parsed: ParsedTemplate,
	values: TokenValues,
): string[] {
	return parsed.segments.map((s) => render(s, values));
}
