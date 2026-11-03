import { createWsClient } from "@fcalell/plugin-node/client";
import { channelRead } from "@fcalell/plugin-node/live";
import {
	type JobView,
	jobsChannel,
	type TransferView,
	transfersChannel,
} from "../../shared/channels.ts";

// The one socket every channel read rides.
export const ws = createWsClient();

// Newest first: a job that changes keeps its place, a new one stands on top.
const byNewest = (a: JobView, b: JobView): number =>
	b.createdAt.localeCompare(a.createdAt);

export const jobsLive = channelRead(ws, jobsChannel, {
	snapshot: (_: JobView[] | undefined, snapshot): JobView[] => snapshot.jobs,
	upsert: (jobs: JobView[] | undefined, job): JobView[] =>
		[...(jobs ?? []).filter((each) => each.id !== job.id), job].sort(byNewest),
});

// Newest first, like the jobs.
const byRequested = (a: TransferView, b: TransferView): number =>
	b.createdAt.localeCompare(a.createdAt);

export const transfersLive = channelRead(ws, transfersChannel, {
	snapshot: (_: TransferView[] | undefined, snapshot): TransferView[] =>
		snapshot.transfers,
	upsert: (transfers: TransferView[] | undefined, transfer): TransferView[] =>
		[
			...(transfers ?? []).filter((each) => each.id !== transfer.id),
			transfer,
		].sort(byRequested),
	remove: (transfers: TransferView[] | undefined, { id }): TransferView[] =>
		(transfers ?? []).filter((each) => each.id !== id),
});
