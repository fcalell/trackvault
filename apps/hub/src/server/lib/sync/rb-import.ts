import { createHash } from "node:crypto";
import type {
	ConflictNotice,
	ImportBatch,
	ImportPlaylist,
	ImportResult,
} from "@trackvault/core/sync";
import { type ChangeOrigin, changes } from "../../../schema/index.ts";
import tagFlush from "../../jobs/tag-flush.ts";
import { enqueue } from "../../services/jobs.ts";
import { bumpVersion, notifyChanged } from "../../services/library.ts";
import {
	applyPatches,
	type BatchInfo,
	CHUNK,
	ensureBatch,
} from "../changes.ts";
import { db } from "../db.ts";
import {
	addMembers,
	createNode,
	getPlaylist,
	moveNode,
	removeMembers,
	removeNode,
	renameNode,
	reorderMembers,
} from "../playlists.ts";
import { inserter, statement } from "../raw.ts";
import type { TagValues } from "../track-fields.ts";
import { setTagNames } from "../track-tags.ts";
import { SyncError } from "./http.ts";
import {
	asWire,
	hubValue,
	type Norm,
	norm,
	same,
	signatureOf,
	TAG_FIELDS,
	tagNamesOf,
	tracksById,
} from "./rb-fields.ts";
import { notifyPlaylists, sendToDevice } from "./wake.ts";

// The merge of a Rekordbox import into the hub (plan section 6): what the agent diffed
// against its base arrives as field changes, playlist changes, cues and plays, and is
// merged three ways. Field: changed on one side takes that side; on both, the later
// timestamp wins and the conflict is recorded. Playlist membership: merged as sets; both
// sides reordered, the later order wins and the other is recorded. Every change is a
// `changes` row under `rekordbox:<device>` in the import's batch, so History shows it and
// Undo reverses it.

const insertChange = inserter(changes);

interface Context {
	deviceId: string;
	deviceName: string;
	origin: ChangeOrigin;
	info: BatchInfo;
	batch: ImportBatch;
	now: Date;
	// When the device's last import was merged: a hub reorder since then is "recent".
	previousImportAt: number;
	conflicts: ConflictNotice[];
	counts: Record<string, number>;
	tagsChanged: boolean;
}

const sha = (value: unknown): string =>
	createHash("sha1").update(JSON.stringify(value)).digest("hex");

function record(
	cx: Context,
	entity: "track" | "playlist",
	refId: string,
	field: string | null,
	base: unknown,
	device: unknown,
	hub: unknown,
	winner: "device" | "hub",
	wire: {
		device: ConflictNotice["deviceValue"];
		hub: ConflictNotice["hubValue"];
	},
): void {
	const id = Number(
		statement(
			`INSERT INTO conflicts (device_id, entity, ref_id, field, base_value, device_value, hub_value, winner, state, pushed, batch_id, at)
			 VALUES (@d, @entity, @ref, @field, @base, @device, @hub, @winner, 'open', @pushed, @batch, @now)`,
		).run({
			d: cx.deviceId,
			entity,
			ref: refId,
			field,
			base: base === undefined ? null : JSON.stringify(base),
			device: JSON.stringify(device ?? null),
			hub: JSON.stringify(hub ?? null),
			winner,
			pushed: winner === "hub" ? 0 : 1,
			batch: cx.batch.batchId,
			now: cx.now.getTime(),
		}).lastInsertRowid,
	);
	cx.conflicts.push({
		id: String(id),
		entity,
		refId,
		field,
		deviceValue: wire.device,
		hubValue: wire.hub,
		winner,
		at: cx.now.toISOString(),
	});
	cx.counts.conflicts = (cx.counts.conflicts ?? 0) + 1;
}

const lastChange = (
	entity: string,
	id: string,
	field: string,
): number | null => {
	const row = statement(
		"SELECT max(at) AS at FROM changes WHERE entity = @e AND entity_id = @id AND field = @f",
	).get({ e: entity, id, f: field }) as { at: number | null };
	return row.at;
};

// -- links --------------------------------------------------------------------

