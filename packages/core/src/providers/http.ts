import type { ProviderCache } from "./types.ts";

// Smooth rate limiter: `capacity` immediate calls, then one per `1000/perSecond` ms.
export class TokenBucket {
	readonly perSecond: number;
	readonly capacity: number;
	private tokens: number;
	private last: number;
	private chain: Promise<void> = Promise.resolve();
	private readonly now: () => number;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(
		perSecond: number,
		capacity = 1,
		now: () => number = Date.now,
		sleep: (ms: number) => Promise<void> = (ms) =>
			new Promise((r) => setTimeout(r, ms)),
	) {
		this.perSecond = perSecond;
		this.capacity = capacity;
		this.now = now;
		this.sleep = sleep;
		this.tokens = capacity;
		this.last = now();
	}

	// Resolves when a call may proceed. Callers are served in order.
	take(): Promise<void> {
		const turn = this.chain.then(async () => {
			for (;;) {
				const t = this.now();
				this.tokens = Math.min(
					this.capacity,
					this.tokens + ((t - this.last) / 1000) * this.perSecond,
				);
				this.last = t;
				if (this.tokens >= 1) {
					this.tokens -= 1;
					return;
				}
				await this.sleep(
					Math.ceil(((1 - this.tokens) / this.perSecond) * 1000),
				);
			}
		});
		this.chain = turn.catch(() => {});
		return turn;
	}
}

export class HttpError extends Error {
	readonly status: number;
	readonly url: string;
	readonly body: string;

	constructor(status: number, url: string, body: string) {
		super(`HTTP ${status} from ${new URL(url).host}`);
		this.status = status;
		this.url = url;
		this.body = body;
	}
}

export interface JsonRequest {
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
	// GETs are cached by URL when a cache is set. Default true for GET.
	cache?: boolean;
	ttlMs?: number;
}

export interface Http {
	json<T>(url: string, init?: JsonRequest): Promise<T>;
}

const DAY = 86_400_000;

export function createHttp(options: {
	fetch?: typeof fetch;
	limiter: TokenBucket;
	cache?: ProviderCache;
	headers?: Record<string, string>;
	timeoutMs?: number;
}): Http {
	const doFetch = options.fetch ?? fetch;
	return {
		async json<T>(url: string, init: JsonRequest = {}): Promise<T> {
			const method = init.method ?? "GET";
			const cacheable =
				options.cache && method === "GET" && init.cache !== false;
			if (cacheable) {
				const hit = await options.cache?.get(url);
				if (hit !== undefined) return hit as T;
			}
			// One retry on 429/503, honouring Retry-After (capped at 10 s).
			for (let attempt = 0; ; attempt++) {
				await options.limiter.take();
				const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
				const res = await doFetch(url, {
					method,
					headers: {
						accept: "application/json",
						...options.headers,
						...init.headers,
					},
					body: init.body,
					signal: init.signal
						? AbortSignal.any([init.signal, timeout])
						: timeout,
				});
				if ((res.status === 429 || res.status === 503) && attempt === 0) {
					const wait = Math.min(
						10,
						Number(res.headers.get("retry-after")) || 2,
					);
					await new Promise((r) => setTimeout(r, wait * 1000));
					continue;
				}
				if (!res.ok)
					throw new HttpError(
						res.status,
						url,
						(await res.text()).slice(0, 500),
					);
				const data = (await res.json()) as T;
				if (cacheable)
					await options.cache?.set(url, data, init.ttlMs ?? 7 * DAY);
				return data;
			}
		},
	};
}
