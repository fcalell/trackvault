import { randomUUID } from "node:crypto";
import {
	type CloudSyncStatus,
	cloudLibrarySyncEnabled,
	openSnapshot,
	probeSchema,
	type RbCue,
	type RbPlaylists,
	type RbTrack,
	type RekordboxInstall,
	readCollection,
	readCues,
	readHistory,
	readPlaylists,
	readRekordboxOptions,
	type SchemaInfo,
} from "@trackvault/core/rekordbox";
import {
	diff,
	type RbDiff,
	type RbSnapshot,
	snapshotOf,
} from "@trackvault/core/rekordbox/sync";
import {
	type AnlzRef,
	type ImportBatch,
	type ImportPlaylist,
	type SnapshotRef,
	splitImportBatch,
} from "@trackvault/core/sync";
import type { Context } from "../context.ts";
import { HubError } from "../hub/client.ts";
import type { LinkRow } from "../state.ts";
import { errorMessage } from "../util.ts";
import { collectAnlz, markAnlzSent, uploadBlobs } from "./anlz.ts";
import { cueEntryOf } from "./convert.ts";
import { type LinkResult, refreshLinks } from "./linker.ts";

// What the import step learned about the install; the export step reuses it.
export interface InstallView {
	signature: string;
	collection: RbTrack[];
	playlists: RbPlaylists;
	schema: SchemaInfo;
	cloud: CloudSyncStatus;
	links: LinkResult;
}

export interface ImportOutcome {
	view: InstallView;
	sent: boolean;
	summary: string;
}

function emptySnapshot(fields: string[]): RbSnapshot {
	return { v: 1, fields, tracks: {}, playlists: {}, cues: {} };
}

function fieldsOf(snapshot: RbSnapshot, contentId: string) {
	const values = snapshot.tracks[contentId] ?? [];
	return Object.fromEntries(
		snapshot.fields.map((f, i) => [f, values[i] ?? null]),
	);
}

// Reads a copy of master.db, diffs it against the stored base and sends what changed in
// Rekordbox (plan section 6, steps 1 and 2). Safe while Rekordbox runs: it never touches the
// live file.
export async function runImport(
	ctx: Context,
	install: RekordboxInstall,
	signature: string,
	appVersion: string | null,
): Promise<ImportOutcome> {
	const { state } = ctx;
	const open = await openSnapshot(install.dbPath);
	let view: InstallView;
	let current: RbSnapshot;
	let cues: Map<string, RbCue[]>;
	let history: ReturnType<typeof readHistory>;
	let collection: RbTrack[];
	let playlists: RbPlaylists;
	try {
		collection = readCollection(open.db);
		playlists = readPlaylists(open.db);
		cues = readCues(open.db);
		history = readHistory(open.db);
		const schema = probeSchema(open.db);
		const options = install.optionsPath
			? await readRekordboxOptions(install.optionsPath)
			: null;
		let cloud: CloudSyncStatus;
		try {
			cloud = cloudLibrarySyncEnabled(open.db, options);
		} catch (error) {
			// A schema the heuristic cannot read: unknown counts as risky, never as off.
			cloud = { state: "unknown", evidence: [errorMessage(error)] };
		}
		current = snapshotOf(collection, playlists, cues);
		const oldLinks = new Map(state.links().map((l) => [l.contentId, l]));
		const links = await refreshLinks(ctx, collection);
		view = { signature, collection, playlists, schema, cloud, links };
		return await sendImport(
			ctx,
			view,
			current,
			cues,
			history,
			oldLinks,
			install,
			appVersion,
		);
	} finally {
		await open.close();
	}
}

