import { randomUUID } from "node:crypto";
import { changes } from "../../schema/index.ts";
import tagFlush from "../jobs/tag-flush.ts";
import { enqueue } from "../services/jobs.ts";
import { bumpVersion, notifyChanged } from "../services/library.ts";
import { applyPatches, type BatchInfo, ensureBatch } from "./changes.ts";
import { db } from "./db.ts";
import {
	getPlaylist,
	moveNode,
	renameNode,
	reorderMembers,
} from "./playlists.ts";
import { inserter, statement } from "./raw.ts";
import {
	hubValue,
	norm,
	same,
	TAG_FIELDS,
	tagNamesOf,
	tracksById,
} from "./sync/rb-fields.ts";
import { wakeDevices } from "./sync/wake.ts";
import type { TagValues } from "./track-fields.ts";
import { setTagNames } from "./track-tags.ts";

const insertChange = inserter(changes);

export interface ConflictRow {
	id: number;
	device_id: string;
	entity: "track" | "playlist";
	ref_id: string;
	field: string | null;
	device_value: string;
	hub_value: string;
	winner: "device" | "hub";
	state: "open" | "resolved";
}

// Settles conflicts by taking one side. The chosen value is written to the hub as an
// owner's change (origin `ui`, one batch, undoable), which the other devices and this one
// read from the change log. A conflict that already holds the chosen value is only closed.
export function resolveConflicts(
	ids: readonly number[],
	take: "hub" | "device",
): { resolved: number; changed: number } {
	if (ids.length === 0) return { resolved: 0, changed: 0 };
	const rows = statement(
		`SELECT id, device_id, entity, ref_id, field, device_value, hub_value, winner, state FROM conflicts
		 WHERE id IN (SELECT value FROM json_each(@ids)) AND state = 'open' ORDER BY id`,
	).all({ ids: JSON.stringify(ids) }) as ConflictRow[];
	const info: BatchInfo = {
		batchId: randomUUID(),
		origin: "ui",
		label:
			take === "hub"
				? "Resolve conflicts: keep TrackVault"
				: "Resolve conflicts: take Rekordbox",
	};
	const now = new Date();
	let changed = 0;
	let tagsChanged = false;

	const trackRows = tracksById([
		...new Set(rows.filter((r) => r.entity === "track").map((r) => r.ref_id)),
	]);
	const names = tagNamesOf([...trackRows.keys()]);
	const patches = new Map<string, TagValues>();
	const colours: Array<{
		id: string;
		before: string | null;
		after: string | null;
	}> = [];
	const tagSets: Array<{ id: string; before: string[]; after: string[] }> = [];

	for (const row of rows) {
		const value = JSON.parse(
			take === "hub" ? row.hub_value : row.device_value,
		) as unknown;
		if (row.entity === "track" && row.field) {
			const track = trackRows.get(row.ref_id);
			if (!track) continue;
			const wanted = norm(row.field, value);
			if (same(wanted, hubValue(track, row.field, names.get(row.ref_id) ?? [])))
				continue;
			if (row.field === "color")
				colours.push({
					id: track.id,
					before: track.colour,
					after: wanted as string | null,
				});
			else if (row.field === "myTags")
				tagSets.push({
					id: track.id,
					before: names.get(track.id) ?? [],
					after: wanted as string[],
				});
			else if (TAG_FIELDS.has(row.field)) {
				patches.set(track.id, {
					...(patches.get(track.id) ?? {}),
					[row.field]: wanted as string | number | null,
				});
				tagsChanged = true;
			}
			changed++;
		} else if (row.entity === "playlist") {
			const playlist = getPlaylist(row.ref_id);
			if (!playlist) continue;
			db().transaction((tx) => {
				if (row.field === "name" && typeof value === "string")
					renameNode(tx, info, playlist.id, value, now);
				else if (row.field === "folder")
					moveNode(
						tx,
						info,
						playlist.id,
						typeof value === "string" ? value : null,
						null,
						null,
						now,
					);
				else if (row.field === "order" && Array.isArray(value))
					reorderMembers(tx, info, playlist.id, value as string[], now);
			});
			changed++;
		}
	}

	if (patches.size > 0)
		applyPatches(
			[...patches].map(([id, patch]) => ({ id, patch })),
			info,
		);
	if (colours.length + tagSets.length > 0) {
		let version = 0;
		db().transaction((tx) => {
			version = bumpVersion(tx);
			let logged = 0;
			for (const c of colours) {
				statement(
					"UPDATE tracks SET colour = @c, updated_at = @now, version = @v WHERE id = @id",
				).run({
					id: c.id,
					c: c.after,
					now: now.getTime(),
					v: version,
				});
				insertChange({
					entity: "track",
					entityId: c.id,
					field: "colour",
					before: c.before,
					after: c.after,
					origin: "ui",
					batchId: info.batchId,
					at: now,
				});
				logged++;
			}
			for (const t of tagSets) {
				setTagNames(tx, t.id, t.after, now);
				insertChange({
					entity: "track",
					entityId: t.id,
					field: "tags",
					before: t.before,
					after: t.after,
					origin: "ui",
					batchId: info.batchId,
					at: now,
				});
				logged++;
			}
			ensureBatch(tx, info, logged, now);
		});
		notifyChanged(
			[...colours.map((c) => c.id), ...tagSets.map((t) => t.id)],
			version,
		);
	}

	// Closed. Taking the device's side leaves nothing to send back to it.
	statement(
		`UPDATE conflicts SET state = 'resolved', resolution = @take, resolved_at = @now,
			pushed = CASE WHEN @take = 'device' THEN 1 ELSE pushed END
		 WHERE id IN (SELECT value FROM json_each(@ids)) AND state = 'open'`,
	).run({
		take,
		now: now.getTime(),
		ids: JSON.stringify(rows.map((r) => r.id)),
	});
	if (tagsChanged) enqueue(tagFlush, { batchId: info.batchId });
	wakeDevices("rekordbox", "conflicts resolved");
	return { resolved: rows.length, changed };
}
