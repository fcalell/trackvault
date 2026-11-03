// Base snapshot and diff primitives for the three-way sync (plan section 6). Pure
// functions over plain data: no database, no disk. The agent keeps the last
// synced `RbSnapshot` (the base), takes a fresh one from the current master.db,
// and `diff(base, current)` is exactly what changed in Rekordbox in between.

import type { RbCue, RbPlaylists, RbTrack } from "./read.ts";

// Per track, the fields TrackVault owns. Not here on purpose: bpm and key
// (per-device analysis), play counts (per-device history), paths and ids (per
// device), cues (performance data, snapshotted on their own).
export const OWNED_TRACK_FIELDS = [
	"title",
	"artist",
	"remixer",
	"album",
	"genre",
	"label",
	"year",
	"comment",
	"rating",
	"color",
	"myTags",
] as const;

export type OwnedTrackField = (typeof OWNED_TRACK_FIELDS)[number];
export type FieldValue = string | number | string[] | null;

export interface SnapshotPlaylist {
	// name
	n: string;
	// parent playlist id (null at the top level)
	p: string | null;
	k: "playlist" | "folder" | "smart";
	// position among its siblings
	s: number;
	// ordered content ids (empty for folders and smart playlists)
	t: string[];
	// smart playlist rule XML, otherwise absent
	r?: string;
}

export interface RbSnapshot {
	v: 1;
	// Column names of the `tracks` tuples.
	fields: string[];
	// content id -> owned values, in `fields` order.
	tracks: Record<string, FieldValue[]>;
	// playlist id -> playlist (Rekordbox's own hidden lists left out).
	playlists: Record<string, SnapshotPlaylist>;
	// content id -> sorted cue signatures (`cueSignature`), only for tracks with cues.
	cues: Record<string, string[]>;
}

function ownedValue(track: RbTrack, field: string): FieldValue {
	switch (field) {
		case "title":
			return track.title;
		case "artist":
			return track.artist;
		case "remixer":
			return track.remixer;
		case "album":
			return track.album;
		case "genre":
			return track.genre;
		case "label":
			return track.label;
		case "year":
			return track.year;
		case "comment":
			return track.comment;
		case "rating":
			return track.rating;
		case "color":
			return track.color;
		case "myTags":
			// Names, sorted: ids differ per install, membership is a set.
			return [...track.myTags].sort();
		default:
			return null;
	}
}

// One cue as a comparable string: `kind:startMs:endMs:color:comment` (comment last,
// it may contain ":"). Two installs describe the same cue by the same string.
export function cueSignature(cue: RbCue): string {
	return `${cue.kind}:${cue.startMs}:${cue.endMs ?? ""}:${cue.color ?? ""}:${cue.comment ?? ""}`;
}

export function parseCueSignature(signature: string): {
	kind: number;
	startMs: number;
	endMs: number | null;
	color: number | null;
	comment: string | null;
} {
	const [kind = "0", start = "0", end = "", color = ""] = signature.split(
		":",
		4,
	);
	const comment = signature.split(":").slice(4).join(":");
	return {
		kind: Number(kind),
		startMs: Number(start),
		endMs: end === "" ? null : Number(end),
		color: color === "" ? null : Number(color),
		comment: comment === "" ? null : comment,
	};
}

export function snapshotOf(
	collection: readonly RbTrack[],
	playlists: RbPlaylists,
	cues: ReadonlyMap<string, readonly RbCue[]>,
	fields: readonly string[] = OWNED_TRACK_FIELDS,
): RbSnapshot {
	const tracks: RbSnapshot["tracks"] = {};
	for (const t of collection)
		tracks[t.id] = fields.map((f) => ownedValue(t, f));
	const lists: RbSnapshot["playlists"] = {};
	for (const p of playlists.nodes) {
		if (p.special) continue;
		const entry: SnapshotPlaylist = {
			n: p.name,
			p: p.parentId,
			k: p.kind,
			s: p.seq,
			t: p.kind === "playlist" ? [...(playlists.tracks.get(p.id) ?? [])] : [],
		};
		if (p.kind === "smart" && p.smartList) entry.r = p.smartList;
		lists[p.id] = entry;
	}
	const cueState: RbSnapshot["cues"] = {};
	for (const [contentId, list] of cues) {
		if (list.length > 0) cueState[contentId] = list.map(cueSignature).sort();
	}
	return {
		v: 1,
		fields: [...fields],
		tracks,
		playlists: lists,
		cues: cueState,
	};
}

// ---- diff -------------------------------------------------------------------------

export interface FieldChange {
	field: string;
	before: FieldValue;
	after: FieldValue;
}

export interface TrackChange {
	contentId: string;
	fields: FieldChange[];
}

export interface PlaylistChange {
	playlistId: string;
	// Set when the playlist is new in `current` / gone from it.
	change: "added" | "removed" | "changed";
	// Rename, move to another folder, or reposition among siblings.
	name?: { before: string; after: string };
	parent?: { before: string | null; after: string | null };
	seq?: { before: number; after: number };
	rules?: { before: string | null; after: string | null };
	// Ordered-set view of the membership change (kept tracks excluded).
	addedTracks: string[];
	removedTracks: string[];
	// The tracks present on both sides are in a different relative order.
	reordered: boolean;
	// Full ordered lists, for a merge that must replay the order.
	before: string[];
	after: string[];
}

