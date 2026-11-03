export interface BpmMatch {
	// 0..1
	score: number;
	// Tempo ratio applied to the next track: 1, 0.5 (half-time) or 2 (double-time).
	multiplier: 1 | 0.5 | 2;
	// Pitch change needed on the next track, percent (signed).
	pitchPercent: number;
}

// Compares two tempos allowing half/double-time. `rangePercent` is the pitch
// fader range (8 on most CDJs, 16 on turntables): beyond it the score is 0.
export function bpmMatch(a: number, b: number, rangePercent = 8): BpmMatch {
	let best: BpmMatch = { score: 0, multiplier: 1, pitchPercent: Infinity };
	for (const multiplier of [1, 0.5, 2] as const) {
		const pitchPercent = (a / (b * multiplier) - 1) * 100;
		const off = Math.abs(pitchPercent);
		if (off > rangePercent) continue;
		// Smooth fall-off over the range; a half/double mix costs a little.
		const score =
			(1 - off / rangePercent) ** 1.5 * (multiplier === 1 ? 1 : 0.85);
		if (score > best.score) best = { score, multiplier, pitchPercent };
	}
	if (best.score === 0) best.pitchPercent = (a / b - 1) * 100;
	return best;
}
