import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
	MasterWriter,
	type RbPlaylists,
	type RbTrack,
	type RekordboxInstall,
	readCollection,
	readCues,
	readPlaylists,
	readRekordboxOptions,
	relinkAnlzPath,
	toRekordboxPath,
	WRITE_ALLOWED_DB_VERSIONS,
	WriteRefused,
	type WriteTx,
} from "@trackvault/core/rekordbox";
import { type RbSnapshot, snapshotOf } from "@trackvault/core/rekordbox/sync";
import type {
	AnlzRef,
	ExportAck,
	ExportChange,
	ImportLink,
	RekordboxStatus,
	SnapshotRef,
	WriteSupport,
} from "@trackvault/core/sync";
import type { Context } from "../context.ts";
import { localPath } from "../replica/files.ts";
import type { DesiredPlaylist, FileRow, LinkRow } from "../state.ts";
import { errorMessage } from "../util.ts";
import { stageBlobs } from "./anlz.ts";
import { cueInputOf, fieldInputOf, myTagsOf, sameList } from "./convert.ts";
import type { InstallView } from "./importer.ts";

type AddChange = Extract<ExportChange, { kind: "track.add" }>;

export function allowedVersions(ctx: Context): readonly string[] {
	return ctx.config.rekordbox.allowedDbVersions ?? WRITE_ALLOWED_DB_VERSIONS;
}

// Can the writer touch this master.db? An empty allowlist reports "pending-verification":
// writes wait for the R2 spike that records a tested DBVersion.
export function classifyWrite(ctx: Context, view: InstallView): WriteSupport {
	if (view.cloud.state === "on") return "cloud-sync";
	if (!view.schema.complete) return "unsupported-schema";
	const allowed = allowedVersions(ctx);
	if (allowed.length === 0) return "pending-verification";
	if (
		view.schema.dbVersion === null ||
		!allowed.includes(view.schema.dbVersion)
	)
		return "unsupported-schema";
	return "supported";
}

// ---- the plan: pages folded into what to write --------------------------------------------

export interface Plan {
	adds: Map<string, AddChange>;
	updates: Map<
		string,
		Record<string, import("@trackvault/core/sync").FieldValue>
	>;
	cues: Map<string, import("@trackvault/core/sync").CueEntry[]>;
	removes: Set<string>;
	playlistRemoves: { hubId: string; deviceRef: string | null }[];
	anlz: AnlzRef[];
	count: number;
}

export function emptyPlan(): Plan {
	return {
		adds: new Map(),
		updates: new Map(),
		cues: new Map(),
		removes: new Set(),
		playlistRemoves: [],
		anlz: [],
		count: 0,
	};
}

// Folds changes, in hub order, into a plan; playlists go straight to the desired table.
export function foldChanges(
	ctx: Context,
	plan: Plan,
	changes: readonly ExportChange[],
): void {
	const { state } = ctx;
	for (const c of changes) {
		plan.count++;
		switch (c.kind) {
			case "track.add":
				plan.removes.delete(c.trackId);
				plan.updates.delete(c.trackId);
				plan.adds.set(c.trackId, c);
				plan.cues.set(c.trackId, c.cues);
				plan.anlz.push(...c.anlz);
				break;
			case "track.update": {
				const add = plan.adds.get(c.trackId);
				if (add)
					plan.adds.set(c.trackId, {
						...add,
						fields: { ...add.fields, ...c.fields },
					});
				else
					plan.updates.set(c.trackId, {
						...plan.updates.get(c.trackId),
						...c.fields,
					});
				break;
			}
			case "cues.set":
				plan.cues.set(c.trackId, c.cues);
				plan.anlz.push(...c.anlz);
				break;
			case "track.remove":
				plan.adds.delete(c.trackId);
				plan.updates.delete(c.trackId);
				plan.cues.delete(c.trackId);
				plan.removes.add(c.trackId);
				break;
			case "playlist.set": {
				const old = state.playlists().find((p) => p.hubId === c.playlistId);
				state.putPlaylist({
					hubId: c.playlistId,
					rbId: old?.rbId ?? c.deviceRef,
					change: c,
				});
				break;
			}
			case "playlist.remove":
				plan.playlistRemoves.push({
					hubId: c.playlistId,
					deviceRef: c.deviceRef,
				});
				break;
		}
	}
}

// ---- dry checks: is there anything to write? --------------------------------------------------

function expectedPath(root: string, file: FileRow): string {
	return toRekordboxPath(localPath(root, file.haveRelPath ?? file.relPath));
}