const upsertLink = (
	deviceId: string,
	kind: "track" | "playlist",
	rbId: string,
	refId: string,
	via: string | null,
) =>
	statement(
		`INSERT INTO rekordbox_links (device_id, kind, rb_id, ref_id, via, state)
		 VALUES (@d, @kind, @rb, @ref, @via, 'linked')
		 ON CONFLICT(device_id, kind, rb_id) DO UPDATE SET ref_id = @ref, via = @via, state = 'linked'`,
	).run({ d: deviceId, kind, rb: rbId, ref: refId, via });

const linkRef = (
	deviceId: string,
	kind: "track" | "playlist",
	rbId: string | null,
): string | undefined => {
	if (!rbId) return undefined;
	const row = statement(
		"SELECT ref_id AS ref FROM rekordbox_links WHERE device_id = @d AND kind = @kind AND rb_id = @rb AND via NOT LIKE 'parent:%'",
	).get({ d: deviceId, kind, rb: rbId }) as { ref: string } | undefined;
	return row?.ref;
};

// A link row can hold a pending parent (`via = parent:<rb id>`) for a playlist whose
// folder had not arrived: it still names the hub playlist.
const anyLinkRef = (deviceId: string, rbId: string): string | undefined => {
	const row = statement(
		"SELECT ref_id AS ref FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND rb_id = @rb",
	).get({ d: deviceId, rb: rbId }) as { ref: string } | undefined;
	return row?.ref;
};

// -- tracks -------------------------------------------------------------------

interface FieldWork {
	before: Norm | undefined;
	after: Norm;
	// Whether the agent had a base for this field (a change), or this is a first sight.
	based: boolean;
}

function mergeTracks(cx: Context): void {
	const { batch } = cx;
	const work = new Map<string, Map<string, FieldWork>>();
	const put = (trackId: string, field: string, w: FieldWork) => {
		const fields = work.get(trackId) ?? new Map<string, FieldWork>();
		fields.set(field, w);
		work.set(trackId, fields);
	};
	for (const added of batch.tracks.added)
		for (const [field, value] of Object.entries(added.fields))
			put(added.trackId, field, {
				before: undefined,
				after: norm(field, value),
				based: false,
			});
	for (const changed of batch.tracks.changed)
		for (const f of changed.fields)
			put(changed.trackId, f.field, {
				before: norm(f.field, f.before),
				after: norm(f.field, f.after),
				based: true,
			});
	if (work.size === 0) return;

	const ids = [...work.keys()];
	const rows = tracksById(ids);
	const tagNames = tagNamesOf(ids);
	const patches: Array<{ id: string; patch: TagValues }> = [];
	const colours: Array<{
		id: string;
		before: string | null;
		after: string | null;
	}> = [];
	const tagSets: Array<{ id: string; before: string[]; after: string[] }> = [];

	for (const [trackId, fields] of work) {
		const row = rows.get(trackId);
		if (!row) continue;
		const patch: TagValues = {};
		for (const [field, w] of fields) {
			const hub = hubValue(row, field, tagNames.get(trackId) ?? []);
			if (same(w.after, hub)) continue;
			if (field === "myTags") {
				// A set merges: what the device added joins, what it removed leaves.
				const base = new Set((w.before as string[] | undefined) ?? []);
				const dev = new Set(w.after as string[]);
				const next = new Set(hub as string[]);
				if (w.based) {
					for (const t of dev) if (!base.has(t)) next.add(t);
					for (const t of base) if (!dev.has(t)) next.delete(t);
				} else for (const t of dev) next.add(t);
				const after = [...next].sort((a, b) => a.localeCompare(b));
				if (!same(after, hub))
					tagSets.push({ id: trackId, before: hub as string[], after });
				continue;
			}
			const take = () => {
				cx.counts.fields = (cx.counts.fields ?? 0) + 1;
				if (field === "color")
					colours.push({
						id: trackId,
						before: row.colour,
						after: w.after as string | null,
					});
				else if (TAG_FIELDS.has(field)) {
					Object.assign(patch, { [field]: w.after });
					cx.tagsChanged = true;
				}
			};
			const hubEmpty = hub === null || (Array.isArray(hub) && hub.length === 0);
			if (w.based && same(w.before ?? null, hub)) {
				take(); // only the device changed it
			} else if (!w.based && hubEmpty) {
				take(); // the hub had nothing
			} else if (w.based) {
				// Both sides changed it: the later one wins.
				const hubAt =
					lastChange("track", trackId, field === "color" ? "colour" : field) ??
					row.updatedAt.getTime();
				const winner = hubAt > batch.takenAt ? "hub" : "device";
				if (winner === "device") take();
				record(
					cx,
					"track",
					trackId,
					field,
					w.before ?? null,
					w.after,
					hub,
					winner,
					{
						device: asWire(field, w.after),
						hub: asWire(field, hub),
					},
				);
			} else {
				// First sight and the hub already has a different value: the hub's stands.
				record(cx, "track", trackId, field, null, w.after, hub, "hub", {
					device: asWire(field, w.after),
					hub: asWire(field, hub),
				});
			}
		}
		if (Object.keys(patch).length > 0) patches.push({ id: trackId, patch });
	}

	if (patches.length > 0) applyPatches(patches, cx.info);

	if (colours.length + tagSets.length > 0) {
		let version = 0;
		const touched: string[] = [];
		db().transaction((tx) => {
			version = bumpVersion(tx);
			let logged = 0;
			for (const c of colours) {
				statement(
					"UPDATE tracks SET colour = @c, updated_at = @now, version = @v WHERE id = @id",
				).run({
					id: c.id,
					c: c.after,
					now: cx.now.getTime(),
					v: version,
				});
				insertChange({
					entity: "track",
					entityId: c.id,
					field: "colour",
					before: c.before,
					after: c.after,
					origin: cx.origin,
					batchId: cx.info.batchId,
					at: cx.now,
				});
				touched.push(c.id);
				logged++;
			}
			for (const t of tagSets) {
				setTagNames(tx, t.id, t.after, cx.now);
				insertChange({
					entity: "track",
					entityId: t.id,
					field: "tags",
					before: t.before,
					after: t.after,
					origin: cx.origin,
					batchId: cx.info.batchId,
					at: cx.now,
				});
				touched.push(t.id);
				logged++;
				cx.counts.fields = (cx.counts.fields ?? 0) + 1;
			}
			ensureBatch(tx, cx.info, logged, cx.now);
		});
		notifyChanged(touched, version);
	}
}

