import type { Snapshots } from "@fcalell/plugin-node/ws";
import { defineFixtures } from "@fcalell/plugin-screens/fixtures";
import type { AppRouter } from "../../.stack/worker";
import type { jobsChannel, libraryChannel } from "../shared/channels.ts";

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

const ORGANIZATION = {
	id: "org-1",
	name: "TrackVault",
	slug: "trackvault",
	logo: null,
	createdAt: new Date(),
	metadata: null,
};

const GENRES = ["House", "Tech House", "Techno", "Deep House", "Trance"];
const KEYS = ["8A", "9A", "10A", "11B", "5A", "12B"];
const TITLES = [
	"Midnight Echo",
	"Velvet Signal",
	"Neon Drift",
	"Lunar Ritual",
	"Glass Horizon",
];
const ARTISTS = ["Kalomi", "Rendor", "Sha & Tormar", "Elix", "Bripa"];
const TOTAL = 48_210;

// A track of the library by its place in it: the same one every time.
const track = (at: number) => ({
	id: `track-${at}`,
	title: `${TITLES[at % TITLES.length]} (${at % 3 === 0 ? "Extended Mix" : "Original Mix"})`,
	artist: ARTISTS[at % ARTISTS.length] ?? null,
	mixName: at % 3 === 0 ? "Extended Mix" : "Original Mix",
	bpm: 120 + (at % 14),
	key: KEYS[at % KEYS.length] ?? null,
	genre: GENRES[at % GENRES.length] ?? null,
	rating: at % 6,
	durationMs: 300_000 + (at % 90) * 1000,
	format: "mp3",
	bitrate: at % 7 === 0 ? 192 : 320,
	addedAt: new Date(Date.now() - at * 3_600_000),
	issues: at % 7 === 0 ? 1 : 0,
});

const record = (at: number) => ({
	...track(at),
	seq: at + 1,
	audioHash: `hash-${at}`,
	fingerprint: null,
	artists: null,
	remixer: null,
	album: "Midnight Sessions",
	albumArtist: null,
	label: "Cipher Records",
	genreId: null,
	year: 2021,
	releaseDate: null,
	isrc: null,
	energy: 7,
	loudness: null,
	colour: null,
	comment: null,
	sampleRate: 44_100,
	size: 12_000_000,
	hasArt: true,
	blockKey: null,
	updatedAt: new Date(),
	version: 12,
	peaks: false,
});

export default defineFixtures<
	AppRouter,
	Snapshots<{ jobs: typeof jobsChannel; library: typeof libraryChannel }>
>(
	{
		auth: {
			organization: {
				list: () => [ORGANIZATION],
				create: () => ({ ...ORGANIZATION, members: [] }),
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
		tracks: {
			list: ({ offset = 0, limit = 200 }) => ({
				data: Array.from({ length: Math.min(limit, TOTAL - offset) }, (_, at) =>
					track(offset + at),
				),
				total: TOTAL,
				offset,
			}),
			facets: () => ({
				genres: GENRES.map((value, at) => ({
					value,
					count: 20_000 - at * 3000,
				})),
				keys: KEYS.map((value, at) => ({ value, count: 4000 - at * 300 })),
				formats: [{ value: "mp3", count: TOTAL }],
				issues: [
					{ value: "lowBitrate" as const, count: 6200 },
					{ value: "noKey" as const, count: 1900 },
				],
				total: TOTAL,
			}),
			get: ({ id }) => record(Number(id.replace("track-", "")) || 0),
			update: ({ id }) => record(Number(id.replace("track-", "")) || 0),
		},
		fs: {
			browse: ({ path }) => ({
				path: path ?? "/music",
				parent: "/",
				dirs: [
					{ name: "House", path: "/music/House" },
					{ name: "Techno", path: "/music/Techno" },
				],
				truncated: false,
			}),
		},
	},
	{ trackId: "track-3" },
	{ jobs: () => ({ jobs: JOBS }), library: () => ({ version: 12 }) },
);
