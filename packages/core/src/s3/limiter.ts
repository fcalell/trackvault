// A bandwidth limit shared by every request of a job: bytes are paid for before they
// are written, so the average rate holds over a few hundred milliseconds. 0 is
// unlimited; the rate can change while the job runs (`setRate`).
export class RateLimiter {
	private free = 0;
	private bytesPerSecond: number;
	constructor(bytesPerSecond = 0) {
		this.bytesPerSecond = bytesPerSecond;
	}

	setRate(bytesPerSecond: number): void {
		this.bytesPerSecond = bytesPerSecond;
	}

	get rate(): number {
		return this.bytesPerSecond;
	}

	async take(bytes: number, signal?: AbortSignal): Promise<void> {
		if (this.bytesPerSecond <= 0 || bytes <= 0) return;
		const now = Date.now();
		this.free = Math.max(this.free, now) + (bytes / this.bytesPerSecond) * 1000;
		// A quarter second of credit, so small writes are not each delayed.
		const wait = this.free - now - 250;
		if (wait > 0) await sleep(wait, signal);
	}
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timer);
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
