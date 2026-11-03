import {
	type Check,
	DeviceHello,
	type DeviceHello as DeviceHelloT,
	ErrorBody,
	type ErrorCode,
	ExportAck,
	ExportPage,
	ExportRequest,
	HelloResponse,
	ImportBatch,
	ImportResult,
	InboxCheckRequest,
	InboxCheckResponse,
	ManifestPage,
	ManifestRequest,
	Ok,
	PROTOCOL_HEADER,
	PROTOCOL_VERSION,
	parse,
	routes,
	StateReport,
	UploadChunkResponse,
	UploadComplete,
	UploadCompleteResponse,
	UploadInit,
	UploadInitResponse,
	UploadStatus,
} from "@trackvault/core/sync";
import type { Logger } from "../log.ts";
import { backoffMs, errorMessage, sleep } from "../util.ts";

export type HubErrorCode = ErrorCode | "network" | "bad-response" | "unknown";

export class HubError extends Error {
	readonly status: number;
	readonly code: HubErrorCode;
	readonly detail: Record<string, string | number | boolean | null>;
	readonly retryAfterMs: number | null;
	constructor(
		status: number,
		code: HubErrorCode,
		message: string,
		detail: HubError["detail"] = {},
		retryAfterMs: number | null = null,
	) {
		super(message);
		this.name = "HubError";
		this.status = status;
		this.code = code;
		this.detail = detail;
		this.retryAfterMs = retryAfterMs;
	}

	get retryable(): boolean {
		if (this.code === "network") return true;
		return [408, 425, 429, 500, 502, 503, 504].includes(this.status);
	}
}

export interface RequestOptions {
	json?: unknown;
	body?: Uint8Array;
	headers?: Record<string, string>;
	query?: Record<string, string | number>;
	signal?: AbortSignal;
	// Extra tries after the first for network errors and 429/5xx (default 4).
	retries?: number;
	// Abort the request after this long (default 30 s; streams use `idleMs`).
	timeoutMs?: number;
}

// The agent's HTTP side of the hub: the `/sync` routes with the device key and protocol
// header, retries with backoff for the transient failures, and validated JSON answers.
export class HubClient {
	private readonly base: string;
	private readonly key: string;
	private readonly log: Logger;
	private onUnauthorized: (() => void) | null = null;

	constructor(hubUrl: string, key: string, log: Logger) {
		this.base = hubUrl.replace(/\/+$/, "");
		this.key = key;
		this.log = log;
	}

	setUnauthorizedHandler(handler: () => void): void {
		this.onUnauthorized = handler;
	}

	get origin(): string {
		return this.base;
	}

