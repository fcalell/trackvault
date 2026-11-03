import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { RateLimiter, sleep } from "./limiter.ts";
import { EMPTY_SHA256, encodePath, sha256Hex, sign } from "./sigv4.ts";

// A small S3 client over node:http(s) for AWS S3, Cloudflare R2, Backblaze B2 and
// MinIO: head, put, get (with Range, to a file), delete, list, multipart. Every
// request is signed with the SHA-256 of its body, so a corrupted upload is refused.

export interface S3Config {
	// "https://<account>.r2.cloudflarestorage.com", "http://minio:9000"; empty means AWS.
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	// Bucket in the path (the default, which every provider takes) or in the host name.
	virtualHosted?: boolean;
}

export class S3Error extends Error {
	readonly status: number;
	readonly code: string;
	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
		this.name = "S3Error";
	}
}

export interface ObjectInfo {
	key: string;
	size: number;
	etag: string;
	lastModified: Date;
}

export interface HeadInfo {
	size: number;
	etag: string;
	lastModified: Date | null;
	// x-amz-meta-* without the prefix.
	meta: Record<string, string>;
}

export interface PartInfo {
	number: number;
	size: number;
	etag: string;
}

interface Response {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: http.IncomingMessage;
}

interface CallOptions {
	method: string;
	key?: string;
	query?: Record<string, string>;
	headers?: Record<string, string>;
	body?: Buffer;
	// Statuses that are answers, not errors.
	ok?: number[];
	signal?: AbortSignal;
}

const ATTEMPTS = 5;
const SLICE = 64 * 1024;
const IDLE_MS = 60_000;

const xmlDecode = (text: string): string =>
	text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");

export const xmlEscape = (text: string): string =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tag(xml: string, name: string): string | undefined {
	const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
	return match ? xmlDecode(match[1] as string) : undefined;
}

function blocks(xml: string, name: string): string[] {
	return [
		...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g")),
	].map((m) => m[1] as string);
}

export class S3Client {
	private readonly base: URL;
	private readonly limiter: RateLimiter;
	readonly config: S3Config;

	constructor(config: S3Config, limiter?: RateLimiter) {
		this.config = config;
		this.limiter = limiter ?? new RateLimiter(0);
		this.base = new URL(
			config.endpoint ||
				(config.virtualHosted
					? `https://${config.bucket}.s3.${config.region}.amazonaws.com`
					: `https://s3.${config.region}.amazonaws.com`),
		);
		if (config.virtualHosted && config.endpoint) {
			this.base.hostname = `${config.bucket}.${this.base.hostname}`;
		}
	}

	private target(key?: string): { host: string; path: string } {
		const object = key === undefined ? "" : `/${key}`;
		const prefix = this.config.virtualHosted ? "" : `/${this.config.bucket}`;
		const path = encodePath(`${prefix}${object}` || "/");
		return {
			host: this.base.host,
			path: path.startsWith("/") ? path : `/${path}`,
		};
	}

	private async once(options: CallOptions): Promise<Response> {
		const { host, path } = this.target(options.key);
		const body = options.body;
		const signed = sign({
			method: options.method,
			host,
			path,
			query: options.query,
			headers: options.headers,
			payloadHash: body ? sha256Hex(body) : EMPTY_SHA256,
			region: this.config.region,
			credentials: this.config,
		});
		const headers: Record<string, string> = { ...signed.headers };
		delete headers.host;
		headers["content-length"] = String(body?.length ?? 0);
		const secure = this.base.protocol === "https:";
		return new Promise<Response>((resolve, reject) => {
			const request = (secure ? https : http).request(
				{
					method: options.method,
					protocol: this.base.protocol,
					hostname: this.base.hostname,
					port: this.base.port || (secure ? 443 : 80),
					path: signed.queryString ? `${path}?${signed.queryString}` : path,
					headers,
					signal: options.signal,
					timeout: IDLE_MS,
				},
				(response) =>
					resolve({
						status: response.statusCode ?? 0,
						headers: response.headers,
						body: response,
					}),
			);
			request.on("timeout", () =>
				request.destroy(new Error("The storage server stopped answering")),
			);
			request.on("error", reject);
			if (!body || body.length === 0) {
				request.end();
				return;
			}
			void (async () => {
				try {
					for (let at = 0; at < body.length; at += SLICE) {
						const slice = body.subarray(at, at + SLICE);
						await this.limiter.take(slice.length, options.signal);
						if (!request.write(slice))
							await new Promise<void>((r) => request.once("drain", r));
					}
					request.end();
				} catch (error) {
					request.destroy(error as Error);
				}
			})();
		});
	}

