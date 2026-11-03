import { parseTitle } from "../normalize/index.ts";
import { safeJoin, sanitizeFilename } from "../paths/index.ts";
import {
	type ParsedTemplate,
	parseTemplate,
	renderSegments,
	TEMPLATE_TOKENS,
	type TokenValues,
} from "./template.ts";

export type { ParsedTemplate, TokenValues };
export { parseTemplate, TEMPLATE_TOKENS };

export interface OrganizeTrack {
	id: string | number;
	// Current path under the library root, "/" separated.
	path: string;
	title: string | null;
	artist: string | null;
	albumArtist?: string | null;
	album?: string | null;
	genre?: string | null;
	year?: number | null;
	bpm?: number | null;
	key?: string | null;
	label?: string | null;
	remixer?: string | null;
	// Read from the title when absent.
	mixName?: string | null;
}

export interface Move {
	id: string | number;
	from: string;
	to: string;
}

export interface Collision {
	id: string | number;
	wanted: string;
	// The numbered path the track got instead.
	assigned: string;
	// The other track holding the wanted path, or "file" when it is a path no
	// track of the plan owns.
	with: string | number | "file";
}

export interface Skipped {
	id: string | number;
	reason: string;
}

export interface MovePlan {
	moves: Move[];
	collisions: Collision[];
	skipped: Skipped[];
	unchanged: number;
}

export interface PlanOptions {
	// Whole path budget, root included. Default 240.
	maxPathLength?: number;
	// Paths on disk no track owns, so a plan does not land on them.
	reserved?: Iterable<string>;
	// Value for a token that is empty and has no `|fallback`.
	unknown?: Partial<Record<keyof TokenValues, string>>;
}

const lower = (s: string) => s.normalize("NFC").toLowerCase();