async function sendImport(
	ctx: Context,
	view: InstallView,
	current: RbSnapshot,
	cues: Map<string, RbCue[]>,
	history: ReturnType<typeof readHistory>,
	oldLinks: Map<string, LinkRow>,
	install: RekordboxInstall,
	appVersion: string | null,
): Promise<ImportOutcome> {
	const { state, hub, log } = ctx;
	const stored = state.base();
	const baseSnap = stored?.snapshot ?? emptySnapshot(current.fields);
	const baseRef: SnapshotRef = stored?.ref ?? { id: randomUUID(), version: 0 };
	const d: RbDiff = diff(baseSnap, current);
	const { byContent, created, unmatched } = view.links;
	const trackOf = (contentId: string) =>
		byContent.get(contentId)?.trackId ?? null;
	const mapIds = (ids: readonly string[]) =>
		ids.map(trackOf).filter((t): t is string => t !== null);
	const newlyLinked = new Set(created.map((l) => l.contentId));
	const byId = new Map(view.collection.map((t) => [t.id, t]));

	// tracks
	const addedIds = new Set(d.tracks.added.filter((id) => byContent.has(id)));
	for (const id of newlyLinked) addedIds.add(id);
	const added = [...addedIds].map((contentId) => ({
		contentId,
		trackId: trackOf(contentId) as string,
		fields: fieldsOf(current, contentId),
	}));
	const changed = d.tracks.changed
		.filter((c) => byContent.has(c.contentId) && !addedIds.has(c.contentId))
		.map((c) => ({
			contentId: c.contentId,
			trackId: trackOf(c.contentId) as string,
			fields: c.fields,
		}));
	const removed = d.tracks.removed
		.map((contentId) => ({ contentId, link: oldLinks.get(contentId) }))
		.filter((r) => r.link)
		.map((r) => ({
			contentId: r.contentId,
			trackId: (r.link as LinkRow).trackId,
		}));

	// playlists: membership in trackIds; playlists holding a newly linked track are sent
	// too, so the hub learns membership it could not see before.
	const lists = new Map<string, ImportPlaylist>();
	for (const p of d.playlists) {
		const now = current.playlists[p.playlistId];
		const was = baseSnap.playlists[p.playlistId];
		const kind = (now ?? was)?.k ?? "playlist";
		const entry: ImportPlaylist = {
			playlistId: p.playlistId,
			change: p.change,
			kind,
			addedTracks: mapIds(p.addedTracks),
			removedTracks: mapIds(p.removedTracks),
			reordered: p.reordered,
			order: mapIds(p.after),
		};
		if (p.name) entry.name = p.name;
		if (p.parent) entry.parent = p.parent;
		if (p.seq) entry.seq = p.seq;
		if (p.rules) entry.rules = p.rules;
		lists.set(p.playlistId, entry);
	}
	if (newlyLinked.size > 0) {
		for (const [id, p] of Object.entries(current.playlists)) {
			const hits = p.t.filter((c) => newlyLinked.has(c));
			if (hits.length === 0) continue;
			const entry = lists.get(id) ?? {
				playlistId: id,
				change: "changed" as const,
				kind: p.k,
				addedTracks: [],
				removedTracks: [],
				reordered: false,
				order: mapIds(p.t),
			};
			entry.addedTracks = [...new Set([...entry.addedTracks, ...mapIds(hits)])];
			lists.set(id, entry);
		}
	}

	// cues: the whole set of each track whose cues changed or that was just linked
	const cueIds = new Set(
		d.cues.map((c) => c.contentId).filter((id) => byContent.has(id)),
	);
	for (const id of newlyLinked) if (cues.has(id)) cueIds.add(id);
	const cueSets = [...cueIds].map((contentId) => ({
		trackId: trackOf(contentId) as string,
		cues: (cues.get(contentId) ?? []).map(cueEntryOf),
	}));

	// ANLZ refs not sent yet
	const anlzTracks = [...byContent.entries()].flatMap(([contentId, link]) => {
		const track = byId.get(contentId);
		return track ? [{ track, trackId: link.trackId }] : [];
	});
	const anlz = await collectAnlz(ctx, install.shareDir, anlzTracks);

	// plays since the watermark
	const watermark = state.get<number>("rbPlaysWatermark") ?? 0;
	let newest = watermark;
	const plays: { trackId: string; playedAt: number }[] = [];
	for (const session of history) {
		for (const play of session.plays) {
			if (play.playedAt === null || play.playedAt <= watermark) continue;
			newest = Math.max(newest, play.playedAt);
			const trackId = trackOf(play.contentId);
			if (trackId) plays.push({ trackId, playedAt: play.playedAt });
		}
	}

	const nothing =
		stored !== null &&
		d.empty &&
		created.length === 0 &&
		plays.length === 0 &&
		anlz.refs.length === 0;
	if (nothing)
		return {
			view,
			sent: false,
			summary: "rekordbox: no changes since the last import",
		};

	const next: SnapshotRef = { id: baseRef.id, version: baseRef.version + 1 };
	const full: ImportBatch = {
		batchId: randomUUID(),
		part: 0,
		parts: 1,
		base: baseRef,
		next,
		takenAt: Date.now(),
		rekordbox: { appVersion, dbVersion: view.schema.dbVersion },
		links: created.map((l) => ({
			contentId: l.contentId,
			trackId: l.trackId,
			via: l.via,
		})),
		unmatched: unmatched.slice(0, 200).map((t) => ({
			contentId: t.id,
			path: t.path,
			title: t.title,
			artist: t.artist,
		})),
		unmatchedCount: unmatched.length,
		tracks: { added, changed, removed },
		playlists: [...lists.values()],
		cues: cueSets,
		anlz: anlz.refs,
		plays,
	};

	const wanted: string[] = [];
	try {
		const parts = splitImportBatch(full);
		for (const part of parts) {
			const result = await hub.rekordboxImport(part);
			wanted.push(...result.wantBlobs);
			for (const c of result.conflicts) {
				log.warn(
					`rekordbox conflict on ${c.entity} ${c.refId}${c.field ? `.${c.field}` : ""}: ${c.winner} won`,
				);
			}
		}
	} catch (error) {
		if (error instanceof HubError && error.code === "base-mismatch") {
			// The hub's idea of our base differs (a reset, a restored backup): start over
			// from nothing, which is a first import and merges safely.
			log.warn("hub rejected the Rekordbox base; re-importing from scratch");
			state.dropBase();
			state.set("rbPlaysWatermark", null);
			return runAgainFresh(
				ctx,
				view,
				current,
				cues,
				history,
				oldLinks,
				install,
				appVersion,
			);
		}
		throw error;
	}

	state.saveBase(next, current);
	state.set("rbPlaysWatermark", newest);
	markAnlzSent(ctx, anlz.refs);
	const blobs = await uploadBlobs(ctx, wanted, anlz.refs, anlz.paths);
	const summary = `rekordbox import: ${added.length} added, ${changed.length} changed, ${removed.length} removed tracks, ${lists.size} playlists, ${cueSets.length} cue sets, ${plays.length} plays, ${blobs} analysis files (${unmatched.length} unmatched)`;
	return { view, sent: true, summary };
}

async function runAgainFresh(
	ctx: Context,
	view: InstallView,
	current: RbSnapshot,
	cues: Map<string, RbCue[]>,
	history: ReturnType<typeof readHistory>,
	oldLinks: Map<string, LinkRow>,
	install: RekordboxInstall,
	appVersion: string | null,
): Promise<ImportOutcome> {
	try {
		return await sendImport(
			ctx,
			view,
			current,
			cues,
			history,
			oldLinks,
			install,
			appVersion,
		);
	} catch (error) {
		throw new Error(`re-import failed: ${errorMessage(error)}`);
	}
}

export type { AnlzRef };