	// One request with retries on network errors, 429 and 5xx; an error answer is
	// read and thrown as an S3Error.
	private async call(options: CallOptions): Promise<Response> {
		const ok = options.ok ?? [200, 204, 206];
		let last: unknown;
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			try {
				const response = await this.once(options);
				if (ok.includes(response.status)) return response;
				const text = (await readAll(response.body)).toString("utf8");
				const code = tag(text, "Code") ?? String(response.status);
				const error = new S3Error(
					response.status,
					code,
					tag(text, "Message") ??
						(response.status === 403
							? "The storage refused the credentials"
							: `The storage answered ${response.status}`),
				);
				if (response.status !== 429 && response.status < 500) throw error;
				last = error;
			} catch (error) {
				if (options.signal?.aborted) throw options.signal.reason ?? error;
				if (
					error instanceof S3Error &&
					error.status < 500 &&
					error.status !== 429
				)
					throw error;
				last = error;
			}
			await sleep(500 * 2 ** attempt, options.signal);
		}
		throw last;
	}

	async head(key: string, signal?: AbortSignal): Promise<HeadInfo | null> {
		try {
			const response = await this.call({ method: "HEAD", key, signal });
			response.body.resume();
			const meta: Record<string, string> = {};
			for (const [name, value] of Object.entries(response.headers)) {
				if (name.startsWith("x-amz-meta-"))
					meta[name.slice("x-amz-meta-".length)] = String(value);
			}
			const modified = response.headers["last-modified"];
			return {
				size: Number(response.headers["content-length"] ?? 0),
				etag: String(response.headers.etag ?? "").replace(/"/g, ""),
				lastModified: modified ? new Date(modified) : null,
				meta,
			};
		} catch (error) {
			if (
				error instanceof S3Error &&
				(error.status === 404 || error.code === "404")
			)
				return null;
			throw error;
		}
	}

	async put(
		key: string,
		body: Buffer,
		options: {
			meta?: Record<string, string>;
			contentType?: string;
			signal?: AbortSignal;
		} = {},
	): Promise<string> {
		const response = await this.call({
			method: "PUT",
			key,
			body,
			headers: {
				"content-type": options.contentType ?? "application/octet-stream",
				...metaHeaders(options.meta),
			},
			signal: options.signal,
		});
		response.body.resume();
		return String(response.headers.etag ?? "").replace(/"/g, "");
	}

	async getBuffer(key: string, signal?: AbortSignal): Promise<Buffer> {
		const response = await this.call({ method: "GET", key, signal });
		return readAll(response.body);
	}

	// Downloads to `dest`. A partial file there is continued with a Range request;
	// the caller moves a finished `dest` into place.
	async getToFile(
		key: string,
		dest: string,
		options: { signal?: AbortSignal; onBytes?: (total: number) => void } = {},
	): Promise<number> {
		await mkdir(dirname(dest), { recursive: true });
		for (let attempt = 0; ; attempt++) {
			let have = 0;
			try {
				have = (await stat(dest)).size;
			} catch {}
			try {
				const response = await this.call({
					method: "GET",
					key,
					headers: have > 0 ? { range: `bytes=${have}-` } : undefined,
					ok: [200, 206, 416],
					signal: options.signal,
				});
				if (response.status === 416) {
					response.body.resume();
					return have;
				}
				const append = response.status === 206;
				let total = append ? have : 0;
				const counted = Readable.from(
					(async function* () {
						for await (const chunk of response.body) {
							total += (chunk as Buffer).length;
							options.onBytes?.(total);
							yield chunk;
						}
					})(),
				);
				await pipeline(
					counted,
					createWriteStream(dest, { flags: append ? "a" : "w" }),
					{ signal: options.signal },
				);
				return total;
			} catch (error) {
				if (options.signal?.aborted || attempt >= ATTEMPTS - 1) throw error;
				if (error instanceof S3Error && error.status < 500) throw error;
				await sleep(500 * 2 ** attempt, options.signal);
			}
		}
	}

	async delete(key: string, signal?: AbortSignal): Promise<void> {
		const response = await this.call({
			method: "DELETE",
			key,
			ok: [200, 204, 404],
			signal,
		});
		response.body.resume();
	}

	// Objects under a prefix, in key order, page after page.
	async *list(
		prefix: string,
		signal?: AbortSignal,
	): AsyncGenerator<ObjectInfo, void, void> {
		let token: string | undefined;
		do {
			const response = await this.call({
				method: "GET",
				query: {
					"list-type": "2",
					prefix,
					"max-keys": "1000",
					...(token ? { "continuation-token": token } : {}),
				},
				signal,
			});
			const xml = (await readAll(response.body)).toString("utf8");
			for (const item of blocks(xml, "Contents")) {
				yield {
					key: tag(item, "Key") ?? "",
					size: Number(tag(item, "Size") ?? 0),
					etag: (tag(item, "ETag") ?? "").replace(/"/g, ""),
					lastModified: new Date(tag(item, "LastModified") ?? 0),
				};
			}
			token =
				tag(xml, "IsTruncated") === "true"
					? tag(xml, "NextContinuationToken")
					: undefined;
		} while (token);
	}

	async createMultipart(
		key: string,
		options: {
			meta?: Record<string, string>;
			contentType?: string;
			signal?: AbortSignal;
		} = {},
	): Promise<string> {
		const response = await this.call({
			method: "POST",
			key,
			query: { uploads: "" },
			headers: {
				"content-type": options.contentType ?? "application/octet-stream",
				...metaHeaders(options.meta),
			},
			signal: options.signal,
		});
		const id = tag((await readAll(response.body)).toString("utf8"), "UploadId");
		if (!id) throw new Error("The storage gave no upload id");
		return id;
	}

	async uploadPart(
		key: string,
		uploadId: string,
		number: number,
		body: Buffer,
		signal?: AbortSignal,
	): Promise<string> {
		const response = await this.call({
			method: "PUT",
			key,
			query: { partNumber: String(number), uploadId },
			body,
			signal,
		});
		response.body.resume();
		return String(response.headers.etag ?? "").replace(/"/g, "");
	}

	// The parts the storage holds for an unfinished upload; null if it is gone.
	async listParts(
		key: string,
		uploadId: string,
		signal?: AbortSignal,
	): Promise<PartInfo[] | null> {
		const parts: PartInfo[] = [];
		let marker: string | undefined;
		try {
			do {
				const response = await this.call({
					method: "GET",
					key,
					query: {
						uploadId,
						"max-parts": "1000",
						...(marker ? { "part-number-marker": marker } : {}),
					},
					signal,
				});
				const xml = (await readAll(response.body)).toString("utf8");
				for (const item of blocks(xml, "Part")) {
					parts.push({
						number: Number(tag(item, "PartNumber")),
						size: Number(tag(item, "Size")),
						etag: (tag(item, "ETag") ?? "").replace(/"/g, ""),
					});
				}
				marker =
					tag(xml, "IsTruncated") === "true"
						? tag(xml, "NextPartNumberMarker")
						: undefined;
			} while (marker);
		} catch (error) {
			if (
				error instanceof S3Error &&
				(error.status === 404 || error.code === "NoSuchUpload")
			)
				return null;
			throw error;
		}
		return parts;
	}

	async completeMultipart(
		key: string,
		uploadId: string,
		parts: { number: number; etag: string }[],
		signal?: AbortSignal,
	): Promise<void> {
		const xml = `<CompleteMultipartUpload>${[...parts]
			.sort((a, b) => a.number - b.number)
			.map(
				(p) =>
					`<Part><PartNumber>${p.number}</PartNumber><ETag>"${p.etag}"</ETag></Part>`,
			)
			.join("")}</CompleteMultipartUpload>`;
		const response = await this.call({
			method: "POST",
			key,
			query: { uploadId },
			body: Buffer.from(xml),
			headers: { "content-type": "application/xml" },
			signal,
		});
		// S3 may answer 200 with an error in the body.
		const text = (await readAll(response.body)).toString("utf8");
		if (/<Error>/.test(text))
			throw new S3Error(
				500,
				tag(text, "Code") ?? "InternalError",
				tag(text, "Message") ?? "The storage could not finish the upload",
			);
	}

	async abortMultipart(
		key: string,
		uploadId: string,
		signal?: AbortSignal,
	): Promise<void> {
		const response = await this.call({
			method: "DELETE",
			key,
			query: { uploadId },
			ok: [200, 204, 404],
			signal,
		});
		response.body.resume();
	}

	// Writes, reads back and deletes a tiny object: proves the address, the
	// bucket, the keys and the rights a backup needs.
	async test(signal?: AbortSignal): Promise<{ ms: number }> {
		const started = Date.now();
		const key = `trackvault-connection-test-${Date.now()}`;
		const payload = Buffer.from("trackvault");
		await this.put(key, payload, { signal });
		const back = await this.getBuffer(key, signal);
		await this.delete(key, signal);
		if (!back.equals(payload))
			throw new Error("The storage returned different bytes than were sent");
		return { ms: Date.now() - started };
	}
}

function metaHeaders(meta?: Record<string, string>): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(meta ?? {}))
		headers[`x-amz-meta-${name.toLowerCase()}`] = value;
	return headers;
}

async function readAll(stream: http.IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks);
}
