import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt } from "@fcalell/plugin-db/orm";
import type { ChannelHandle } from "@fcalell/plugin-node/server";
import { defineService, loadModules } from "@fcalell/plugin-node/server";
import { batches, jobs } from "../../schema/index.ts";
import { type JobView, jobsChannel } from "../../shared/channels.ts";
import { db } from "../lib/db.ts";
import type { AnyJob, JobDefinition } from "../lib/job.ts";

type JobRow = typeof jobs.$inferSelect;
type JobsChannel = ChannelHandle<(typeof jobsChannel)["server"]>;

// The jobs a new subscriber is told about, and how long a finished one is kept.
const SNAPSHOT_SIZE = 100;
const KEEP_FINISHED_MS = 7 * 24 * 3600 * 1000;
// What reaches the channel and the database while a job reports progress.
const BROADCAST_EVERY_MS = 250;
const PERSIST_EVERY_MS = 1000;

interface Live {
	definition: AnyJob;
	abort: AbortController;
	done: number;
	total: number;
	message: string | null;
	dirty: boolean;
	persistedAt: number;
}

const registry = new Map<string, AnyJob>();
const live = new Map<string, Live>();
const perKind = new Map<string, number>();
let channel: JobsChannel | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let pumping = false;
let stopping = false;

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

// A finished job names the batch it wrote under its own id.
function wroteBatch(row: JobRow): boolean {
	return (
		row.state !== "queued" &&
		row.state !== "running" &&
		db()
			.select({ id: batches.id })
			.from(batches)
			.where(eq(batches.id, row.id))
			.get() !== undefined
	);
}

function viewOf(row: JobRow): JobView {
	const running = live.get(row.id);
	return {
		id: row.id,
		kind: row.kind,
		state: row.state,
		done: running?.done ?? row.done,
		total: running?.total ?? row.total,
		message: running ? running.message : row.message,
		error: row.error,
		createdAt: row.createdAt.toISOString(),
		startedAt: iso(row.startedAt),
		finishedAt: iso(row.finishedAt),
		batch: wroteBatch(row),
	};
}

export function toView(row: JobRow): JobView {
	return viewOf(row);
}

function readRow(id: string): JobRow | undefined {
	return db().select().from(jobs).where(eq(jobs.id, id)).get();
}

function announce(id: string): void {
	const row = readRow(id);
	if (row) channel?.broadcast("upsert", viewOf(row));
}

// Queues a job and wakes the runner. With `reuse`, a queued or running job of
// the kind whose payload it accepts is returned instead of a second one.
export function enqueue<P, R>(
	definition: JobDefinition<P, R>,
	payload: P,
	options: { reuse?: (existing: P) => boolean } = {},
): JobView {
	const database = db();
	if (options.reuse) {
		const active = database
			.select()
			.from(jobs)
			.where(
				and(
					eq(jobs.kind, definition.kind),
					inArray(jobs.state, ["queued", "running"]),
				),
			)
			.all();
		const match = active.find((row) => options.reuse?.(row.payload as P));
		if (match) return viewOf(match);
	}
	const row = database
		.insert(jobs)
		.values({
			id: randomUUID(),
			kind: definition.kind,
			payload: payload ?? null,
			createdAt: new Date(),
		})
		.returning()
		.get();
	channel?.broadcast("upsert", viewOf(row));
	queueMicrotask(pump);
	return viewOf(row);
}

export function recentJobs(limit = SNAPSHOT_SIZE): JobView[] {
	return db()
		.select()
		.from(jobs)
		.orderBy(desc(jobs.createdAt), desc(jobs.id))
		.limit(limit)
		.all()
		.map(viewOf);
}

export function getJob(id: string): JobView | undefined {
	const row = readRow(id);
	return row ? viewOf(row) : undefined;
}

// Queues a finished job again with the payload it ran with.
export function retryJob(id: string): JobView | undefined {
	const row = readRow(id);
	const definition = row && registry.get(row.kind);
	return row && definition ? enqueue(definition, row.payload) : undefined;
}

// Cancels a queued job at once, and a running one through its signal.
export function cancelJob(id: string): JobView | undefined {
	const running = live.get(id);
	if (running) {
		running.abort.abort();
		return getJob(id);
	}
	db()
		.update(jobs)
		.set({ state: "cancelled", finishedAt: new Date() })
		.where(and(eq(jobs.id, id), eq(jobs.state, "queued")))
		.run();
	announce(id);
	return getJob(id);
}

function persist(id: string, state: Live): void {
	db()
		.update(jobs)
		.set({ done: state.done, total: state.total, message: state.message })
		.where(eq(jobs.id, id))
		.run();
	state.persistedAt = Date.now();
}

function tick(): void {
	const now = Date.now();
	for (const [id, state] of live) {
		if (!state.dirty) continue;
		state.dirty = false;
		if (now - state.persistedAt >= PERSIST_EVERY_MS) persist(id, state);
		announce(id);
	}
}