function mergeLinks(cx: Context): void {
	const { batch, deviceId } = cx;
	const exists = statement("SELECT 1 AS x FROM tracks WHERE id = @id");
	db().transaction(() => {
		for (const link of batch.links)
			if (exists.get({ id: link.trackId }))
				upsertLink(deviceId, "track", link.contentId, link.trackId, link.via);
		for (const added of batch.tracks.added)
			if (exists.get({ id: added.trackId })) {
				const known = linkRef(deviceId, "track", added.contentId);
				if (known !== added.trackId)
					upsertLink(
						deviceId,
						"track",
						added.contentId,
						added.trackId,
						"import",
					);
				else
					statement(
						"UPDATE rekordbox_links SET state = 'linked' WHERE device_id = @d AND kind = 'track' AND rb_id = @rb",
					).run({
						d: deviceId,
						rb: added.contentId,
					});
			}
		// Gone from this install only: the link stays, so the export does not add it back.
		for (const removed of batch.tracks.removed) {
			statement(
				`INSERT INTO rekordbox_links (device_id, kind, rb_id, ref_id, via, state)
				 VALUES (@d, 'track', @rb, @ref, 'import', 'removed')
				 ON CONFLICT(device_id, kind, rb_id) DO UPDATE SET state = 'removed'`,
			).run({ d: deviceId, rb: removed.contentId, ref: removed.trackId });
		}
	});
	cx.counts.links = batch.links.length;
}

// -- cues and plays -------------------------------------------------------------