// Replica files whose managed content points elsewhere (the file moved).
export function pendingRelinks(
	ctx: Context,
	collection: readonly RbTrack[],
): { link: LinkRow; track: RbTrack; path: string }[] {
	const root = ctx.config.localRoot as string;
	const byId = new Map(collection.map((t) => [t.id, t]));
	const out: { link: LinkRow; track: RbTrack; path: string }[] = [];
	for (const link of ctx.state.links()) {
		if (!link.managed) continue;
		const track = byId.get(link.contentId);
		const file = ctx.state.file(link.trackId);
		if (!track || !file || file.state !== "ok" || !file.haveRelPath) continue;
		const path = expectedPath(root, file);
		if (track.path !== path) out.push({ link, track, path });
	}
	return out;
}

function resolvedLocal(
	desired: DesiredPlaylist,
	ids: ReadonlySet<string>,
): string | null {
	if (desired.rbId && ids.has(desired.rbId)) return desired.rbId;
	const ref = desired.change.deviceRef;
	return ref && ids.has(ref) ? ref : null;
}

// Does any desired playlist differ from what the install holds (including membership of
// tracks that arrived since)?
export function playlistDrift(
	ctx: Context,
	rbp: RbPlaylists,
	contentByTrack: ReadonlyMap<string, string>,
): boolean {
	const ids = new Set(rbp.nodes.map((n) => n.id));
	const byId = new Map(rbp.nodes.map((n) => [n.id, n]));
	for (const d of ctx.state.playlists()) {
		const local = resolvedLocal(d, ids);
		if (!local) return true;
		const node = byId.get(local);
		if (node?.name !== d.change.name) return true;
		if (d.change.type === "playlist") {
			const want = d.change.tracks
				.map((t) => contentByTrack.get(t))
				.filter((c): c is string => c !== undefined);
			if (!sameList(want, rbp.tracks.get(local) ?? [])) return true;
		}
	}
	return false;
}

export function deferredReady(ctx: Context): AddChange[] {
	return ctx.state.deferred().filter((c) => {
		const f = ctx.state.file(c.trackId);
		return f?.state === "ok" && f.haveRelPath;
	});
}

// ---- the write ------------------------------------------------------------------------------------

export interface ApplyResult {
	applied: number;
	deferred: AddChange[];
	createdLinks: LinkRow[];
	removedTrackIds: string[];
	playlistLinks: { rbPlaylistId: string; playlistId: string }[];
	relinked: {
		contentId: string;
		path: string;
		analysisDataPath: string | null;
	}[];
	skipped: string[];
	// Deferred adds that are now in the collection (dropped from the table after commit).
	settled: string[];
}

function applyInTransaction(
	ctx: Context,
	tx: WriteTx,
	db: import("@trackvault/core/rekordbox").MasterDb,
	plan: Plan,
): ApplyResult {
	const { state, config } = ctx;
	const root = config.localRoot as string;
	const out: ApplyResult = {
		applied: 0,
		deferred: [],
		createdLinks: [],
		removedTrackIds: [],
		playlistLinks: [],
		relinked: [],
		skipped: [],
		settled: [],
	};
	const collection = readCollection(db);
	const byId = new Map(collection.map((t) => [t.id, t]));
	const rbp = readPlaylists(db);
	const contentByTrack = new Map(
		state.links().map((l) => [l.trackId, l.contentId]),
	);

	// 1. removals from the collection
	for (const trackId of plan.removes) {
		const contentId = contentByTrack.get(trackId);
		out.settled.push(trackId);
		if (!contentId) continue;
		tx.deleteContent(contentId);
		contentByTrack.delete(trackId);
		out.removedTrackIds.push(trackId);
		out.applied++;
	}

	// 2. new tracks (and updates of tracks already linked)
	const cuesDone = new Set<string>();
	for (const [trackId, add] of plan.adds) {
		let contentId = contentByTrack.get(trackId);
		const file = state.file(trackId);
		const lp =
			file?.state === "ok" && file.haveRelPath
				? localPath(root, file.haveRelPath)
				: null;
		const fieldInput = fieldInputOf(add.fields);
		if (contentId) {
			tx.updateContent(contentId, fieldInput);
		} else if (lp && existsSync(lp)) {
			const r = tx.upsertContent(lp, fieldInput);
			contentId = r.id;
			contentByTrack.set(trackId, contentId);
			out.createdLinks.push({
				contentId,
				trackId,
				via: "path",
				path: toRekordboxPath(lp),
				managed: 1,
			});
		} else {
			out.deferred.push(add);
			continue;
		}
		const tags = myTagsOf(add.fields);
		if (tags) tx.setMyTags(contentId, tags);
		const cues = plan.cues.get(trackId);
		if (cues) {
			tx.setCues(contentId, cues.map(cueInputOf));
			cuesDone.add(trackId);
		}
		out.settled.push(trackId);
		out.applied++;
	}

	// 3. field updates and cues of tracks already in the collection
	for (const [trackId, fields] of plan.updates) {
		const contentId = contentByTrack.get(trackId);
		if (!contentId) {
			out.skipped.push(`update for unknown track ${trackId}`);
			continue;
		}
		tx.updateContent(contentId, fieldInputOf(fields));
		const tags = myTagsOf(fields);
		if (tags) tx.setMyTags(contentId, tags);
		out.applied++;
	}
	for (const [trackId, cues] of plan.cues) {
		if (cuesDone.has(trackId) || plan.adds.has(trackId)) continue;
		const contentId = contentByTrack.get(trackId);
		if (!contentId) {
			out.skipped.push(`cues for unknown track ${trackId}`);
			continue;
		}
		tx.setCues(contentId, cues.map(cueInputOf));
		out.applied++;
	}

	// 4. relinks: the replica moved a file the install points at
	for (const { link, track, path } of pendingRelinks(ctx, collection)) {
		if (!byId.has(link.contentId)) continue;
		tx.relinkContent(link.contentId, path);
		out.relinked.push({
			contentId: link.contentId,
			path,
			analysisDataPath: track.analysisDataPath,
		});
		out.applied++;
	}

	// 5. playlists
	syncPlaylists(ctx, tx, rbp, contentByTrack, plan, out);
	return out;
}

