// Times the sync surface against the seeded library (pnpm seed:bench, 50k tracks):
//   DB_FILE=... node scripts/bench-sync.ts
// It plays the agent: hello, the manifest paged through, a first Rekordbox import of a
// synthetic 50k-track collection (split into parts of 1000 as the agent does), a small
// second import, then the export stream. The synthetic install is built from the core
// sync types. It writes into the database it is given: use a scratch copy.
import { performance } from "node:perf_hooks";
import { type ImportBatch, splitImportBatch } from "@trackvault/core/sync";
import { applyPatches } from "../src/server/lib/changes.ts";
import { db } from "../src/server/lib/db.ts";
import { addMembers, createNode } from "../src/server/lib/playlists.ts";
import { registerDevice } from "../src/server/lib/sync/devices.ts";
import { manifestPage } from "../src/server/lib/sync/manifest.ts";
import { ackExport, exportPage } from "../src/server/lib/sync/rb-export.ts";
import { importPart } from "../src/server/lib/sync/rb-import.ts";

const DEVICE = "bench-device";
const ms = (from: number): number => Math.round(performance.now() - from);
interface Row {
	id: string;
	genre: string | null;
	title: string | null;
	artist: string | null;
	remixer: string | null;
	album: string | null;
	label: string | null;
	year: number | null;
	comment: string | null;
	rating: number;
	colour: string | null;
}
const rows = (
	db() as unknown as { $client: { prepare(sql: string): { all(): Row[] } } }
).$client
	.prepare(
		"SELECT id, genre, title, artist, remixer, album, label, year, comment, rating, colour FROM tracks ORDER BY seq",
	)
	.all();
console.log(`library: ${rows.length} tracks`);

registerDevice(DEVICE, {
	protocol: 1,
	agentVersion: "bench",
	name: "Bench Mac",
	platform: "darwin",
	localRoot: "/music",
	freeDiskBytes: 1e12,
	totalDiskBytes: 2e12,
	modes: ["replica", "rekordbox"],
	rekordbox: {
		installed: true,
		appVersion: "7.0.0",
		dbVersion: "1000",
		running: false,
		writeSupport: "supported",
		exportState: "idle",
		pendingExport: 0,
		lastImportAt: null,
		lastExportAt: null,
		message: null,
	},
	manifestCursor: null,
	rekordboxBase: null,
});

// -- manifest ---------------------------------------------------------------
{
	let cursor: string | null = null;
	let pages = 0;
	let entries = 0;
	let worst = 0;
	const started = performance.now();
	for (;;) {
		const at = performance.now();
		const page = manifestPage(cursor, 1000);
		worst = Math.max(worst, ms(at));
		pages++;
		entries += page.upserts.length + page.deletes.length;
		cursor = page.cursor;
		if (!page.hasMore) break;
	}
	console.log(
		`manifest: ${pages} pages, ${entries} entries in ${ms(started)} ms (avg ${Math.round(ms(started) / pages)} ms/page, worst ${worst} ms)`,
	);
	const at = performance.now();
	const empty = manifestPage(cursor, 1000);
	console.log(
		`manifest at head: ${ms(at)} ms (${empty.upserts.length} entries)`,
	);
}

// -- a synthetic Rekordbox install of every track ------------------------------
const content = (i: number) => `c${i}`;
const full: ImportBatch = {
	batchId: "bench-import-1",
	part: 0,
	parts: 1,
	base: { id: "bench-base", version: 0 },
	next: { id: "bench-base", version: 1 },
	takenAt: Date.now(),
	rekordbox: { appVersion: "7.0.0", dbVersion: "1000" },
	links: rows.map((row, i) => ({
		contentId: content(i),
		trackId: row.id,
		via: "path" as const,
	})),
	unmatched: [],
	unmatchedCount: 0,
	tracks: {
		added: rows.map((row, i) => ({
			contentId: content(i),
			trackId: row.id,
			fields: {
				title: row.title,
				artist: row.artist,
				remixer: row.remixer,
				album: row.album,
				genre: i % 25 === 0 ? "Disco" : row.genre, // 4% differ from the hub
				label: row.label,
				year: row.year,
				comment: row.comment ?? (i % 10 === 0 ? "from rekordbox" : null),
				rating: row.rating,
				color: row.colour,
				myTags: i % 7 === 0 ? ["Peak"] : [],
			},
		})),
		changed: [],
		removed: [],
	},
	// 50 folders of 4 playlists, each of 250 tracks: 50k memberships.
	playlists: [
		...Array.from({ length: 50 }, (_, f) => ({
			playlistId: `f${f}`,
			change: "added" as const,
			kind: "folder" as const,
			name: { before: "", after: `Folder ${f}` },
			addedTracks: [],
			removedTracks: [],
			reordered: false,
			order: [],
		})),
		...Array.from({ length: 200 }, (_, p) => ({
			playlistId: `p${p}`,
			change: "added" as const,
			kind: "playlist" as const,
			name: { before: "", after: `Playlist ${p}` },
			parent: { before: null, after: `f${Math.floor(p / 4)}` },
			addedTracks: rows.slice(p * 250, p * 250 + 250).map((r) => r.id),
			removedTracks: [],
			reordered: false,
			order: rows.slice(p * 250, p * 250 + 250).map((r) => r.id),
		})),
	],
	cues: rows.slice(0, 5000).map((row) => ({
		trackId: row.id,
		cues: [
			{
				kind: 1,
				startMs: 1000,
				endMs: null,
				color: 3,
				colorTableIndex: null,
				comment: null,
				activeLoop: false,
				beatLoopSize: null,
			},
			{
				kind: 0,
				startMs: 32000,
				endMs: null,
				color: null,
				colorTableIndex: null,
				comment: "drop",
				activeLoop: false,
				beatLoopSize: null,
			},
		],
	})),
	anlz: [],
	plays: rows.slice(0, 10000).map((row, i) => ({
		trackId: row.id,
		playedAt: 1_700_000_000_000 + i * 1000,
	})),
};