function mergeCues(cx: Context): void {
	if (cx.batch.cues.length === 0) return;
	const current = statement(
		"SELECT signature AS s, taken_at AS t FROM cue_sets WHERE track_id = @id",
	);
	const exists = statement("SELECT 1 AS x FROM tracks WHERE id = @id");
	const clear = statement("DELETE FROM cues WHERE track_id = @id");
	const put = statement(
		`INSERT INTO cues (track_id, idx, kind, start_ms, end_ms, color, color_table_index, comment, active_loop, beat_loop_size)
		 VALUES (@id, @idx, @kind, @start, @end, @color, @cti, @comment, @active, @size)`,
	);
	const set = statement(
		`INSERT INTO cue_sets (track_id, device_id, taken_at, at, signature) VALUES (@id, @d, @taken, @now, @sig)
		 ON CONFLICT(track_id) DO UPDATE SET device_id = @d, taken_at = @taken, at = @now, signature = @sig`,
	);
	db().transaction(() => {
		let logged = 0;
		for (const entry of cx.batch.cues) {
			if (!exists.get({ id: entry.trackId })) continue;
			const signature = entry.cues.map(signatureOf).sort();
			const was = current.get({ id: entry.trackId }) as
				| { s: string; t: number }
				| undefined;
			const before = was ? (JSON.parse(was.s) as string[]) : [];
			if (JSON.stringify(before) === JSON.stringify(signature)) continue;
			// Latest wins per track: an import older than what the hub holds is ignored.
			if (was && was.t > cx.batch.takenAt) continue;
			clear.run({ id: entry.trackId });
			entry.cues.forEach((cue, idx) => {
				put.run({
					id: entry.trackId,
					idx,
					kind: cue.kind,
					start: cue.startMs,
					end: cue.endMs,
					color: cue.color,
					cti: cue.colorTableIndex,
					comment: cue.comment,
					active: cue.activeLoop ? 1 : 0,
					size: cue.beatLoopSize,
				});
			});
			set.run({
				id: entry.trackId,
				d: cx.deviceId,
				taken: cx.batch.takenAt,
				now: cx.now.getTime(),
				sig: JSON.stringify(signature),
			});
			insertChange({
				entity: "track",
				entityId: entry.trackId,
				field: "cues",
				before,
				after: signature,
				origin: cx.origin,
				batchId: cx.info.batchId,
				at: cx.now,
			});
			logged++;
		}
		if (logged > 0) {
			cx.counts.cues = logged;
			db().transaction((tx) => ensureBatch(tx, cx.info, logged, cx.now));
		}
	});
}

function mergePlays(cx: Context): void {
	if (cx.batch.plays.length === 0) return;
	const insert = statement(
		"INSERT OR IGNORE INTO plays (track_id, device_id, played_at) VALUES (@t, @d, @at)",
	);
	const touched = new Set<string>();
	db().transaction(() => {
		for (const play of cx.batch.plays) {
			if (
				insert.run({ t: play.trackId, d: cx.deviceId, at: play.playedAt })
					.changes > 0
			)
				touched.add(play.trackId);
		}
		const refresh = statement(
			`UPDATE tracks SET
				play_count = (SELECT count(*) FROM plays WHERE track_id = tracks.id),
				last_played_at = (SELECT max(played_at) FROM plays WHERE track_id = tracks.id)
			 WHERE id = @id`,
		);
		for (const id of touched) refresh.run({ id });
	});
	cx.counts.plays = touched.size;
}

// -- playlists -------------------------------------------------------------------

export function playlistMembers(id: string): string[] {
	return (
		statement(
			"SELECT track_id AS t FROM playlist_tracks WHERE playlist_id = @id ORDER BY position, track_id",
		).all({ id }) as { t: string }[]
	).map((row) => row.t);
}

// A playlist's content as a device sees it: name, folder and ordered tracks, with its
// place among its siblings.
export function playlistContent(
	id: string,
	members?: readonly string[],
): string | null {
	const row = getPlaylist(id);
	if (!row) return null;
	const rank = (
		statement(
			"SELECT count(*) AS n FROM playlists WHERE parent_id IS @p AND (position < @pos OR (position = @pos AND id < @id))",
		).get({ p: row.parentId, pos: row.position, id }) as { n: number }
	).n;
	return sha({
		name: row.name,
		parent: row.parentId,
		kind: row.kind,
		rank,
		tracks: members ?? (row.kind === "manual" ? playlistMembers(id) : []),
	});
}

const setStamp = (deviceId: string, rbId: string, stamp: string | null) =>
	statement(
		"UPDATE rekordbox_links SET stamp = @s WHERE device_id = @d AND kind = 'playlist' AND rb_id = @rb",
	).run({
		d: deviceId,
		rb: rbId,
		s: stamp,
	});