function syncPlaylists(
	ctx: Context,
	tx: WriteTx,
	rbp: RbPlaylists,
	contentByTrack: ReadonlyMap<string, string>,
	plan: Plan,
	out: ApplyResult,
): void {
	const { state, log } = ctx;
	const known = new Map(rbp.nodes.map((n) => [n.id, n]));
	const ids = new Set(known.keys());
	const deleted = new Set<string>();

	const descendants = (id: string): string[] => {
		const kids = rbp.nodes.filter((n) => n.parentId === id).map((n) => n.id);
		return kids.flatMap((k) => [k, ...descendants(k)]);
	};

	const desired = new Map(state.playlists().map((p) => [p.hubId, p]));
	for (const r of plan.playlistRemoves) {
		const old = desired.get(r.hubId);
		const local = r.deviceRef ?? old?.rbId ?? null;
		state.dropPlaylist(r.hubId);
		desired.delete(r.hubId);
		if (local && ids.has(local) && !deleted.has(local)) {
			tx.deletePlaylist(local);
			deleted.add(local);
			for (const d of descendants(local)) deleted.add(d);
			out.applied++;
		}
	}

	const localOf = new Map<string, string>();
	for (const d of desired.values()) {
		const local = resolvedLocal(d, ids);
		if (local && !deleted.has(local)) localOf.set(d.hubId, local);
	}

	// Parents before children.
	let queue = [...desired.values()];
	while (queue.length > 0) {
		const later: DesiredPlaylist[] = [];
		let progress = false;
		for (const d of queue) {
			const parentHub = d.change.parentId;
			const parentKnown =
				parentHub === null || localOf.has(parentHub) || !desired.has(parentHub);
			if (!parentKnown) {
				later.push(d);
				continue;
			}
			progress = true;
			if (parentHub !== null && !localOf.has(parentHub))
				log.warn(
					`playlist ${d.change.name}: parent folder unknown; placed at the top level`,
				);
			const parentLocal =
				parentHub === null ? null : (localOf.get(parentHub) ?? null);
			let local = localOf.get(d.hubId) ?? null;
			if (local) {
				const node = known.get(local);
				if (node && node.name !== d.change.name) {
					tx.renamePlaylist(local, d.change.name);
					out.applied++;
				}
				if (node && node.parentId !== parentLocal) {
					tx.movePlaylist(local, parentLocal, d.change.position);
					out.applied++;
				}
			} else {
				local = tx.createPlaylist({
					name: d.change.name,
					kind: d.change.type,
					parentId: parentLocal,
					seq: d.change.position,
				});
				localOf.set(d.hubId, local);
				out.playlistLinks.push({ rbPlaylistId: local, playlistId: d.hubId });
				out.applied++;
			}
			if (d.change.type === "playlist") {
				const want = d.change.tracks
					.map((t) => contentByTrack.get(t))
					.filter((c): c is string => c !== undefined);
				if (!sameList(want, rbp.tracks.get(local) ?? [])) {
					tx.setPlaylistTracks(local, want);
					out.applied++;
				}
			}
			state.putPlaylist({ ...d, rbId: local });
		}
		if (!progress) {
			// A cycle in the folder graph: place the rest at the top level.
			for (const d of later)
				desired.set(d.hubId, { ...d, change: { ...d.change, parentId: null } });
			queue = [...later].map((d) => desired.get(d.hubId) as DesiredPlaylist);
		} else queue = later;
	}

	// Sibling order, per folder, as the hub numbers it.
	const byParent = new Map<
		string | null,
		{ local: string; position: number }[]
	>();
	for (const d of desired.values()) {
		const local = localOf.get(d.hubId);
		if (!local) continue;
		const parentHub = d.change.parentId;
		const parentLocal =
			parentHub === null ? null : (localOf.get(parentHub) ?? null);
		const list = byParent.get(parentLocal) ?? [];
		list.push({ local, position: d.change.position });
		byParent.set(parentLocal, list);
	}
	for (const [parent, list] of byParent) {
		if (list.length < 2) continue;
		try {
			tx.reorderPlaylists(
				parent,
				list.sort((a, b) => a.position - b.position).map((x) => x.local),
			);
		} catch (error) {
			log.warn(`playlist order not applied: ${errorMessage(error)}`);
		}
	}
}

