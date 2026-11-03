import {
	type Check,
	ERROR_CODES,
	type ErrorCode,
	ProtocolError,
	parse,
} from "@trackvault/core/sync";

// The protocol's HTTP side: JSON in and out, `ErrorBody` for every failure.

const STATUS: Record<ErrorCode, number> = {
	unauthorized: 401,
	"protocol-unsupported": 426,
	"bad-request": 400,
	"not-found": 404,
	"file-changed": 409,
	"offset-mismatch": 409,
	"hash-mismatch": 422,
	"cursor-expired": 410,
	"base-mismatch": 409,
	"too-large": 413,
	busy: 503,
	internal: 500,
};

export class SyncError extends Error {
	readonly code: ErrorCode;
	readonly detail: Record<string, string | number | boolean | null> | undefined;
	readonly retryAfter: number | undefined;
	constructor(
		code: ErrorCode,
		message: string,
		detail?: Record<string, string | number | boolean | null>,
		retryAfter?: number,
	) {
		super(message);
		this.code = code;
		this.detail = detail;
		this.retryAfter = retryAfter;
	}
}

export function json(
	body: unknown,
	status = 200,
	headers?: Record<string, string>,
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

export function failure(error: unknown): Response {
	if (error instanceof SyncError) {
		const headers: Record<string, string> = {};
		if (error.retryAfter !== undefined)
			headers["retry-after"] = String(error.retryAfter);
		return json(
			{
				error: {
					code: error.code,
					message: error.message,
					...(error.detail ? { detail: error.detail } : {}),
				},
			},
			STATUS[error.code],
			headers,
		);
	}
	if (error instanceof ProtocolError)
		return failure(new SyncError("bad-request", error.message));
	return failure(
		new SyncError(
			"internal",
			error instanceof Error ? error.message : "Something went wrong",
		),
	);
}

export async function body<T>(request: Request, check: Check<T>): Promise<T> {
	let value: unknown;
	try {
		value = await request.json();
	} catch {
		throw new SyncError("bad-request", "The body is not JSON");
	}
	return parse(check, value);
}

export const ok = (): Response => json({ ok: true });

export const knownCodes: readonly string[] = ERROR_CODES;
