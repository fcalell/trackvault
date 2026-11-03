// One estimate: `value` is null when it could not be measured.
export interface Estimate<T> {
	value: T | null;
	// 0..1; 0 when value is null.
	confidence: number;
	reason?: "unavailable" | "decode-failed" | "silent" | "too-short";
}

export const none = <T>(reason: Estimate<T>["reason"]): Estimate<T> => ({
	value: null,
	confidence: 0,
	reason,
});

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
