// Small async helpers: an abortable sleep, jittered backoff, a serial "run again if
// kicked" runner, and a bounded worker pool.

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve();
		const timer = setTimeout(done, ms);
		function done() {
			clearTimeout(timer);
			signal?.removeEventListener("abort", done);
			resolve();
		}
		signal?.addEventListener("abort", done, { once: true });
	});
}

// Exponential backoff with +-20% jitter: attempt 1 -> base, doubling up to `cap`.
export function backoffMs(attempt: number, base = 2000, cap = 15 * 60_000) {
	const raw = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
	return Math.round(raw * (0.8 + Math.random() * 0.4));
}

// Runs `fn` one at a time. `kick()` while it runs schedules exactly one more run after it;
// `kick()` while idle starts it. Errors go to `onError`; the runner never stops.
export class Runner {
	private running = false;
	private again = false;
	private idle: Promise<void> = Promise.resolve();
	private readonly fn: () => Promise<void>;
	private readonly onError: (error: unknown) => void;

	constructor(fn: () => Promise<void>, onError: (error: unknown) => void) {
		this.fn = fn;
		this.onError = onError;
	}

	kick(): void {
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = true;
		this.idle = (async () => {
			try {
				do {
					this.again = false;
					try {
						await this.fn();
					} catch (error) {
						this.onError(error);
					}
				} while (this.again);
			} finally {
				this.running = false;
			}
		})();
	}

	get busy(): boolean {
		return this.running;
	}

	// Resolves when the current run (and any queued one) has finished.
	whenIdle(): Promise<void> {
		return this.idle;
	}
}

// Runs `worker` `size` times concurrently until it resolves; all must settle.
export async function pool(
	size: number,
	worker: (index: number) => Promise<void>,
): Promise<void> {
	await Promise.all(
		Array.from({ length: Math.max(1, size) }, (_, i) => worker(i)),
	);
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export function isoNow(): string {
	return new Date().toISOString();
}

export function formatBytes(n: number): string {
	const units = ["B", "KiB", "MiB", "GiB", "TiB"];
	let v = n;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
