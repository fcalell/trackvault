export function compareTwoStrings(a: string, b: string): number {
	const first = a.replace(/[^A-Z0-9]+/gi, "");
	const second = b.replace(/[^A-Z0-9]+/gi, "");

	if (first === second) return 1;
	if (first.length < 2 || second.length < 2) return 0;

	const firstBigrams = new Map<string, number>();
	for (let i = 0; i < first.length - 1; i++) {
		const bigram = first.substring(i, i + 2);
		firstBigrams.set(bigram, (firstBigrams.get(bigram) ?? 0) + 1);
	}

	let intersectionSize = 0;
	for (let i = 0; i < second.length - 1; i++) {
		const bigram = second.substring(i, i + 2);
		const count = firstBigrams.get(bigram) ?? 0;
		if (count > 0) {
			firstBigrams.set(bigram, count - 1);
			intersectionSize++;
		}
	}

	return (2.0 * intersectionSize) / (first.length + second.length - 2);
}
