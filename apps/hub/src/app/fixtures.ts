import type { Snapshots } from "@fcalell/plugin-node/ws";
import { defineFixtures } from "@fcalell/plugin-screens/fixtures";
import type { AppRouter } from "../../.stack/worker";
import type { jobsChannel } from "../shared/channels.ts";

const minutes = (ago: number): string =>
	new Date(Date.now() - ago * 60_000).toISOString();

const JOBS = [
	{
		id: "job-3",
		kind: "scan",
		state: "running" as const,
		done: 18_400,
		total: 50_000,
		message: "Reading files",
		error: null,
		createdAt: minutes(2),
		startedAt: minutes(2),
		finishedAt: null,
	},
	{
		id: "job-2",
		kind: "tag-write",
		state: "done" as const,
		done: 12,
		total: 12,
		message: "12 written",
		error: null,
		createdAt: minutes(40),
		startedAt: minutes(40),
		finishedAt: minutes(39),
	},
	{
		id: "job-1",
		kind: "scan",
		state: "failed" as const,
		done: 0,
		total: 0,
		message: null,
		error: "The library folder cannot be read: /music",
		createdAt: minutes(300),
		startedAt: minutes(300),
		finishedAt: minutes(300),
	},
];

export default defineFixtures<
	AppRouter,
	Snapshots<{ jobs: typeof jobsChannel }>
>(
	{
		auth: {
			organization: {
				list: () => [
					{
						id: "org-1",
						name: "TrackVault",
						slug: "trackvault",
						logo: null,
						createdAt: new Date(),
						metadata: null,
					},
				],
			},
		},
		settings: {
			read: () => ({
				libraryRoot: "/music",
				lowBitrateThreshold: 256,
				libraryVersion: 12,
			}),
			update: () => ({
				libraryRoot: "/music",
				lowBitrateThreshold: 256,
				libraryVersion: 12,
			}),
		},
		jobs: {
			list: () => JOBS,
			get: () => JOBS[0] as (typeof JOBS)[number],
			cancel: () => JOBS[0] as (typeof JOBS)[number],
		},
		scan: { start: () => JOBS[0] as (typeof JOBS)[number] },
	},
	{},
	{ jobs: () => ({ jobs: JOBS }) },
);
