import type { Snapshots } from "@fcalell/plugin-node/ws";
import { defineFixtures } from "@fcalell/plugin-screens/fixtures";
import type { AppRouter } from "../../.stack/worker";
import type { jobsChannel, libraryChannel } from "../shared/channels.ts";

const minutes = (ago: number): string =>
	new Date(Date.now() - ago * 60_000).toISOString();

const TAGS = [
	{ id: 1, name: "Peak time", tracks: 840 },
	{ id: 2, name: "Warm-up", tracks: 612 },
	{ id: 3, name: "Closing", tracks: 97 },
];

const job = (kind: string, state: "done" | "running", at: number) => ({
	id: `job-${kind}`,
	kind,
	state,
	done: 100,
	total: 100,
	message: null,
	error: null,
	createdAt: minutes(at),
	startedAt: minutes(at),
	finishedAt: minutes(at - 1),
});

const CHANGE_ROWS = [
	{
		id: "1",
		trackId: "track-1",
		label: "Kalomi - Midnight Echo (Extended Mix)",
		field: "genre",
		before: "Tech-House",
		after: "Tech House",
	},
	{
		id: "2",
		trackId: "track-2",
		label: "Rendor - Velvet Signal (Original Mix)",
		field: "genre",
		before: "DnB",
		after: "Drum & Bass",
	},
	{
		id: "3",
		trackId: "track-3",
		label: "Sha & Tormar - Neon Drift (Extended Mix)",
		field: "artist",
		before: "Sha & Tormar feat. Lio",
		after: "Sha & Tormar",
	},
];

const BATCH = {
	id: "batch-1",
	origin: "ui" as const,
	label: "Edit tags",
	count: 3,
	at: new Date(Date.now() - 3_600_000),
	undone: false,
	undoable: true,
};

const GROUP_MEMBERS = (base: number) => [
	{
		id: `track-${base}`,
		title: "Midnight Echo",
		artist: "Kalomi",
		mixName: "Original Mix",
		format: "mp3",
		bitrate: 320,
		durationMs: 372_000,
		size: 14_800_000,
	},
	{
		id: `track-${base + 1}`,
		title: "Midnight Echo",
		artist: "Kalomi",
		mixName: "Original Mix",
		format: "mp3",
		bitrate: 192,
		durationMs: 372_000,
		size: 8_900_000,
	},
];

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

const SETTINGS = {
	libraryRoot: "/music",
	lowBitrateThreshold: 256,
	quarantineDays: 30,
	libraryVersion: 12,
};

const ORGANIZATION = {
	id: "org-1",
	name: "TrackVault",
	slug: "trackvault",
	logo: null,
	createdAt: new Date(),
	metadata: null,
};

const PLAYLISTS = [
	{
		id: "pl-house",
		parentId: null,
		kind: "folder" as const,
		name: "House",
		position: 1024,
		tracks: 0,
	},
	{
		id: "pl-peak",
		parentId: "pl-house",
		kind: "manual" as const,
		name: "Peak time",
		position: 1024,
		tracks: 214,
	},
	{
		id: "pl-deep",
		parentId: "pl-house",
		kind: "manual" as const,
		name: "Deep and late",
		position: 2048,
		tracks: 96,
	},
	{
		id: "pl-fresh",
		parentId: null,
		kind: "smart" as const,
		name: "Fresh 124 to 128",
		position: 2048,
		tracks: 1320,
	},
];

const REKORDBOX = {
	installed: true,
	appVersion: "7.0.3",
	dbVersion: "7.0.3",
	running: false,
	writeSupport: "pending-verification",
	exportState: "idle",
	pendingExport: 14,
	lastImportAt: minutes(12),
	lastExportAt: null,
	message: null,
};

