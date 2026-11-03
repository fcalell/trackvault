import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sanitizeFilename } from "../paths/index.ts";
import { withAnlzPath } from "../rekordbox/anlz.ts";
import { readPdb } from "./read.ts";
import type {
	Pdb,
	PdbPlaylistEntry,
	PdbPlaylistNode,
	PdbTrack,
} from "./types.ts";
import { buildPdb, type PdbInput } from "./write.ts";

// What the export takes from TrackVault: plain values, no hub types.
export interface CdjSourceTrack {
	// TrackVault's id; the export gives the player a number and returns the mapping.
	key: string;
	sourcePath: string;
	title: string;
	artist?: string | null;
	album?: string | null;
	genre?: string | null;
	label?: string | null;
	remixer?: string | null;
	// As shown on the player: "8A", "Am" (written as given).
	musicalKey?: string | null;
	mixName?: string | null;
	comment?: string | null;
	bpm?: number | null;
	durationSec?: number | null;
	year?: number | null;
	trackNumber?: number | null;
	discNumber?: number | null;
	// 0 to 5
	rating?: number | null;
	// One of COLOR_NAMES (case-insensitive).
	color?: string | null;
	playCount?: number | null;
	sampleRate?: number | null;
	// kbps
	bitrate?: number | null;
	bitDepth?: number | null;
	dateAdded?: Date | string | null;
	// Rekordbox's own ANLZ files for this track (the agent's analysis_blobs). Without
	// them the track is exported with no waveform, beat grid or cues.
	analysis?: { dat?: Buffer; ext?: Buffer; twoEx?: Buffer };
}

export interface CdjSourcePlaylist {
	key: string;
	name: string;
	parentKey?: string | null;
	isFolder?: boolean;
	trackKeys?: string[];
}

export const COLOR_NAMES = [
	"Pink",
	"Red",
	"Orange",
	"Yellow",
	"Green",
	"Aqua",
	"Blue",
	"Purple",
] as const;

export interface CdjModel {
	content: PdbInput;
	// source key -> id the player reports
	trackIds: Map<string, number>;
	// source key -> path under the USB root, each with a leading slash
	contentPaths: Map<string, string>;
}

const fold = (s: string) => s.normalize("NFC").trim().toLowerCase();

class Registry {
	private ids = new Map<string, number>();
	readonly rows: { id: number; name: string }[] = [];
	get(name: string | null | undefined): number {
		const clean = (name ?? "").normalize("NFC").trim();
		if (clean === "") return 0;
		const k = fold(clean);
		let id = this.ids.get(k);
		if (id === undefined) {
			id = this.rows.length + 1;
			this.ids.set(k, id);
			this.rows.push({ id, name: clean });
		}
		return id;
	}
}

