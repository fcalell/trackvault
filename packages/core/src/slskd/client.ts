import type {
	SlskdEnqueueFile,
	SlskdResponse,
	SlskdSearch,
	SlskdSearchRequest,
	SlskdServerState,
	SlskdTransfer,
	SlskdUserInfo,
	SlskdUserStatus,
	SlskdUserTransfers,
} from "./types.ts";

export interface SlskdClientOptions {
	// e.g. "http://localhost:5030" (include any url_base).
	baseUrl: string;
	apiKey: string;
	// Per request. Default 15000.
	timeoutMs?: number;
	// Extra tries for idempotent requests on network errors, 429 and 5xx. Default 2.
	retries?: number;
	fetch?: typeof fetch;
}

export class SlskdError extends Error {
	readonly status: number | null;
	readonly body: string | undefined;
	constructor(message: string, status: number | null, body?: string) {
		super(message);
		this.name = "SlskdError";
		this.status = status;
		this.body = body;
	}
}

interface RequestInit2 {
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	// POST is not retried unless the call is idempotent.
	retry?: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

export function createSlskdClient(options: SlskdClientOptions) {
	const base = options.baseUrl.replace(/\/+$/, "");
	const timeoutMs = options.timeoutMs ?? 15_000;
	const retries = options.retries ?? 2;
	const doFetch = options.fetch ?? fetch;

	async function request<T>(
		method: "GET" | "POST" | "PUT" | "DELETE",
		path: string,
		init: RequestInit2 = {},
	): Promise<T> {
		const url = new URL(`${base}/api/v0${path}`);
		for (const [k, v] of Object.entries(init.query ?? {}))
			if (v !== undefined) url.searchParams.set(k, String(v));
		const canRetry = init.retry ?? method !== "POST";
		const attempts = canRetry ? retries + 1 : 1;
		let last: unknown;
		for (let i = 0; i < attempts; i++) {
			if (i > 0) await wait(250 * 2 ** (i - 1));
			try {
				const res = await doFetch(url, {
					method,
					headers: {
						"X-API-Key": options.apiKey,
						Accept: "application/json",
						...(init.body === undefined
							? {}
							: { "Content-Type": "application/json" }),
					},
					body: init.body === undefined ? undefined : JSON.stringify(init.body),
					signal: AbortSignal.timeout(timeoutMs),
				});
				if (!res.ok) {
					const text = await res.text().catch(() => "");
					const err = new SlskdError(
						`slskd ${method} ${path} -> ${res.status}`,
						res.status,
						text.slice(0, 500),
					);
					if (res.status === 429 || res.status >= 500) {
						last = err;
						continue;
					}
					throw err;
				}
				if (res.status === 204) return undefined as T;
				const text = await res.text();
				return (text === "" ? undefined : JSON.parse(text)) as T;
			} catch (e) {
				if (
					e instanceof SlskdError &&
					e.status !== null &&
					e.status < 500 &&
					e.status !== 429
				)
					throw e;
				last = e;
			}
		}
		if (last instanceof SlskdError) throw last;
		throw new SlskdError(
			`slskd ${method} ${path} failed: ${last instanceof Error ? last.message : String(last)}`,
			null,
		);
	}

	return {
		request,
		searches: {
			// Idempotent when `id` is set, so it is retried then.
			create: (req: SlskdSearchRequest) =>
				request<SlskdSearch>("POST", "/searches", {
					body: req,
					retry: req.id !== undefined,
				}),
			list: () => request<SlskdSearch[]>("GET", "/searches"),
			get: (id: string) => request<SlskdSearch>("GET", `/searches/${enc(id)}`),
			responses: (id: string) =>
				request<SlskdResponse[]>("GET", `/searches/${enc(id)}/responses`),
			// Ends a running search; its results stay.
			stop: (id: string) => request<void>("PUT", `/searches/${enc(id)}`),
			delete: (id: string) => request<void>("DELETE", `/searches/${enc(id)}`),
		},
		downloads: {
			// Several files from one peer per call: slskd queues them with that peer.
			enqueue: (username: string, files: readonly SlskdEnqueueFile[]) =>
				request<unknown>("POST", `/transfers/downloads/${enc(username)}`, {
					body: files,
				}),
			list: () => request<SlskdUserTransfers[]>("GET", "/transfers/downloads"),
			listForUser: (username: string) =>
				request<SlskdUserTransfers>(
					"GET",
					`/transfers/downloads/${enc(username)}`,
				),
			get: (username: string, id: string) =>
				request<SlskdTransfer>(
					"GET",
					`/transfers/downloads/${enc(username)}/${enc(id)}`,
				),
			// `remove` also drops the finished record from slskd.
			cancel: (username: string, id: string, remove = false) =>
				request<void>(
					"DELETE",
					`/transfers/downloads/${enc(username)}/${enc(id)}`,
					{ query: { remove } },
				),
			clearCompleted: () =>
				request<void>("DELETE", "/transfers/downloads/all/completed"),
		},
		users: {
			info: (username: string) =>
				request<SlskdUserInfo>("GET", `/users/${enc(username)}/info`),
			status: (username: string) =>
				request<SlskdUserStatus>("GET", `/users/${enc(username)}/status`),
		},
		server: {
			state: () => request<SlskdServerState>("GET", "/server"),
			connect: () => request<void>("PUT", "/server"),
			disconnect: () => request<void>("DELETE", "/server"),
		},
		application: {
			state: () => request<Record<string, unknown>>("GET", "/application"),
		},
		options: {
			// The running configuration (secrets are redacted by slskd).
			get: () => request<Record<string, unknown>>("GET", "/options"),
		},
	};
}

export type SlskdClient = ReturnType<typeof createSlskdClient>;

// Flattens the per-user nesting of the transfers list.
export function flattenTransfers(
	groups: readonly SlskdUserTransfers[],
): SlskdTransfer[] {
	return groups.flatMap((g) => g.directories.flatMap((d) => d.files));
}

export const isTransferFinished = (t: Pick<SlskdTransfer, "state">) =>
	t.state.startsWith("Completed");
export const isTransferSucceeded = (t: Pick<SlskdTransfer, "state">) =>
	t.state.includes("Succeeded");