function extOf(path: string): string {
	const base = path.slice(path.lastIndexOf("/") + 1);
	const dot = base.lastIndexOf(".");
	return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function valuesOf(track: OrganizeTrack, usesMix: boolean): TokenValues {
	const parsed = parseTitle(track.title);
	const mix = track.mixName ?? parsed.mixName;
	let title = track.title ?? "";
	if (usesMix && parsed.mixName !== null) {
		title = parsed.base;
		if (parsed.features.length > 0)
			title += ` (feat. ${parsed.features.join(" & ")})`;
	}
	const out: TokenValues = {};
	const put = (k: keyof TokenValues, v: string | number | null | undefined) => {
		if (v === null || v === undefined) return;
		const s = String(v).trim();
		if (s !== "" && s !== "0") out[k] = s;
	};
	put("artist", track.artist);
	put("albumartist", track.albumArtist);
	put("album", track.album);
	put("title", title);
	put("mix", mix);
	put("remixer", track.remixer ?? parsed.remixer);
	put("genre", track.genre);
	put("year", track.year);
	put("bpm", track.bpm ? Math.round(track.bpm) : null);
	put("key", track.key);
	put("label", track.label);
	put("ext", extOf(track.path));
	return out;
}

// Shortens segments until the path fits: the file stem first (never under 24
// characters), then the longest folders.
function fit(segments: string[], rootLength: number, max: number): string[] {
	const total = () =>
		rootLength + segments.reduce((n, s) => n + s.length + 1, 0);
	if (total() <= max) return segments;
	const out = [...segments];
	const last = out.length - 1;
	const name = out[last] as string;
	const dot = name.lastIndexOf(".");
	const ext = dot > 0 ? name.slice(dot) : "";
	let stem = dot > 0 ? name.slice(0, dot) : name;
	while (total() > max && stem.length > 24) {
		stem = stem.slice(0, -1).trimEnd();
		out[last] = `${stem}${ext}`;
	}
	while (total() > max) {
		let longest = -1;
		for (let i = 0; i < last; i++)
			if (
				(out[i] as string).length > 12 &&
				(longest < 0 ||
					(out[i] as string).length > (out[longest] as string).length)
			)
				longest = i;
		if (longest < 0) break;
		out[longest] = (out[longest] as string).slice(0, -1).trimEnd();
	}
	return out;
}

function numbered(path: string, n: number): string {
	const slash = path.lastIndexOf("/");
	const dir = path.slice(0, slash + 1);
	const name = path.slice(slash + 1);
	const dot = name.lastIndexOf(".");
	return dot > 0
		? `${dir}${name.slice(0, dot)} (${n})${name.slice(dot)}`
		: `${dir}${name} (${n})`;
}

// Where each track's file should live under `template`. Case-insensitive
// collisions are numbered "name (2).mp3"; a track already in place keeps its
// path and claims it first. O(n) in tracks.
export function planMoves(
	tracks: readonly OrganizeTrack[],
	template: string,
	root: string,
	options: PlanOptions = {},
): MovePlan {
	const parsed = parseTemplate(template);
	const usesMix = parsed.tokens.has("mix") || parsed.tokens.has("remixer");
	const max = options.maxPathLength ?? 240;
	const rootLength = root.length;

	const wanted = new Map<OrganizeTrack, string>();
	const skipped: Skipped[] = [];
	for (const track of tracks) {
		const values = valuesOf(track, usesMix);
		for (const [k, v] of Object.entries(options.unknown ?? {}))
			if (values[k as keyof TokenValues] === undefined)
				values[k as keyof TokenValues] = v;
		const raw = renderSegments(parsed, values);
		const segments = raw
			.map((s, i) => (i === raw.length - 1 ? s : s.trim()))
			.filter((s, i) => s !== "" || i === raw.length - 1)
			.map((s, i, all) =>
				sanitizeFilename(s, i === all.length - 1 ? "untitled" : "_"),
			);
		const ext = values.ext;
		if (!parsed.endsWithExt && ext && segments.length > 0) {
			const last = segments.length - 1;
			if (!lower(segments[last] as string).endsWith(`.${ext}`))
				segments[last] = `${segments[last]}.${ext}`;
		}
		const fitted = fit(segments, rootLength, max);
		const path = fitted.join("/");
		try {
			safeJoin(root, path);
		} catch (e) {
			skipped.push({ id: track.id, reason: (e as Error).message });
			continue;
		}
		wanted.set(track, path);
	}

	const claims = new Map<string, string | number | "file">();
	for (const r of options.reserved ?? []) claims.set(lower(r), "file");
	let unchanged = 0;
	for (const [track, path] of wanted) {
		if (path === track.path) {
			claims.set(lower(path), track.id);
			unchanged++;
		}
	}
	const moves: Move[] = [];
	const collisions: Collision[] = [];
	for (const [track, path] of wanted) {
		if (path === track.path) continue;
		let assigned = path;
		let key = lower(assigned);
		const holder = claims.get(key);
		if (holder !== undefined && holder !== track.id) {
			for (let n = 2; claims.has(key) && claims.get(key) !== track.id; n++) {
				assigned = numbered(path, n);
				key = lower(assigned);
			}
			collisions.push({ id: track.id, wanted: path, assigned, with: holder });
		}
		claims.set(key, track.id);
		if (assigned === track.path) {
			unchanged++;
			continue;
		}
		moves.push({ id: track.id, from: track.path, to: assigned });
	}
	return { moves, collisions, skipped, unchanged };
}

// The moves that put every file back, in reverse order.
export function inverse(moves: readonly Move[]): Move[] {
	return moves.map((m) => ({ id: m.id, from: m.to, to: m.from })).reverse();
}

export interface MoveStep {
	id: string | number;
	from: string;
	to: string;
}

// An order a file system can run one rename at a time. A move onto a path
// another move is about to vacate waits for it; a cycle (a swap) goes through
// a temporary name. Case-only renames also go through one, for case-insensitive
// file systems.
export function orderMoves(moves: readonly Move[]): MoveStep[] {
	const byFrom = new Map<string, Move>();
	for (const m of moves) byFrom.set(lower(m.from), m);
	const done = new Set<Move>();
	const visiting = new Set<Move>();
	const steps: MoveStep[] = [];
	const later: MoveStep[] = [];
	let temp = 0;

	const visit = (m: Move) => {
		if (done.has(m)) return;
		if (visiting.has(m)) return;
		visiting.add(m);
		const blocker = byFrom.get(lower(m.to));
		if (blocker && blocker !== m) {
			if (visiting.has(blocker)) {
				const tmp = `${m.from}.tv-move-${temp++}`;
				steps.push({ id: m.id, from: m.from, to: tmp });
				later.push({ id: m.id, from: tmp, to: m.to });
				done.add(m);
				visiting.delete(m);
				return;
			}
			visit(blocker);
		} else if (blocker === m) {
			const tmp = `${m.from}.tv-move-${temp++}`;
			steps.push({ id: m.id, from: m.from, to: tmp });
			steps.push({ id: m.id, from: tmp, to: m.to });
			done.add(m);
			visiting.delete(m);
			return;
		}
		if (!done.has(m)) {
			steps.push({ id: m.id, from: m.from, to: m.to });
			done.add(m);
		}
		visiting.delete(m);
	};
	for (const m of moves) visit(m);
	return [...steps, ...later];
}
