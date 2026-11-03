import { createHash, createHmac } from "node:crypto";

// AWS Signature Version 4 for the S3 API, by hand on node:crypto. Written rather
// than taken from a package: the whole of it is one function the S3 client calls
// (a canonical request, a derived key, an HMAC), it needs no dependency, and it is
// the same code on AWS, R2, B2 and MinIO.

export interface Credentials {
	accessKeyId: string;
	secretAccessKey: string;
}

export const EMPTY_SHA256 =
	"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (data: Buffer | string): string =>
	createHash("sha256").update(data).digest("hex");

const hmac = (key: Buffer | string, data: string): Buffer =>
	createHmac("sha256", key).update(data).digest();

// RFC 3986 encoding, which S3 asks for in a path (one level, "/" kept) and in a query.
const encode = (value: string): string =>
	encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);

export const encodePath = (path: string): string =>
	path.split("/").map(encode).join("/");

export const amzDate = (at: Date): string =>
	at
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");

export interface SignInput {
	method: string;
	// The URL's host (with a non-default port) and its already encoded path.
	host: string;
	path: string;
	query?: Record<string, string>;
	// Headers to send besides the ones signing adds; names in any case.
	headers?: Record<string, string>;
	// SHA-256 of the body, hex.
	payloadHash: string;
	region: string;
	service?: string;
	credentials: Credentials;
	at?: Date;
}

export interface Signed {
	// Every header to send (lowercase names), `authorization` included.
	headers: Record<string, string>;
	// The query string as signed, to put on the URL.
	queryString: string;
}

// Headers a transport sets itself and so are not signed.
const UNSIGNED = new Set(["content-length", "connection", "user-agent"]);

export function sign(input: SignInput): Signed {
	const at = input.at ?? new Date();
	const date = amzDate(at);
	const day = date.slice(0, 8);
	const service = input.service ?? "s3";
	const headers: Record<string, string> = {};
	for (const [name, value] of Object.entries(input.headers ?? {}))
		headers[name.toLowerCase()] = String(value).trim().replace(/\s+/g, " ");
	headers.host = input.host;
	headers["x-amz-date"] = date;
	headers["x-amz-content-sha256"] = input.payloadHash;
	const names = Object.keys(headers)
		.filter((name) => !UNSIGNED.has(name))
		.sort();
	const canonicalHeaders = names
		.map((name) => `${name}:${headers[name]}\n`)
		.join("");
	const signedHeaders = names.join(";");
	const queryString = Object.entries(input.query ?? {})
		.map(([k, v]) => [encode(k), encode(v)] as const)
		.sort((a, b) =>
			a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1,
		)
		.map(([k, v]) => `${k}=${v}`)
		.join("&");
	const canonical = [
		input.method.toUpperCase(),
		input.path,
		queryString,
		canonicalHeaders,
		signedHeaders,
		input.payloadHash,
	].join("\n");
	const scope = `${day}/${input.region}/${service}/aws4_request`;
	const toSign = ["AWS4-HMAC-SHA256", date, scope, sha256Hex(canonical)].join(
		"\n",
	);
	const key = hmac(
		hmac(
			hmac(hmac(`AWS4${input.credentials.secretAccessKey}`, day), input.region),
			service,
		),
		"aws4_request",
	);
	const signature = createHmac("sha256", key).update(toSign).digest("hex");
	headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
	return { headers, queryString };
}
