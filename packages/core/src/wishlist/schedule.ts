// When to search again for a want nobody had. Pure: the caller keeps the state.

export interface RetryState {
	// Searches made so far.
	attempts: number;
	lastAttemptAt: number | null;
}

export interface RetryPolicy {
	// Delay before attempt n (0-based) in ms; the last entry repeats.
	delaysMs: readonly number[];
	// After this many searches the want is given up on.
	maxAttempts: number;
	// 0..1: the delay is stretched by up to this fraction, to spread a bulk import.
	jitter: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
	// The first pass walks the query variants quickly, then it slows to weekly.
	delaysMs: [0, 5 * MIN, 30 * MIN, 2 * HOUR, 12 * HOUR, DAY, 3 * DAY, 7 * DAY],
	maxAttempts: 14,
	jitter: 0.2,
};

export type NextSearch =
	| { due: true; at: number; attempt: number; variantIndex: number }
	| { due: false; giveUp: true };

// `variantCount` is buildQueries(...).length; each attempt uses the next variant.
export function nextSearch(
	state: RetryState,
	variantCount: number,
	now: number,
	policy: RetryPolicy = DEFAULT_RETRY_POLICY,
	random: () => number = Math.random,
): NextSearch {
	if (state.attempts >= policy.maxAttempts) return { due: false, giveUp: true };
	const index = Math.min(state.attempts, policy.delaysMs.length - 1);
	const delay = (policy.delaysMs[index] ?? 0) * (1 + policy.jitter * random());
	const from = state.lastAttemptAt ?? now;
	return {
		due: true,
		at: state.lastAttemptAt === null ? now : from + delay,
		attempt: state.attempts,
		variantIndex: variantCount > 0 ? state.attempts % variantCount : 0,
	};
}

export const isDue = (next: NextSearch, now: number) =>
	next.due && next.at <= now;