function day(d: Date | string | null | undefined): string {
	if (!d) return "";
	const date = typeof d === "string" ? new Date(d) : d;
	return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

// Where a track's ANLZ files live: /PIONEER/USBANLZ/Pxxx/xxxxxxxx/ (three and eight hex
// digits; Rekordbox derives them from its own hash, any unique pair should do).
export function anlzDirectory(key: string): string {
	const h = createHash("sha1").update(key).digest("hex").toUpperCase();
	return `/PIONEER/USBANLZ/P${h.slice(0, 3)}/${h.slice(3, 11)}`;
}

// The path of a track's audio on the stick: /Contents/<artist>/<album>/<file>.
export function contentPath(
	t: Pick<CdjSourceTrack, "artist" | "album" | "sourcePath">,
	taken: Set<string>,
): string {
	const base = t.sourcePath.split(/[\\/]/).pop() ?? "track";
	const file = sanitizeFilename(base, "track");
	const dir = `/Contents/${sanitizeFilename(t.artist ?? "", "Unknown Artist")}/${sanitizeFilename(t.album ?? "", "Unknown Album")}`;
	let candidate = `${dir}/${file}`;
	const dot = file.lastIndexOf(".");
	const stem = dot > 0 ? file.slice(0, dot) : file;
	const ext = dot > 0 ? file.slice(dot) : "";
	for (let n = 2; taken.has(candidate.toLowerCase()); n++)
		candidate = `${dir}/${stem} (${n})${ext}`;
	taken.add(candidate.toLowerCase());
	return candidate;
}

// Pure: the database content for a set of tracks and playlists (no disk access).
// `sizes` gives each track's file size in bytes (0 when unknown).
export function buildModel(
	tracks: CdjSourceTrack[],
	playlists: CdjSourcePlaylist[],
	sizes: Map<string, number> = new Map(),
): CdjModel {
	const artists = new Registry();
	const genres = new Registry();
	const labels = new Registry();
	const keys = new Registry();
	const albumIds = new Map<string, number>();
	const albums: { id: number; artistId: number; name: string }[] = [];
	const trackIds = new Map<string, number>();
	const contentPaths = new Map<string, string>();
	const taken = new Set<string>();
	const rows: PdbTrack[] = [];
	const today = day(new Date());
	tracks.forEach((t, i) => {
		const id = i + 1;
		trackIds.set(t.key, id);
		const path = contentPath(t, taken);
		contentPaths.set(t.key, path);
		const artistId = artists.get(t.artist);
		let albumId = 0;
		if (t.album?.trim()) {
			const ak = `${artistId}|${fold(t.album)}`;
			albumId = albumIds.get(ak) ?? 0;
			if (!albumId) {
				albumId = albums.length + 1;
				albumIds.set(ak, albumId);
				albums.push({
					id: albumId,
					artistId,
					name: t.album.normalize("NFC").trim(),
				});
			}
		}
		const colorIdx = t.color
			? COLOR_NAMES.findIndex((c) => c.toLowerCase() === t.color?.toLowerCase())
			: -1;
		rows.push({
			id,
			title: t.title,
			artistId,
			albumId,
			genreId: genres.get(t.genre),
			labelId: labels.get(t.label),
			keyId: keys.get(t.musicalKey),
			remixerId: artists.get(t.remixer),
			composerId: 0,
			originalArtistId: 0,
			artworkId: 0,
			colorId: colorIdx + 1,
			rating: Math.max(0, Math.min(5, Math.round(t.rating ?? 0))),
			tempo: Math.round((t.bpm ?? 0) * 100),
			durationSec: Math.round(t.durationSec ?? 0),
			year: t.year ?? 0,
			trackNumber: t.trackNumber ?? 0,
			discNumber: t.discNumber ?? 0,
			playCount: t.playCount ?? 0,
			sampleRate: t.sampleRate ?? 44100,
			sampleDepth: t.bitDepth ?? 16,
			bitrate: t.bitrate ?? 0,
			fileSize: sizes.get(t.key) ?? 0,
			mixName: t.mixName ?? "",
			comment: t.comment ?? "",
			dateAdded: day(t.dateAdded) || today,
			releaseDate: t.year ? String(t.year) : "",
			analyzePath: t.analysis?.dat
				? `${anlzDirectory(t.key)}/ANLZ0000.DAT`
				: "",
			analyzeDate: t.analysis?.dat ? today : "",
			filename: path.split("/").pop() ?? "",
			filePath: path,
		});
	});

	const nodeIds = new Map<string, number>();
	for (const [i, p] of playlists.entries()) nodeIds.set(p.key, i + 1);
	const tree: PdbPlaylistNode[] = [];
	const entries: PdbPlaylistEntry[] = [];
	const siblings = new Map<number, number>();
	playlists.forEach((p) => {
		const id = nodeIds.get(p.key) as number;
		const parentId = p.parentKey ? (nodeIds.get(p.parentKey) ?? 0) : 0;
		const order = siblings.get(parentId) ?? 0;
		siblings.set(parentId, order + 1);
		tree.push({
			id,
			parentId,
			sortOrder: order,
			isFolder: !!p.isFolder,
			name: p.name,
		});
		if (p.isFolder) return;
		let index = 1;
		for (const k of p.trackKeys ?? []) {
			const trackId = trackIds.get(k);
			if (trackId) entries.push({ playlistId: id, trackId, index: index++ });
		}
	});

	return {
		trackIds,
		contentPaths,
		content: {
			tracks: rows,
			artists: artists.rows,
			albums,
			genres: genres.rows,
			labels: labels.rows,
			keys: keys.rows,
			colors: COLOR_NAMES.map((name, i) => ({ id: i + 1, name })),
			artwork: [],
			playlistTree: tree,
			playlistEntries: entries,
		},
	};
}

export interface ExportReport {
	tracks: number;
	playlists: number;
	copied: number;
	skippedExisting: number;
	bytes: number;
	anlzFiles: number;
	// Tracks written without ANLZ files: no waveform, beat grid or cues on the player.
	withoutAnalysis: number;
	warnings: string[];
	trackIds: Map<string, number>;
}

export interface ExportOptions {
	// The mounted stick (or any folder to be copied to one): FAT32 or exFAT, which
	// is what a CDJ reads.
	root: string;
	tracks: CdjSourceTrack[];
	playlists: CdjSourcePlaylist[];
	onProgress?: (done: number, total: number) => void;
}

// Writes the Rekordbox USB layout: Contents/ (audio), PIONEER/rekordbox/export.pdb and
// PIONEER/USBANLZ/ (only the ANLZ the caller has). Audio already on the stick with the
// same size is not copied again. Nothing else on the stick is touched or removed.
export async function exportUsb(opts: ExportOptions): Promise<ExportReport> {
	const warnings: string[] = [];
	const sizes = new Map<string, number>();
	const usable: CdjSourceTrack[] = [];
	for (const t of opts.tracks) {
		try {
			sizes.set(t.key, (await stat(t.sourcePath)).size);
			usable.push(t);
		} catch {
			warnings.push(`missing source file, track skipped: ${t.sourcePath}`);
		}
	}
	const model = buildModel(usable, opts.playlists, sizes);
	const report: ExportReport = {
		tracks: usable.length,
		playlists: opts.playlists.length,
		copied: 0,
		skippedExisting: 0,
		bytes: 0,
		anlzFiles: 0,
		withoutAnalysis: 0,
		warnings,
		trackIds: model.trackIds,
	};
	let done = 0;
	for (const t of usable) {
		const rel = model.contentPaths.get(t.key) as string;
		const dest = join(opts.root, ...rel.split("/").filter(Boolean));
		await mkdir(dirname(dest), { recursive: true });
		const size = sizes.get(t.key) as number;
		const existing = await stat(dest).then(
			(s) => s.size,
			() => -1,
		);
		if (existing === size) report.skippedExisting++;
		else {
			await copyFile(t.sourcePath, dest);
			report.copied++;
			report.bytes += size;
		}
		if (t.analysis?.dat) {
			const dir = join(
				opts.root,
				...anlzDirectory(t.key).split("/").filter(Boolean),
			);
			await mkdir(dir, { recursive: true });
			const parts: [Buffer | undefined, string][] = [
				[t.analysis.dat, "ANLZ0000.DAT"],
				[t.analysis.ext, "ANLZ0000.EXT"],
				[t.analysis.twoEx, "ANLZ0000.2EX"],
			];
			for (const [buf, name] of parts) {
				if (!buf) continue;
				try {
					await writeFile(join(dir, name), withAnlzPath(buf, rel));
					report.anlzFiles++;
				} catch (e) {
					warnings.push(
						`${t.title}: ${name} not written (${(e as Error).message})`,
					);
				}
			}
		} else report.withoutAnalysis++;
		opts.onProgress?.(++done, usable.length);
	}
	const pdbPath = join(opts.root, "PIONEER", "rekordbox", "export.pdb");
	await mkdir(dirname(pdbPath), { recursive: true });
	await writeFile(pdbPath, buildPdb(model.content));
	if (report.withoutAnalysis > 0)
		warnings.push(
			`${report.withoutAnalysis} track(s) have no Rekordbox analysis: no waveform, beat grid or cue points on the player`,
		);
	return report;
}

export interface UsbInspection {
	pdb: boolean;
	exportExt: boolean;
	// Rekordbox 6.8+/7 "Device Library Plus" (SQLCipher): detected, not read.
	devicePlus: boolean;
	anlzDirectories: boolean;
}

async function exists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false,
	);
}

export async function inspectUsb(root: string): Promise<UsbInspection> {
	return {
		pdb: await exists(join(root, "PIONEER", "rekordbox", "export.pdb")),
		exportExt: await exists(
			join(root, "PIONEER", "rekordbox", "exportExt.pdb"),
		),
		devicePlus: await exists(
			join(root, "PIONEER", "rekordbox", "exportLibrary.db"),
		),
		anlzDirectories: await exists(join(root, "PIONEER", "USBANLZ")),
	};
}

export async function readUsb(root: string): Promise<Pdb> {
	return readPdb(
		await readFile(join(root, "PIONEER", "rekordbox", "export.pdb")),
	);
}