const DEVICES = [
	{
		id: "dev-mac",
		name: "DJ Mac",
		state: "online" as const,
		platform: "darwin",
		hostname: "djs-macbook",
		agentVersion: "0.1.0",
		modes: ["replica", "rekordbox"],
		localRoot: "/Users/dj/Music/TrackVault",
		keyStart: "stk_a1b2c",
		createdAt: new Date(Date.now() - 20 * 86_400_000),
		expiresAt: null,
		lastSeenAt: new Date(Date.now() - 30_000),
		freeDiskBytes: 220_000_000_000,
		files: { ok: 47_900, pending: 310, failed: 0 },
		rekordbox: REKORDBOX,
		openConflicts: 3,
		unmatched: 41,
		lastImportAt: new Date(Date.now() - 12 * 60_000),
		lastExportAt: null,
	},
	{
		id: "dev-pc",
		name: "Booth PC",
		state: "offline" as const,
		platform: "win32",
		hostname: "booth",
		agentVersion: "0.1.0",
		modes: ["upload"],
		localRoot: null,
		keyStart: "stk_9f8e7",
		createdAt: new Date(Date.now() - 60 * 86_400_000),
		expiresAt: null,
		lastSeenAt: new Date(Date.now() - 3 * 86_400_000),
		freeDiskBytes: null,
		files: { ok: 0, pending: 0, failed: 0 },
		rekordbox: null,
		openConflicts: 0,
		unmatched: null,
		lastImportAt: null,
		lastExportAt: null,
	},
	{
		id: "dev-old",
		name: "Old laptop",
		state: "revoked" as const,
		platform: "darwin",
		hostname: null,
		agentVersion: null,
		modes: [],
		localRoot: null,
		keyStart: null,
		createdAt: null,
		expiresAt: null,
		lastSeenAt: new Date(Date.now() - 90 * 86_400_000),
		freeDiskBytes: null,
		files: { ok: 12_000, pending: 0, failed: 0 },
		rekordbox: null,
		openConflicts: 0,
		unmatched: null,
		lastImportAt: null,
		lastExportAt: null,
	},
];