export interface ExportRun {
	applied: number;
	deferred: number;
	skipped: string[];
	base: SnapshotRef;
	snapshot: RbSnapshot;
	ack: ExportAck["links"];
	relinkedAnlz: number;
}

// Opens the writer (backup, guards), applies the plan in one transaction, fixes ANLZ
// paths of relinked tracks, and returns the new base. Throws WriteRefused when a guard
// says no; nothing is written then.
export async function applyExport(
	ctx: Context,
	install: RekordboxInstall,
	plan: Plan,
): Promise<ExportRun> {
	const { state, config } = ctx;
	const options = install.optionsPath
		? await readRekordboxOptions(install.optionsPath)
		: null;
	const writer = await MasterWriter.open(install.dbPath, {
		allowedVersions: allowedVersions(ctx),
		agentOptions: options,
		backupKeep: config.rekordbox.backupKeep,
	});
	try {
		const { result } = await writer.transaction((tx) =>
			applyInTransaction(ctx, tx, writer.db, plan),
		);
		if (writer.backup)
			ctx.log.info(`rekordbox: master.db backed up to ${writer.backup.path}`);

		let relinkedAnlz = 0;
		for (const r of result.relinked) {
			if (!r.analysisDataPath) continue;
			try {
				relinkedAnlz += (
					await relinkAnlzPath(install.shareDir, r.analysisDataPath, r.path)
				).length;
			} catch (error) {
				ctx.log.warn(`anlz relink for ${r.contentId}: ${errorMessage(error)}`);
			}
		}

		// Local state follows the committed write.
		state.tx(() => {
			for (const l of result.createdLinks) state.putLink(l);
			for (const trackId of result.removedTrackIds) {
				const link = state.linkByTrack(trackId);
				if (link) state.dropLink(link.contentId);
			}
			for (const r of result.relinked) {
				const link = state.links().find((l) => l.contentId === r.contentId);
				if (link) state.putLink({ ...link, path: r.path });
			}
			for (const trackId of result.settled) state.dropDeferred(trackId);
			for (const d of result.deferred) state.putDeferred(d);
			for (const p of result.playlistLinks) {
				const d = state.playlists().find((x) => x.hubId === p.playlistId);
				if (d) state.putPlaylist({ ...d, rbId: p.rbPlaylistId });
			}
		});

		// The new base: what master.db holds now, so our own write is not re-imported.
		const snapshot = snapshotOf(
			readCollection(writer.db),
			readPlaylists(writer.db),
			readCues(writer.db),
		);
		const prev = state.baseRef();
		const base: SnapshotRef = {
			id: prev?.id ?? randomUUID(),
			version: (prev?.version ?? 0) + 1,
		};
		state.saveBase(base, snapshot);

		const tracks: ImportLink[] = result.createdLinks.map((l) => ({
			contentId: l.contentId,
			trackId: l.trackId,
			via: l.via,
		}));
		return {
			applied: result.applied,
			deferred: result.deferred.length,
			skipped: result.skipped,
			base,
			snapshot,
			ack: {
				tracks,
				playlists: result.playlistLinks,
				removedTracks: result.removedTrackIds,
			},
			relinkedAnlz,
		};
	} finally {
		writer.close();
	}
}

export type { RekordboxStatus };
export { stageBlobs, WriteRefused };
