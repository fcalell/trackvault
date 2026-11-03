// A tiny zod-free validator kit. A `Check<T>` takes an unknown value and returns it
// typed as `T` (rebuilt, so unknown keys are dropped) or throws a `ProtocolError`
// naming the path. The protocol types in `types.ts` are inferred from these checks, so
// the type and the validator can never drift apart.

export class ProtocolError extends Error {
	readonly path: string;
	constructor(path: string, message: string) {
		super(`${path}: ${message}`);
		this.name = "ProtocolError";
		this.path = path;
	}
}

export type Check<T> = (value: unknown, path: string) => T;
export type Infer<C> = C extends Check<infer T> ? T : never;

// A check for an object key that may be absent.
export type OptionalCheck<T> = Check<T | undefined> & {
	readonly optional: true;
};

function describe(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function bad(path: string, expected: string, value: unknown): never {
	throw new ProtocolError(path, `expected ${expected}, got ${describe(value)}`);
}

export const str: Check<string> = (v, p) =>
	typeof v === "string" ? v : bad(p, "string", v);

export const num: Check<number> = (v, p) =>
	typeof v === "number" && Number.isFinite(v) ? v : bad(p, "number", v);

export const int: Check<number> = (v, p) =>
	typeof v === "number" && Number.isSafeInteger(v) ? v : bad(p, "integer", v);

export const bool: Check<boolean> = (v, p) =>
	typeof v === "boolean" ? v : bad(p, "boolean", v);

export function oneOf<const T extends readonly string[]>(
	...values: T
): Check<T[number]> {
	return (v, p) =>
		typeof v === "string" && (values as readonly string[]).includes(v)
			? (v as T[number])
			: bad(p, `one of ${values.join("|")}`, v);
}

export function nullable<T>(check: Check<T>): Check<T | null> {
	return (v, p) => (v === null ? null : check(v, p));
}

export function optional<T>(check: Check<T>): OptionalCheck<T> {
	const fn = ((v: unknown, p: string) =>
		v === undefined ? undefined : check(v, p)) as OptionalCheck<T>;
	(fn as { optional: boolean }).optional = true;
	return fn;
}

export function arr<T>(check: Check<T>): Check<T[]> {
	return (v, p) => {
		if (!Array.isArray(v)) return bad(p, "array", v);
		return v.map((item, i) => check(item, `${p}[${i}]`));
	};
}

export function record<T>(check: Check<T>): Check<Record<string, T>> {
	return (v, p) => {
		if (typeof v !== "object" || v === null || Array.isArray(v))
			return bad(p, "object", v);
		const out: Record<string, T> = {};
		for (const [k, item] of Object.entries(v))
			out[k] = check(item, `${p}.${k}`);
		return out;
	};
}

export function union<A, B>(a: Check<A>, b: Check<B>): Check<A | B> {
	return (v, p) => {
		try {
			return a(v, p);
		} catch {
			return b(v, p);
		}
	};
}

// A value of any one of a few shapes the caller writes by hand.
export function custom<T>(
	expected: string,
	test: (value: unknown) => T | undefined,
): Check<T> {
	return (v, p) => {
		const out = test(v);
		return out === undefined ? bad(p, expected, v) : out;
	};
}

// A tagged union: `map[tag value]` validates the whole object (it should check the tag
// itself with `oneOf`).
export function variants<
	const K extends string,
	V extends Record<string, Check<unknown>>,
>(tag: K, map: V): Check<{ [T in keyof V]: Infer<V[T]> }[keyof V]> {
	return (v, p) => {
		if (typeof v !== "object" || v === null || Array.isArray(v))
			return bad(p, "object", v);
		const key = (v as Record<string, unknown>)[tag];
		const check = typeof key === "string" ? map[key] : undefined;
		if (!check)
			return bad(`${p}.${tag}`, `one of ${Object.keys(map).join("|")}`, key);
		return check(v, p) as { [T in keyof V]: Infer<V[T]> }[keyof V];
	};
}

type Shape = Record<string, Check<unknown> | OptionalCheck<unknown>>;
type RequiredKeys<S extends Shape> = {
	[K in keyof S]: S[K] extends OptionalCheck<unknown> ? never : K;
}[keyof S];
type OptionalKeys<S extends Shape> = Exclude<keyof S, RequiredKeys<S>>;
type Flatten<T> = { [K in keyof T]: T[K] };
export type ShapeOut<S extends Shape> = Flatten<
	{ [K in RequiredKeys<S>]: Infer<S[K]> } & {
		[K in OptionalKeys<S>]?: Exclude<Infer<S[K]>, undefined>;
	}
>;

export function obj<S extends Shape>(shape: S): Check<ShapeOut<S>> {
	return (v, p) => {
		if (typeof v !== "object" || v === null || Array.isArray(v))
			return bad(p, "object", v);
		const input = v as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [key, check] of Object.entries(shape)) {
			const value = check(input[key], `${p}.${key}`);
			if (value !== undefined) out[key] = value;
		}
		return out as ShapeOut<S>;
	};
}

// Runs a check at the root.
export function parse<T>(check: Check<T>, value: unknown): T {
	return check(value, "$");
}