function applyDeviceOrder(
	cx: Context,
	playlistId: string,
	order: readonly string[],
): void {
	db().transaction((tx) =>
		reorderMembers(tx, cx.info, playlistId, order, cx.now),
	);
}

function mergePlaylist(cx: Context, p: ImportPlaylist): boolean {
	const { deviceId } = cx;
	if (p.kind === "smart") {
		cx.counts.smartSkipped = (cx.counts.smartSkipped ?? 0) + 1;
		return true;
	}
	let hid = anyLinkRef(deviceId, p.playlistId);
	if (hid && !getPlaylist(hid)) {
		statement(
			"DELETE FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND rb_id = @rb",
		).run({
			d: deviceId,
			rb: p.playlistId,
		});
		hid = undefined;
	}

	if (p.change === "removed") {
		if (hid) {
			db().transaction((tx) => removeNode(tx, cx.info, hid as string, cx.now));
			statement(
				"DELETE FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND ref_id = @ref",
			).run({
				d: deviceId,
				ref: hid,
			});
			cx.counts.playlistsRemoved = (cx.counts.playlistsRemoved ?? 0) + 1;
		}
		return true;
	}

	// A playlist the hub has not seen from this device: it is made.
	if (!hid) {
		const parentRb = p.parent?.after ?? null;
		const parentHub = parentRb
			? linkRef(deviceId, "playlist", parentRb)
			: undefined;
		// Wait for a parent folder that arrives in this same import.
		if (
			parentRb &&
			!parentHub &&
			cx.batch.playlists.some((o) => o.playlistId === parentRb && o !== p)
		) {
			if (!anyLinkRef(deviceId, parentRb)) return false;
		}
		const kind = p.kind === "folder" ? "folder" : "manual";
		const node = db().transaction((tx) =>
			createNode(
				tx,
				cx.info,
				{
					parentId: parentHub ?? null,
					kind,
					name: p.name?.after || "Playlist",
				},
				cx.now,
			),
		);
		hid = node.id;
		upsertLink(
			deviceId,
			"playlist",
			p.playlistId,
			hid,
			parentRb && !parentHub ? `parent:${parentRb}` : "import",
		);
		// Children that were waiting for this folder.
		for (const waiting of statement(
			"SELECT rb_id AS rb, ref_id AS ref FROM rekordbox_links WHERE device_id = @d AND kind = 'playlist' AND via = @via",
		).all({ d: deviceId, via: `parent:${p.playlistId}` }) as {
			rb: string;
			ref: string;
		}[]) {
			db().transaction((tx) =>
				moveNode(tx, cx.info, waiting.ref, hid as string, null, null, cx.now),
			);
			statement(
				"UPDATE rekordbox_links SET via = 'import' WHERE device_id = @d AND kind = 'playlist' AND rb_id = @rb",
			).run({
				d: deviceId,
				rb: waiting.rb,
			});
		}
		if (kind === "manual" && p.order.length > 0)
			db().transaction((tx) =>
				addMembers(tx, cx.info, hid as string, p.order, cx.now),
			);
		cx.counts.playlistsAdded = (cx.counts.playlistsAdded ?? 0) + 1;
		setStamp(deviceId, p.playlistId, playlistContent(hid));
		return true;
	}

	const row = getPlaylist(hid);
	if (!row) return true;

	// name
	if (p.name && p.name.after !== row.name) {
		if (p.name.before === row.name) {
			db().transaction((tx) =>
				renameNode(
					tx,
					cx.info,
					hid as string,
					p.name?.after ?? row.name,
					cx.now,
				),
			);
		} else {
			const hubAt = lastChange("playlist", hid, "name") ?? 0;
			const winner = hubAt > cx.batch.takenAt ? "hub" : "device";
			if (winner === "device")
				db().transaction((tx) =>
					renameNode(
						tx,
						cx.info,
						hid as string,
						p.name?.after ?? row.name,
						cx.now,
					),
				);
			record(
				cx,
				"playlist",
				hid,
				"name",
				p.name.before,
				p.name.after,
				row.name,
				winner,
				{
					device: p.name.after,
					hub: row.name,
				},
			);
		}
	}

	// folder
	if (p.parent && p.parent.after !== p.parent.before) {
		const target = p.parent.after
			? linkRef(deviceId, "playlist", p.parent.after)
			: null;
		const base = p.parent.before
			? linkRef(deviceId, "playlist", p.parent.before)
			: null;
		if (
			target !== undefined &&
			(p.parent.after === null || target) &&
			row.parentId !== (target ?? null)
		) {
			if (row.parentId === (base ?? null)) {
				db().transaction((tx) =>
					moveNode(
						tx,
						cx.info,
						hid as string,
						target ?? null,
						null,
						null,
						cx.now,
					),
				);
			} else {
				record(
					cx,
					"playlist",
					hid,
					"folder",
					base ?? null,
					target ?? null,
					row.parentId,
					"hub",
					{
						device: target ?? null,
						hub: row.parentId,
					},
				);
			}
		}
	}

	// tracks: sets merge, an order is the later side's
	if (row.kind === "manual" && p.kind === "playlist") {
		const have = new Set(playlistMembers(hid));
		const adds = p.addedTracks.filter((t) => !have.has(t));
		const drops = p.removedTracks.filter((t) => have.has(t));
		if (adds.length > 0)
			db().transaction((tx) =>
				addMembers(tx, cx.info, hid as string, adds, cx.now),
			);
		if (drops.length > 0)
			db().transaction((tx) =>
				removeMembers(tx, cx.info, hid as string, drops, cx.now),
			);
		cx.counts.members = (cx.counts.members ?? 0) + adds.length + drops.length;
		if (p.reordered) {
			const since = statement(
				`SELECT max(at) AS at FROM changes WHERE entity = 'playlist' AND entity_id = @id AND field = 'member'
				 AND before IS NOT NULL AND after IS NOT NULL AND at > @since AND origin != @origin`,
			).get({ id: hid, since: cx.previousImportAt, origin: cx.origin }) as {
				at: number | null;
			};
			const hubReordered = since.at !== null;
			if (since.at !== null && since.at > cx.batch.takenAt) {
				const mine = playlistMembers(hid);
				record(cx, "playlist", hid, "order", null, p.order, mine, "hub", {
					device: `${p.order.length} tracks`,
					hub: `${mine.length} tracks`,
				});
			} else {
				const hubSide = hubReordered ? playlistMembers(hid) : null;
				applyDeviceOrder(cx, hid, p.order);
				if (hubSide)
					record(
						cx,
						"playlist",
						hid,
						"order",
						null,
						p.order,
						hubSide,
						"device",
						{
							device: `${p.order.length} tracks`,
							hub: `${hubSide.length} tracks`,
						},
					);
			}
		}
		cx.counts.playlistsChanged = (cx.counts.playlistsChanged ?? 0) + 1;
	}

	// Is the device now what the hub holds? Then there is nothing to send it back.
	const after = getPlaylist(hid);
	if (after) {
		const hubOrder = after.kind === "manual" ? playlistMembers(hid) : [];
		const deviceHas = new Set(p.order);
		const equal =
			after.kind !== "manual" ||
			(hubOrder.length === p.order.length &&
				hubOrder.every((t, i) => t === p.order[i])) ||
			(p.kind !== "playlist" && deviceHas.size === 0);
		const nameEqual = after.name === (p.name?.after ?? after.name);
		if (equal && nameEqual)
			setStamp(deviceId, p.playlistId, playlistContent(hid));
	}
	return true;
}