export interface CueChange {
	contentId: string;
	added: string[];
	removed: string[];
}

export interface RbDiff {
	tracks: {
		added: string[];
		removed: string[];
		changed: TrackChange[];
	};
	playlists: PlaylistChange[];
	cues: CueChange[];
	empty: boolean;
}

function same(a: FieldValue, b: FieldValue): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => v === b[i]);
	}
	return a === b;
}

function relativeOrderDiffers(
	before: readonly string[],
	after: readonly string[],
): boolean {
	const inAfter = new Set(after);
	const inBefore = new Set(before);
	const a = before.filter((id) => inAfter.has(id));
	const b = after.filter((id) => inBefore.has(id));
	return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

function diffTracks(base: RbSnapshot, current: RbSnapshot): RbDiff["tracks"] {
	const added: string[] = [];
	const removed: string[] = [];
	const changed: TrackChange[] = [];
	// Field names may differ between the two snapshots: compare by name.
	const baseIndex = new Map(base.fields.map((f, i) => [f, i]));
	const curIndex = new Map(current.fields.map((f, i) => [f, i]));
	const shared = current.fields.filter((f) => baseIndex.has(f));
	for (const [id, values] of Object.entries(current.tracks)) {
		const old = base.tracks[id];
		if (!old) {
			added.push(id);
			continue;
		}
		const fields: FieldChange[] = [];
		for (const f of shared) {
			const before = old[baseIndex.get(f) as number] ?? null;
			const after = values[curIndex.get(f) as number] ?? null;
			if (!same(before, after)) fields.push({ field: f, before, after });
		}
		if (fields.length > 0) changed.push({ contentId: id, fields });
	}
	for (const id of Object.keys(base.tracks))
		if (!(id in current.tracks)) removed.push(id);
	return { added, removed, changed };
}

function diffPlaylists(
	base: RbSnapshot,
	current: RbSnapshot,
): PlaylistChange[] {
	const out: PlaylistChange[] = [];
	for (const [id, now] of Object.entries(current.playlists)) {
		const was = base.playlists[id];
		if (!was) {
			out.push({
				playlistId: id,
				change: "added",
				name: { before: "", after: now.n },
				parent: { before: null, after: now.p },
				seq: { before: 0, after: now.s },
				addedTracks: [...now.t],
				removedTracks: [],
				reordered: false,
				before: [],
				after: [...now.t],
			});
			continue;
		}
		const change: PlaylistChange = {
			playlistId: id,
			change: "changed",
			addedTracks: now.t.filter((t) => !was.t.includes(t)),
			removedTracks: was.t.filter((t) => !now.t.includes(t)),
			reordered: relativeOrderDiffers(was.t, now.t),
			before: [...was.t],
			after: [...now.t],
		};
		if (was.n !== now.n) change.name = { before: was.n, after: now.n };
		if (was.p !== now.p) change.parent = { before: was.p, after: now.p };
		if (was.s !== now.s) change.seq = { before: was.s, after: now.s };
		if ((was.r ?? null) !== (now.r ?? null)) {
			change.rules = { before: was.r ?? null, after: now.r ?? null };
		}
		const touched =
			change.name ||
			change.parent ||
			change.seq ||
			change.rules ||
			change.addedTracks.length > 0 ||
			change.removedTracks.length > 0 ||
			change.reordered;
		if (touched) out.push(change);
	}
	for (const [id, was] of Object.entries(base.playlists)) {
		if (id in current.playlists) continue;
		out.push({
			playlistId: id,
			change: "removed",
			name: { before: was.n, after: "" },
			parent: { before: was.p, after: null },
			seq: { before: was.s, after: 0 },
			addedTracks: [],
			removedTracks: [...was.t],
			reordered: false,
			before: [...was.t],
			after: [],
		});
	}
	return out;
}

function diffCues(base: RbSnapshot, current: RbSnapshot): CueChange[] {
	const out: CueChange[] = [];
	for (const id of new Set([
		...Object.keys(base.cues),
		...Object.keys(current.cues),
	])) {
		const was = base.cues[id] ?? [];
		const now = current.cues[id] ?? [];
		const wasSet = new Set(was);
		const nowSet = new Set(now);
		const added = now.filter((c) => !wasSet.has(c));
		const removed = was.filter((c) => !nowSet.has(c));
		if (added.length > 0 || removed.length > 0)
			out.push({ contentId: id, added, removed });
	}
	return out;
}

// What changed between two snapshots: field-level track changes, playlist
// membership / order / structure changes, cue set changes.
export function diff(base: RbSnapshot, current: RbSnapshot): RbDiff {
	const tracks = diffTracks(base, current);
	const playlists = diffPlaylists(base, current);
	const cues = diffCues(base, current);
	return {
		tracks,
		playlists,
		cues,
		empty:
			tracks.added.length === 0 &&
			tracks.removed.length === 0 &&
			tracks.changed.length === 0 &&
			playlists.length === 0 &&
			cues.length === 0,
	};
}
