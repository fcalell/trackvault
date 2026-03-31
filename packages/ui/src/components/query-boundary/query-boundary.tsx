import { TriangleAlert } from "lucide-solid";
import type { Accessor, JSX } from "solid-js";
import {
	createMemo,
	createSignal,
	Match,
	onCleanup,
	Switch,
	untrack,
} from "solid-js";

import { Button } from "#components/button";
import { EmptyState } from "#components/empty-state";
import { Loader } from "#components/loader";

type QueryLike<TData, TError> = {
	data: TData | undefined;
	isPending: boolean;
	isError: boolean;
	error: TError | null;
	refetch: () => void;
};

type QueryBoundaryProps<TData, TError = Error> = {
	query: QueryLike<TData, TError>;
	loadingText?: string;
	errorFallback?: (error: TError, retry: () => void) => JSX.Element;
	children: (data: Accessor<TData>) => JSX.Element;
};

const GRACE_MS = 150;

type State = "pending" | "error" | "success";

function QueryBoundary<TData, TError = Error>(
	props: QueryBoundaryProps<TData, TError>,
) {
	const [graceElapsed, setGraceElapsed] = createSignal(false);

	let graceTimeout: ReturnType<typeof setTimeout> | undefined;

	const startGrace = () => {
		if (graceTimeout !== undefined) return;
		setGraceElapsed(false);
		graceTimeout = setTimeout(() => {
			setGraceElapsed(true);
			graceTimeout = undefined;
		}, GRACE_MS);
	};

	onCleanup(() => {
		if (graceTimeout !== undefined) clearTimeout(graceTimeout);
	});

	const state = createMemo<State>(() => {
		if (props.query.data !== undefined) return "success";
		if (props.query.isError) return "error";
		if (props.query.isPending) {
			startGrace();
			return "pending";
		}
		return "pending";
	});

	const data: Accessor<TData> = () => props.query.data as TData;

	return (
		<Switch>
			<Match when={state() === "pending" && graceElapsed()}>
				<Loader text={props.loadingText} />
			</Match>
			<Match when={state() === "pending" && !graceElapsed()}>{null}</Match>
			<Match when={state() === "error"}>
				{props.errorFallback ? (
					props.errorFallback(props.query.error as TError, props.query.refetch)
				) : (
					<EmptyState
						icon={<TriangleAlert />}
						title="Something went wrong"
						description={
							props.query.error instanceof Error
								? props.query.error.message
								: "An unexpected error occurred"
						}
					>
						<Button
							variant="outline"
							size="sm"
							onClick={() => props.query.refetch()}
						>
							Retry
						</Button>
					</EmptyState>
				)}
			</Match>
			<Match when={state() === "success"}>
				{untrack(() => props.children(data))}
			</Match>
		</Switch>
	);
}

export type { QueryBoundaryProps, QueryLike };
export { QueryBoundary };