	authHeaders(): Record<string, string> {
		return {
			authorization: `Bearer ${this.key}`,
			[PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
		};
	}

	// One attempt. Throws HubError for a non-2xx status or a network failure.
	private async once(
		method: string,
		path: string,
		options: RequestOptions,
	): Promise<Response> {
		const url = new URL(this.base + path);
		for (const [k, v] of Object.entries(options.query ?? {}))
			url.searchParams.set(k, String(v));
		const headers: Record<string, string> = {
			...this.authHeaders(),
			...options.headers,
		};
		let body: Uint8Array | string | undefined = options.body;
		if (options.json !== undefined) {
			body = JSON.stringify(options.json);
			headers["content-type"] = "application/json";
		}
		const signals = [AbortSignal.timeout(options.timeoutMs ?? 30_000)];
		if (options.signal) signals.push(options.signal);
		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers,
				body: body as never,
				signal: AbortSignal.any(signals),
			});
		} catch (error) {
			if (options.signal?.aborted) throw error;
			throw new HubError(
				0,
				"network",
				`${method} ${path}: ${errorMessage(error)}`,
			);
		}
		if (response.ok) return response;
		throw await this.failure(method, path, response);
	}

	private async failure(
		method: string,
		path: string,
		response: Response,
	): Promise<HubError> {
		let code: HubErrorCode = "unknown";
		let message = response.statusText || `HTTP ${response.status}`;
		let detail: HubError["detail"] = {};
		try {
			const text = await response.text();
			const parsed = ErrorBody(JSON.parse(text), "$");
			code = parsed.error.code;
			message = parsed.error.message;
			detail = parsed.error.detail ?? {};
		} catch {
			// Not our error body (a proxy page, an empty 5xx): keep the status text.
		}
		if (code === "unknown") {
			if (response.status === 401) code = "unauthorized";
			else if (response.status === 404) code = "not-found";
		}
		const retryAfter = Number(response.headers.get("retry-after"));
		const error = new HubError(
			response.status,
			code,
			`${method} ${path}: ${response.status} ${message}`,
			detail,
			Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
		);
		if (error.code === "unauthorized") this.onUnauthorized?.();
		return error;
	}

	async request(
		method: string,
		path: string,
		options: RequestOptions = {},
	): Promise<Response> {
		const tries = (options.retries ?? 4) + 1;
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.once(method, path, options);
			} catch (error) {
				if (
					!(error instanceof HubError) ||
					!error.retryable ||
					attempt >= tries
				)
					throw error;
				const wait = error.retryAfterMs ?? backoffMs(attempt, 1000, 30_000);
				this.log.warn(
					`${error.message}; retry ${attempt}/${tries - 1} in ${Math.round(wait / 1000)}s`,
				);
				await sleep(wait, options.signal);
				if (options.signal?.aborted) throw error;
			}
		}
	}

	private async readJson<T>(
		response: Response,
		check: Check<T>,
		what: string,
	): Promise<T> {
		try {
			return parse(check, await response.json());
		} catch (error) {
			throw new HubError(
				response.status,
				"bad-response",
				`${what}: ${errorMessage(error)}`,
			);
		}
	}

	private async postJson<I, T>(
		path: string,
		inCheck: Check<I>,
		input: I,
		outCheck: Check<T>,
		options: RequestOptions = {},
	): Promise<T> {
		// Validate what we send: a bug here is ours, not the hub's.
		const body = parse(inCheck, input);
		const response = await this.request("POST", path, {
			...options,
			json: body,
		});
		return this.readJson(response, outCheck, `POST ${path}`);
	}

	// ---- control ------------------------------------------------------------------

	hello(hello: DeviceHelloT) {
		return this.postJson(routes.hello, DeviceHello, hello, HelloResponse);
	}

	manifest(request: ManifestRequest) {
		return this.postJson(
			routes.manifest,
			ManifestRequest,
			request,
			ManifestPage,
			{
				timeoutMs: 120_000,
			},
		);
	}

	putState(report: StateReport) {
		return this.postJson(routes.state, StateReport, report, Ok);
	}

	// ---- files -----------------------------------------------------------------------

	// The response is returned unread; the caller streams `response.body`.
	file(
		trackId: string,
		options: { fileHash: string; rangeFrom?: number; signal?: AbortSignal },
	): Promise<Response> {
		const headers: Record<string, string> = {};
		if (options.rangeFrom && options.rangeFrom > 0) {
			headers.range = `bytes=${options.rangeFrom}-`;
			headers["if-range"] = `"${options.fileHash}"`;
		}
		return this.request("GET", routes.file(trackId), {
			headers,
			query: { fileHash: options.fileHash },
			signal: options.signal,
			retries: 0,
			// Headers must arrive in a minute; the body has its own idle timer.
			timeoutMs: 60_000 * 60 * 6,
		});
	}

	// ---- inbox ------------------------------------------------------------------------

	inboxCheck(request: InboxCheckRequest) {
		return this.postJson(
			routes.inboxCheck,
			InboxCheckRequest,
			request,
			InboxCheckResponse,
		);
	}

	uploadInit(init: UploadInit) {
		return this.postJson(routes.uploads, UploadInit, init, UploadInitResponse);
	}

	async uploadStatus(uploadId: string) {
		const r = await this.request("GET", routes.upload(uploadId));
		return this.readJson(r, UploadStatus, "upload status");
	}

	async uploadChunk(
		uploadId: string,
		offset: number,
		chunk: Uint8Array,
		signal?: AbortSignal,
	) {
		const r = await this.request("PUT", routes.upload(uploadId), {
			query: { offset },
			body: chunk,
			headers: { "content-type": "application/octet-stream" },
			signal,
			timeoutMs: 5 * 60_000,
		});
		return this.readJson(r, UploadChunkResponse, "upload chunk");
	}

	uploadComplete(uploadId: string, complete: UploadComplete) {
		return this.postJson(
			routes.uploadComplete(uploadId),
			UploadComplete,
			complete,
			UploadCompleteResponse,
			{ timeoutMs: 10 * 60_000 },
		);
	}

	async uploadAbort(uploadId: string): Promise<void> {
		await this.request("DELETE", routes.upload(uploadId), { retries: 1 });
	}

	// ---- Rekordbox -----------------------------------------------------------------------

	rekordboxImport(part: ImportBatch) {
		return this.postJson(
			routes.rekordboxImport,
			ImportBatch,
			part,
			ImportResult,
			{
				timeoutMs: 5 * 60_000,
			},
		);
	}

	rekordboxExport(request: ExportRequest) {
		return this.postJson(
			routes.rekordboxExport,
			ExportRequest,
			request,
			ExportPage,
			{
				timeoutMs: 2 * 60_000,
			},
		);
	}

	rekordboxAck(ack: ExportAck) {
		return this.postJson(routes.rekordboxAck, ExportAck, ack, Ok);
	}

	async anlzExists(hash: string): Promise<boolean> {
		try {
			await this.request("HEAD", routes.anlz(hash), { retries: 1 });
			return true;
		} catch (error) {
			if (error instanceof HubError && error.status === 404) return false;
			throw error;
		}
	}

	async anlzGet(hash: string): Promise<Buffer> {
		const r = await this.request("GET", routes.anlz(hash), {
			timeoutMs: 2 * 60_000,
		});
		return Buffer.from(await r.arrayBuffer());
	}

	async anlzPut(
		hash: string,
		bytes: Uint8Array,
		trackId: string,
		kind: string,
	): Promise<void> {
		await this.request("PUT", routes.anlz(hash), {
			query: { trackId, kind },
			body: bytes,
			headers: { "content-type": "application/octet-stream" },
			timeoutMs: 2 * 60_000,
		});
	}
}