function finish(id: string, patch: Partial<typeof jobs.$inferInsert>): void {
	const state = live.get(id);
	db()
		.update(jobs)
		.set({
			done: state?.done,
			total: state?.total,
			message: state?.message,
			finishedAt: new Date(),
			...patch,
		})
		.where(eq(jobs.id, id))
		.run();
	if (state) {
		perKind.set(
			state.definition.kind,
			(perKind.get(state.definition.kind) ?? 1) - 1,
		);
		live.delete(id);
	}
	announce(id);
	queueMicrotask(pump);
}

// The server is stopping: the row stays running, so the next start resumes it.
function leaveRunning(id: string, definition: AnyJob): void {
	const current = live.get(id);
	if (!current) return;
	persist(id, current);
	perKind.set(definition.kind, (perKind.get(definition.kind) ?? 1) - 1);
	live.delete(id);
}

async function execute(row: JobRow, definition: AnyJob): Promise<void> {
	const state: Live = {
		definition,
		abort: new AbortController(),
		done: row.done,
		total: row.total,
		message: row.message,
		dirty: false,
		persistedAt: 0,
	};
	live.set(row.id, state);
	perKind.set(definition.kind, (perKind.get(definition.kind) ?? 0) + 1);
	db()
		.update(jobs)
		.set({
			state: "running",
			attempts: row.attempts + 1,
			startedAt: row.startedAt ?? new Date(),
			error: null,
		})
		.where(eq(jobs.id, row.id))
		.run();
	announce(row.id);
	try {
		const result = await definition.run({
			id: row.id,
			payload: row.payload,
			signal: state.abort.signal,
			progress(done, total, message) {
				state.done = done;
				if (total !== undefined) state.total = total;
				if (message !== undefined) state.message = message;
				state.dirty = true;
			},
		});
		if (stopping && state.abort.signal.aborted) {
			leaveRunning(row.id, definition);
		} else if (state.abort.signal.aborted) {
			finish(row.id, { state: "cancelled" });
		} else {
			finish(row.id, { state: "done", result: result ?? null });
		}
	} catch (error) {
		if (stopping) {
			leaveRunning(row.id, definition);
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		finish(row.id, { state: "failed", error: message });
	}
}

function pump(): void {
	if (pumping || stopping) return;
	pumping = true;
	try {
		const queued = db()
			.select()
			.from(jobs)
			.where(eq(jobs.state, "queued"))
			.orderBy(jobs.createdAt, jobs.id)
			.limit(200)
			.all();
		for (const row of queued) {
			const definition = registry.get(row.kind);
			if (!definition) {
				db()
					.update(jobs)
					.set({
						state: "failed",
						error: `unknown job kind: ${row.kind}`,
						finishedAt: new Date(),
					})
					.where(eq(jobs.id, row.id))
					.run();
				announce(row.id);
				continue;
			}
			if (row.attempts >= definition.maxAttempts) {
				db()
					.update(jobs)
					.set({
						state: "failed",
						error: `gave up after ${row.attempts} starts`,
						finishedAt: new Date(),
					})
					.where(eq(jobs.id, row.id))
					.run();
				announce(row.id);
				continue;
			}
			if ((perKind.get(row.kind) ?? 0) >= definition.concurrency) continue;
			void execute(row, definition);
		}
	} finally {
		pumping = false;
	}
}

async function loadKinds(): Promise<void> {
	// Loaded here, not at the top: the kinds import this service's `enqueue`.
	const modules = await loadModules(new URL("../jobs/", import.meta.url));
	for (const module of Object.values(modules)) {
		const definition = (module as { default: AnyJob }).default;
		if (!definition?.kind) throw new Error("a job kind has no name");
		if (registry.has(definition.kind))
			throw new Error(`job kind ${definition.kind} is defined twice`);
		registry.set(definition.kind, definition);
	}
}

export default defineService({
	name: "jobs",
	async start({ ws, log }) {
		stopping = false;
		await loadKinds();
		const database = db();
		// Finished jobs age out.
		database
			.delete(jobs)
			.where(
				and(
					inArray(jobs.state, ["done", "failed", "cancelled"]),
					lt(jobs.finishedAt, new Date(Date.now() - KEEP_FINISHED_MS)),
				),
			)
			.run();
		// A job a stop or a crash left running resumes from the top.
		const resumed = database
			.update(jobs)
			.set({ state: "queued", message: "Resuming" })
			.where(eq(jobs.state, "running"))
			.returning({ id: jobs.id })
			.all().length;
		if (resumed > 0) log.info(`jobs: resuming ${resumed} interrupted`);

		channel = ws.channel(jobsChannel, {
			onSubscribe(conn) {
				conn.send("snapshot", { jobs: recentJobs() });
			},
		});
		ticker = setInterval(tick, BROADCAST_EVERY_MS);
		queueMicrotask(pump);
		return async () => {
			stopping = true;
			if (ticker) clearInterval(ticker);
			for (const state of live.values()) state.abort.abort();
			// Give running jobs a moment to notice the signal and stop.
			const deadline = Date.now() + 5000;
			while (live.size > 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			channel = null;
		};
	},
});
