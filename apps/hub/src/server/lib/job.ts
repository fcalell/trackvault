// What a job kind is. A kind is one file in `src/server/jobs/` that default-exports
// `defineJob`; the runner finds it by scanning that directory, and callers enqueue
// it by importing the definition, which types the payload.

export interface JobContext<P> {
	readonly id: string;
	readonly payload: P;
	// Aborted when the job is cancelled or the server stops.
	readonly signal: AbortSignal;
	// Counted units done and expected (`total` 0 is unknown). Cheap to call per
	// item: the runner throttles what reaches the database and the channel.
	progress(done: number, total?: number, message?: string): void;
}

export interface JobDefinition<P, R> {
	readonly kind: string;
	// How many jobs of this kind run at once.
	readonly concurrency: number;
	// Starts a job gets (a restart mid-run is a start) before it is failed.
	readonly maxAttempts: number;
	// Runs the job. After a restart it runs again from the top with the same
	// payload, so it must be safe to repeat.
	run(context: JobContext<P>): Promise<R>;
}

export function defineJob<P, R = void>(spec: {
	kind: string;
	concurrency?: number;
	maxAttempts?: number;
	run(context: JobContext<P>): Promise<R>;
}): JobDefinition<P, R> {
	return {
		kind: spec.kind,
		concurrency: spec.concurrency ?? 1,
		maxAttempts: spec.maxAttempts ?? 3,
		run: spec.run,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: the registry holds kinds of every payload
export type AnyJob = JobDefinition<any, any>;