const CONFLICTS = [
	{
		id: 3,
		deviceId: "dev-mac",
		device: "DJ Mac",
		entity: "track" as const,
		refId: "track-3",
		label: "Sha & Tormar - Neon Drift (Extended Mix)",
		field: "genre",
		deviceValue: "Disco",
		hubValue: "House",
		winner: "hub" as const,
		at: new Date(Date.now() - 12 * 60_000),
	},
	{
		id: 2,
		deviceId: "dev-mac",
		device: "DJ Mac",
		entity: "track" as const,
		refId: "track-4",
		label: "Elix - Lunar Ritual (Original Mix)",
		field: "rating",
		deviceValue: "5",
		hubValue: "3",
		winner: "device" as const,
		at: new Date(Date.now() - 12 * 60_000),
	},
	{
		id: 1,
		deviceId: "dev-mac",
		device: "DJ Mac",
		entity: "playlist" as const,
		refId: "pl-peak",
		label: "Peak time",
		field: "order",
		deviceValue: "214 tracks in order",
		hubValue: "214 tracks in order",
		winner: "hub" as const,
		at: new Date(Date.now() - 12 * 60_000),
	},
];

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
	playCount: 0,
	lastPlayedAt: null,
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
			devices: {
				list: () => [],
				create: ({ name }) => ({
					device: {
						id: "dev-new",
						name,
						start: "stk_fixtu",
						createdAt: new Date(),
						expiresAt: null,
						lastUsedAt: null,
					},
					key: "stk_fixturekey",
				}),
				revoke: () => ({ success: true }),
			},
			organization: {
				list: () => [ORGANIZATION],
				create: () => ({ ...ORGANIZATION, members: [] }),
			},
		},
		settings: {
			read: () => SETTINGS,
			update: () => SETTINGS,
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
				tags: TAGS.map((tag) => ({
					id: tag.id,
					name: tag.name,
					count: tag.tracks,
				})),
				total: TOTAL,
			}),
			get: ({ id }) => record(Number(id.replace("track-", "")) || 0),
			update: ({ id }) => record(Number(id.replace("track-", "")) || 0),
		},
		bulk: {
			preview: () => ({
				total: 3,
				sampled: 3,
				touched: 3,
				changes: CHANGE_ROWS.map((row) => ({
					key: row.id,
					label: row.label,
					field: row.field,
					before: row.before,
					after: row.after,
				})),
			}),
			edit: () => job("edit", "running", 1),
			rules: () => job("rules", "running", 1),
			organise: () => job("organise", "running", 1),
			quarantine: () => job("quarantine", "running", 1),
			dedupe: () => job("dedupe", "running", 1),
		},
		tags: {
			list: () => TAGS,
			forTrack: () => TAGS.slice(0, 2).map(({ id, name }) => ({ id, name })),
			create: () => ({ id: 9, name: "New", createdAt: new Date() }),
			rename: () => undefined,
			remove: () => undefined,
			assign: () => undefined,
		},
		cleanup: {
			list: () => [
				{
					id: "builtin.whitespace",
					name: "Trim and collapse whitespace",
					enabled: true,
					builtin: true,
					summary: "whitespace",
					form: {
						action: "whitespace" as const,
						fields: [],
						caseMode: undefined,
						pattern: undefined,
						replacement: undefined,
						literal: true,
						setField: undefined,
						setValue: undefined,
						onlyIfEmpty: true,
					},
				},
				{
					id: "rule.1",
					name: "Title case the artist",
					enabled: false,
					builtin: false,
					summary: "title case",
					form: {
						action: "case" as const,
						fields: ["artist" as const],
						caseMode: "title" as const,
						pattern: undefined,
						replacement: undefined,
						literal: true,
						setField: undefined,
						setValue: undefined,
						onlyIfEmpty: true,
					},
				},
			],
			save: () => ({ id: "rule.1" }),
			toggle: () => undefined,
			remove: () => undefined,
			preview: () => job("rules", "running", 1),
			apply: () => job("rules", "running", 1),
		},
		previews: {
			latest: ({ kind }) => ({
				job: job(kind, "done", 5),
				result: {
					mode: "preview",
					tracks: 3,
					fields: 3,
					scanned: 48_210,
					moves: 3,
					collisions: 1,
					unchanged: 48_000,
					skipped: 0,
				},
			}),
			list: ({ offset = 0, limit = 200 }) => ({
				data: CHANGE_ROWS.slice(offset, offset + limit),
				total: CHANGE_ROWS.length,
				offset,
			}),
		},
		organiser: {
			get: () => ({
				template: "{genre|Unknown}/{artist|Unknown} - {title}",
			}),
			save: () => undefined,
			preview: () => job("organise", "running", 1),
			apply: () => job("organise", "running", 1),
		},
		history: {
			list: ({ offset = 0, limit = 100 }) => ({
				data: [
					BATCH,
					{
						...BATCH,
						id: "batch-2",
						origin: "scan" as const,
						label: "Library scan",
						count: 412,
						undoable: false,
					},
					{
						...BATCH,
						id: "batch-3",
						origin: "rule" as const,
						label: "Cleanup rules",
						count: 1880,
						undone: true,
						undoable: false,
					},
				].slice(offset, offset + limit),
				total: 3,
				offset,
			}),
			get: () => BATCH,
			changes: ({ offset = 0, limit = 200 }) => ({
				data: CHANGE_ROWS.slice(offset, offset + limit),
				total: CHANGE_ROWS.length,
				offset,
			}),
			undo: () => job("undo", "running", 1),
		},
		genres: {
			list: () => [
				{
					id: 1,
					name: "Tech House",
					tracks: 5200,
					aliases: [
						{ id: 1, alias: "Tech-House" },
						{ id: 2, alias: "Techhouse" },
					],
				},
				{
					id: 2,
					name: "Drum & Bass",
					tracks: 1900,
					aliases: [{ id: 3, alias: "DnB" }],
				},
			],
			unknown: () => [
				{ value: "Hous", count: 14, suggestions: ["House", "Deep House"] },
				{
					value: "Minimal Tech",
					count: 6,
					suggestions: ["Minimal / Deep Tech"],
				},
			],
			create: () => ({ id: 3, name: "New", createdAt: new Date() }),
			remove: () => undefined,
			addAlias: () => ({ id: 9, alias: "x", genreId: 1 }),
			removeAlias: () => undefined,
			mapOne: () => undefined,
			map: () => ({ mapped: 1 }),
		},
		aliases: {
			list: () => [
				{ id: 1, alias: "Sha and Tormar", canonical: "Sha & Tormar" },
			],
			suggest: () => [
				{
					canonical: "Kalomi",
					variants: [
						{ value: "KALOMI", count: 12 },
						{ value: "kalomi ", count: 3 },
					],
				},
			],
			map: () => ({ mapped: 2 }),
			add: () => ({ id: 2, alias: "x", canonical: "y" }),
			remove: () => undefined,
		},
		unifyTags: {
			preview: () => job("unify", "running", 1),
			apply: () => job("unify", "running", 1),
		},
		health: {
			summary: () => ({
				total: TOTAL,
				issues: [
					{ value: "lowBitrate" as const, count: 6200 },
					{ value: "noKey" as const, count: 1900 },
					{ value: "corrupt" as const, count: 0 },
					{ value: "fakeBitrate" as const, count: 211 },
				],
				checked: { integrity: 30_000, bitrate: 12_000 },
				ffmpeg: true,
			}),
			run: () => job("integrity", "running", 1),
		},
		dupes: {
			groups: () => ({
				total: 2,
				groups: [
					{
						id: 1,
						reason: "exact" as const,
						confidence: 1,
						keeperId: "track-10",
						keeperReason: "kept higher bitrate (320 vs 192 kbps)",
						members: GROUP_MEMBERS(10),
					},
					{
						id: 2,
						reason: "fuzzy" as const,
						confidence: 0.88,
						keeperId: "track-20",
						keeperReason: "kept more complete tags (9 vs 6 fields)",
						members: GROUP_MEMBERS(20),
					},
				],
			}),
			status: () => ({ open: 2, dismissed: 1, fingerprints: 0, fpcalc: false }),
			run: () => job("dedupe", "running", 1),
			dismiss: () => undefined,
			restore: () => undefined,
			keep: () => undefined,
			merge: () => job("merge", "running", 1),
		},
		quarantine: {
			list: ({ offset = 0, limit = 200 }) => ({
				data: [
					{
						id: "1",
						label: "Kalomi - Midnight Echo",
						originalPath: "House/Kalomi - Midnight Echo.mp3",
						at: new Date(Date.now() - 86_400_000),
						daysLeft: 29,
					},
				].slice(offset, offset + limit),
				total: 1,
				offset,
			}),
			restore: () => job("restore", "running", 1),
			restoreAll: () => job("restore", "running", 1),
			purge: () => job("purge", "running", 1),
		},
		playlists: {
			tree: () => PLAYLISTS,
			get: ({ id }) => {
				const row =
					PLAYLISTS.find((each) => each.id === id) ??
					(PLAYLISTS[1] as (typeof PLAYLISTS)[number]);
				return {
					id: row.id,
					parentId: row.parentId,
					kind: row.kind,
					name: row.name,
					rule:
						row.kind === "smart"
							? {
									editable: true,
									match: "all" as const,
									conditions: ["bpm between 124 128", "added within 30"],
									sortBy: "addedAt" as const,
									descending: true,
									limit: undefined,
								}
							: null,
				};
			},
			tracks: ({ offset = 0, limit = 200 }) => ({
				data: Array.from({ length: Math.min(limit, 214 - offset) }, (_, at) =>
					track(offset + at),
				),
				total: 214,
				offset,
			}),
			create: () => ({ id: "pl-new" }),
			createSmart: () => ({ id: "pl-new" }),
			updateSmart: () => undefined,
			preview: () => ({
				count: 1320,
				sample: [{ id: "track-1", title: "Midnight Echo", artist: "Kalomi" }],
			}),
			rename: () => undefined,
			move: () => undefined,
			remove: () => undefined,
			add: () => ({ added: 3, job: null }),
			removeTracks: () => ({ removed: 3, job: null }),
			reorder: () => undefined,
			forTrack: () =>
				PLAYLISTS.slice(1, 3).map(({ id, name }) => ({ id, name })),
		},
		devices: {
			list: () => DEVICES,
			forget: () => undefined,
			wake: () => undefined,
			conflicts: ({ offset = 0, limit = 200 }) => ({
				data: CONFLICTS.slice(offset, offset + limit),
				total: CONFLICTS.length,
				offset,
			}),
			resolve: () => ({ resolved: 1, changed: 1 }),
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
	{ trackId: "track-3", batchId: "batch-1", playlistId: "pl-peak" },
	{ jobs: () => ({ jobs: JOBS }), library: () => ({ version: 12 }) },
);
