export type Range = { start: number; end: number } | "unsatisfiable" | null;

// A single byte range of a `Range` header; several ranges are served as the whole file.
export function parseRange(header: string | null, size: number): Range {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, from, to] = match;
	if (from === "" && to === "") return null;
	let start: number;
	let end: number;
	if (from === "") {
		const suffix = Number(to);
		if (suffix === 0) return "unsatisfiable";
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(from);
		end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
	}
	if (start >= size || start > end) return "unsatisfiable";
	return { start, end };
}