{
	const parts = splitImportBatch(full);
	let worst = 0;
	let conflicts = 0;
	const started = performance.now();
	for (const part of parts) {
		const at = performance.now();
		const result = importPart(DEVICE, part);
		worst = Math.max(worst, ms(at));
		conflicts += result.conflicts.length;
	}
	console.log(
		`first import (${rows.length} tracks, ${full.playlists.length} playlists, ${full.cues.length} cue sets, ${full.plays.length} plays): ${parts.length} parts in ${ms(started)} ms (worst part ${worst} ms), ${conflicts} conflicts`,
	);
	// A repeat of a part answers the stored result.
	const again = performance.now();
	importPart(DEVICE, parts[3] as ImportBatch);
	console.log(`repeated part: ${ms(again)} ms`);
}

// -- a small second import: the device changed 1000 genres ------------------------
{
	const changed = rows.slice(100, 1100).map((row, i) => ({
		contentId: content(100 + i),
		trackId: row.id,
		fields: [
			{
				field: "comment",
				before: i % 10 === 0 ? "from rekordbox" : null,
				after: "edited later",
			},
		],
	}));
	const second: ImportBatch = {
		...full,
		batchId: "bench-import-2",
		base: { id: "bench-base", version: 1 },
		next: { id: "bench-base", version: 2 },
		takenAt: Date.now(),
		links: [],
		tracks: { added: [], changed, removed: [] },
		playlists: [],
		cues: [],
		plays: [],
	};
	const at = performance.now();
	const result = importPart(DEVICE, second);
	console.log(
		`second import (1000 changed fields): ${ms(at)} ms, ${result.conflicts.length} conflicts`,
	);
}

// -- export ------------------------------------------------------------------------
{
	// The hub changes: a playlist, a tag edit, a new member.
	const folder = db().transaction((tx) =>
		createNode(
			tx,
			{ batchId: "bench-ui", origin: "ui", label: "Bench" },
			{ parentId: null, kind: "manual", name: "From the hub" },
			new Date(),
		),
	);
	db().transaction((tx) =>
		addMembers(
			tx,
			{ batchId: "bench-ui", origin: "ui", label: "Bench" },
			folder.id,
			rows.slice(0, 300).map((r) => r.id),
			new Date(),
		),
	);
	applyPatches(
		rows
			.slice(2000, 2500)
			.map((row) => ({ id: row.id, patch: { genre: "House" } })),
		{ batchId: "bench-ui-2", origin: "ui", label: "Bench edit" },
	);
	let cursor: string | null = null;
	let pages = 0;
	let changes = 0;
	const kinds: Record<string, number> = {};
	const started = performance.now();
	for (;;) {
		const at = performance.now();
		const page = exportPage(DEVICE, { cursor, limit: 500, base: null });
		pages++;
		for (const change of page.changes)
			kinds[change.kind] = (kinds[change.kind] ?? 0) + 1;
		changes += page.changes.length;
		cursor = page.cursor;
		if (pages === 1)
			console.log(
				`export first page: ${ms(at)} ms (${page.changes.length} changes)`,
			);
		if (!page.hasMore) break;
	}
	console.log(
		`export from nothing: ${pages} pages, ${changes} changes in ${ms(started)} ms`,
		kinds,
	);
	ackExport(DEVICE, {
		cursor: cursor as string,
		base: { id: "bench-base", version: 3 },
		applied: changes,
		deferred: 0,
		links: { tracks: [], playlists: [], removedTracks: [] },
		rekordbox: {
			installed: true,
			appVersion: "7.0.0",
			dbVersion: "1000",
			running: false,
			writeSupport: "supported",
			exportState: "idle",
			pendingExport: 0,
			lastImportAt: null,
			lastExportAt: null,
			message: null,
		},
	});
	const at = performance.now();
	const idle = exportPage(DEVICE, { cursor, limit: 500, base: null });
	console.log(
		`export when nothing is waiting: ${ms(at)} ms (${idle.changes.length} changes, pending ${idle.pending})`,
	);
	applyPatches(
		[{ id: (rows[10] as { id: string }).id, patch: { genre: "Techno" } }],
		{
			batchId: "bench-ui-3",
			origin: "ui",
			label: "Bench edit",
		},
	);
	const after = exportPage(DEVICE, { cursor, limit: 500, base: null });
	console.log(
		`export after one tag edit: ${after.changes.map((c) => c.kind).join(",")}`,
	);
}
