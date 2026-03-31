import {
	useInfiniteQuery as _useInfiniteQuery,
	useQuery as _useQuery,
} from "@tanstack/solid-query";

function makeSafe<T extends { data: unknown; isPending: boolean }>(
	query: T,
): T {
	return Object.create(query, {
		data: {
			get() {
				return query.isPending ? undefined : query.data;
			},
			enumerable: true,
		},
	}) as T;
}

export const useQuery = ((...args: unknown[]) =>
	makeSafe(
		(_useQuery as (...a: unknown[]) => ReturnType<typeof _useQuery>)(...args),
	)) as typeof _useQuery;

export const useInfiniteQuery = ((...args: unknown[]) =>
	makeSafe(
		(
			_useInfiniteQuery as (
				...a: unknown[]
			) => ReturnType<typeof _useInfiniteQuery>
		)(...args),
	)) as typeof _useInfiniteQuery;

// Combine multiple queries into a single query-like object
type QueryLike<TData, TError = Error> = {
	data: TData | undefined;
	isPending: boolean;
	isError: boolean;
	error: TError | null;
	refetch: () => void;
};

type ExtractData<T extends QueryLike<unknown>[]> = {
	[K in keyof T]: T[K] extends QueryLike<infer D> ? D : never;
};

function combineQueries<T extends QueryLike<unknown>[]>(
	...queries: T
): QueryLike<ExtractData<T>> {
	return {
		get data() {
			if (queries.some((q) => q.isPending)) return undefined;
			return queries.every((q) => q.data !== undefined)
				? (queries.map((q) => q.data) as ExtractData<T>)
				: undefined;
		},
		get isPending() {
			return queries.some((q) => q.isPending);
		},
		get isError() {
			return queries.some((q) => q.isError);
		},
		get error() {
			return (queries.find((q) => q.error)?.error as Error) ?? null;
		},
		refetch() {
			for (const q of queries) q.refetch();
		},
	};
}

export type {
	CreateMutationResult,
	CreateQueryResult,
	QueryClient,
	QueryKey,
} from "@tanstack/solid-query";
export {
	MutationCache,
	useMutation,
	useQueryClient,
} from "@tanstack/solid-query";
export type { QueryLike };
export { combineQueries };