function mergePlaylists(cx: Context): void {
	let queue = [...cx.batch.playlists];
	for (let pass = 0; pass < 4 && queue.length > 0; pass++) {
		const later: ImportPlaylist[] = [];
		for (const p of queue) if (!mergePlaylist(cx, p)) later.push(p);
		if (later.length === queue.length) {
			// A parent that never came: these are made at the top level.
			for (const p of later) mergePlaylist(cx, { ...p, parent: undefined });
			break;
		}
		queue = later;
	}
}

// -- the entry --------------------------------------------------------------------

export function importPart(deviceId: string, batch: ImportBatch): ImportResult {
	const done = statement(
		"SELECT result FROM import_parts WHERE batch_id = @b AND part = @p",
	).get({
		b: batch.batchId,
		p: batch.part,
	}) as { result: string } | undefined;
	if (done) return JSON.parse(done.result) as ImportResult;

	const device = statement(
		"SELECT name, base_id AS baseId, base_version AS baseVersion, activity FROM devices WHERE id = @id",
	).get({
		id: deviceId,
	}) as
		| {
				name: string;
				baseId: string | null;
				baseVersion: number;
				activity: string | null;
		  }
		| undefined;
	if (!device) throw new SyncError("bad-request", "Say hello before importing");
	if (
		batch.base.version !== 0 &&
		(batch.base.id !== device.baseId ||
			batch.base.version !== device.baseVersion)
	)
		throw new SyncError(
			"base-mismatch",
			"The base is not the hub's record of this device",
			{
				id: device.baseId,
				version: device.baseVersion,
			},
		);

	const now = new Date();
	const origin: ChangeOrigin = `rekordbox:${deviceId}`;
	const activity = device.activity
		? (JSON.parse(device.activity) as { import?: { at?: number } })
		: {};
	const cx: Context = {
		deviceId,
		deviceName: device.name,
		origin,
		info: {
			batchId: batch.batchId,
			origin,
			label: `Rekordbox import: ${device.name}`,
		},
		batch,
		now,
		previousImportAt: activity.import?.at ?? 0,
		conflicts: [],
		counts: {},
		tagsChanged: false,
	};

	mergeLinks(cx);
	mergeTracks(cx);
	mergeCues(cx);
	mergePlays(cx);
	mergePlaylists(cx);

	// ANLZ files the hub lacks.
	const want = new Set<string>();
	const known = statement("SELECT 1 AS x FROM analysis_blobs WHERE hash = @h");
	for (const ref of batch.anlz)
		if (!known.get({ h: ref.hash })) want.add(ref.hash);

	const last = batch.part >= batch.parts - 1;
	if (last) {
		statement(
			"UPDATE devices SET base_id = @id, base_version = @v WHERE id = @d",
		).run({
			d: deviceId,
			id: batch.next.id,
			v: batch.next.version,
		});
		const stored = statement("SELECT activity FROM devices WHERE id = @id").get(
			{ id: deviceId },
		) as { activity: string | null };
		const merged = stored.activity
			? (JSON.parse(stored.activity) as Record<string, unknown>)
			: {};
		merged.import = {
			at: Date.now(),
			// Where the change log stood when this import was merged: a device that has
			// never exported starts its stream here, so what the hub changed since is sent.
			seq: (
				statement("SELECT coalesce(max(seq), 0) AS m FROM changes").get() as {
					m: number;
				}
			).m,
			batchId: batch.batchId,
			unmatched: batch.unmatchedCount,
			tracks: batch.tracks.added.length + batch.tracks.changed.length,
			dbVersion: batch.rekordbox.dbVersion,
			appVersion: batch.rekordbox.appVersion,
			...cx.counts,
		};
		statement("UPDATE devices SET activity = @a WHERE id = @id").run({
			id: deviceId,
			a: JSON.stringify(merged),
		});
	}
	if (cx.tagsChanged) enqueue(tagFlush, { batchId: batch.batchId });
	if (
		cx.counts.playlistsAdded ||
		cx.counts.playlistsChanged ||
		cx.counts.playlistsRemoved ||
		cx.counts.members
	)
		notifyPlaylists();

	const result: ImportResult = {
		batchId: batch.batchId,
		part: batch.part,
		committed: last,
		base: last ? batch.next : batch.base,
		wantBlobs: [...want],
		conflicts: cx.conflicts,
	};
	statement(
		"INSERT OR REPLACE INTO import_parts (batch_id, part, device_id, parts, result, at) VALUES (@b, @p, @d, @n, @r, @now)",
	).run({
		b: batch.batchId,
		p: batch.part,
		d: deviceId,
		n: batch.parts,
		r: JSON.stringify(result),
		now: Date.now(),
	});
	// Old part records go once a week of imports has passed.
	if (last)
		statement("DELETE FROM import_parts WHERE at < @before").run({
			before: Date.now() - 14 * 86_400_000,
		});
	for (const notice of cx.conflicts)
		sendToDevice(deviceId, "conflict", {
			id: notice.id,
			entity: notice.entity,
			refId: notice.refId,
			field: notice.field,
			winner: notice.winner,
			at: notice.at,
		});
	return result;
}

export { CHUNK };
