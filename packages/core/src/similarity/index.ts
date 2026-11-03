// String similarity on folded text (see normalize/fold): all scores are 0..1.

// Levenshtein distance, giving up once it must exceed `max`.
export function levenshtein(a: string, b: string, max = Infinity): number {
	if (a === b) return 0;
	if (a.length > b.length) [a, b] = [b, a];
	if (b.length - a.length > max) return max + 1;
	let prev = new Uint32Array(a.length + 1);
	let next = new Uint32Array(a.length + 1);
	for (let i = 0; i <= a.length; i++) prev[i] = i;
	for (let j = 1; j <= b.length; j++) {
		next[0] = j;
		let rowMin = j;
		const bc = b.charCodeAt(j - 1);
		for (let i = 1; i <= a.length; i++) {
			const cost = a.charCodeAt(i - 1) === bc ? 0 : 1;
			const v = Math.min(
				(prev[i] as number) + 1,
				(next[i - 1] as number) + 1,
				(prev[i - 1] as number) + cost,
			);
			next[i] = v;
			if (v < rowMin) rowMin = v;
		}
		if (rowMin > max) return max + 1;
		[prev, next] = [next, prev];
	}
	return prev[a.length] as number;
}

export function ratio(a: string, b: string): number {
	const longest = Math.max(a.length, b.length);
	if (longest === 0) return 1;
	return 1 - levenshtein(a, b) / longest;
}

// Word-order-insensitive: the best of the sorted-words ratio and the Dice
// coefficient over the word sets.
export function tokenSetSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	const ta = a.split(" ").filter(Boolean);
	const tb = b.split(" ").filter(Boolean);
	if (ta.length === 0 || tb.length === 0) return 0;
	const sa = new Set(ta);
	const sb = new Set(tb);
	let shared = 0;
	for (const t of sa) if (sb.has(t)) shared++;
	const dice = (2 * shared) / (sa.size + sb.size);
	const sorted = ratio([...sa].sort().join(" "), [...sb].sort().join(" "));
	return Math.max(dice, sorted);
}
