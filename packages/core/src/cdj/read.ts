import {
	decodeString,
	PAGE_HEADER,
	PageType,
	ROW_GROUP,
	TrackString,
} from "./format.ts";
import type { Pdb, PdbTableRef, PdbTrack } from "./types.ts";

interface RowRef {
	// absolute offset of the row in the file
	at: number;
}

function* pageRows(
	buf: Buffer,
	pageStart: number,
	pageSize: number,
): Generator<RowRef> {
	const flags = buf[pageStart + 0x1b] as number;
	if ((flags & 0x40) !== 0) return;
	const bits = buf.readUIntLE(pageStart + 0x18, 3);
	const offsets = bits & 0x1fff;
	const groups = offsets === 0 ? 0 : Math.floor((offsets - 1) / 16) + 1;
	for (let g = 0; g < groups; g++) {
		const base = pageStart + pageSize - g * ROW_GROUP;
		if (base - 6 < pageStart) return;
		const present = buf.readUInt16LE(base - 4);
		for (let i = 0; i < 16 && g * 16 + i < offsets; i++) {
			if (((present >> i) & 1) === 0) continue;
			const ofs = buf.readUInt16LE(base - 6 - 2 * i);
			yield { at: pageStart + PAGE_HEADER + ofs };
		}
	}
}

// Every present row of a table, following the page chain from the table's first page.
function* tableRows(
	buf: Buffer,
	pageSize: number,
	table: PdbTableRef,
): Generator<RowRef> {
	const seen = new Set<number>();
	let page = table.firstPage;
	while (!seen.has(page)) {
		seen.add(page);
		const start = page * pageSize;
		if (start + pageSize > buf.length) return;
		// a page of another type means the chain left this table
		if (buf.readUInt32LE(start + 8) !== table.type) return;
		yield* pageRows(buf, start, pageSize);
		if (page === table.lastPage) return;
		page = buf.readUInt32LE(start + 0x0c);
	}
}

function nameAt(
	buf: Buffer,
	row: number,
	near: number,
	far: number,
	subtype: number,
): string {
	return decodeString(
		buf,
		row +
			((subtype & 0x04) === 0x04
				? buf.readUInt16LE(row + far)
				: buf.readUInt8(row + near)),
	);
}

function readTrack(buf: Buffer, r: number): PdbTrack {
	const s = (slot: number) => {
		const ofs = buf.readUInt16LE(r + 0x5e + 2 * slot);
		return decodeString(buf, r + ofs);
	};
	return {
		id: buf.readUInt32LE(r + 0x48),
		title: s(TrackString.title),
		artistId: buf.readUInt32LE(r + 0x44),
		albumId: buf.readUInt32LE(r + 0x40),
		genreId: buf.readUInt32LE(r + 0x3c),
		labelId: buf.readUInt32LE(r + 0x28),
		keyId: buf.readUInt32LE(r + 0x20),
		remixerId: buf.readUInt32LE(r + 0x2c),
		composerId: buf.readUInt32LE(r + 0x0c),
		originalArtistId: buf.readUInt32LE(r + 0x24),
		artworkId: buf.readUInt32LE(r + 0x1c),
		colorId: buf.readUInt8(r + 0x58),
		rating: buf.readUInt8(r + 0x59),
		tempo: buf.readUInt32LE(r + 0x38),
		durationSec: buf.readUInt16LE(r + 0x54),
		year: buf.readUInt16LE(r + 0x50),
		trackNumber: buf.readUInt32LE(r + 0x34),
		discNumber: buf.readUInt16LE(r + 0x4c),
		playCount: buf.readUInt16LE(r + 0x4e),
		sampleRate: buf.readUInt32LE(r + 0x08),
		sampleDepth: buf.readUInt16LE(r + 0x52),
		bitrate: buf.readUInt32LE(r + 0x30),
		fileSize: buf.readUInt32LE(r + 0x10),
		mixName: s(TrackString.mixName),
		comment: s(TrackString.comment),
		dateAdded: s(TrackString.dateAdded),
		releaseDate: s(TrackString.releaseDate),
		analyzePath: s(TrackString.analyzePath),
		analyzeDate: s(TrackString.analyzeDate),
		filename: s(TrackString.filename),
		filePath: s(TrackString.filePath),
	};
}

// Parses an export.pdb. Tables the model does not cover (history, columns, the unknown
// ones) are listed in `tables` and not decoded. Throws on a file that is not a DeviceSQL
// database; a damaged row throws a RangeError from the Buffer read.
export function readPdb(buf: Buffer): Pdb {
	if (buf.length < 0x1c) throw new Error("export.pdb: file too short");
	const pageSize = buf.readUInt32LE(4);
	const numTables = buf.readUInt32LE(8);
	if (
		buf.readUInt32LE(0) !== 0 ||
		pageSize < 512 ||
		pageSize % 4 !== 0 ||
		numTables > 64
	)
		throw new Error("export.pdb: not a DeviceSQL header");
	const tables: PdbTableRef[] = [];
	for (let i = 0; i < numTables; i++) {
		const at = 0x1c + i * 16;
		tables.push({
			type: buf.readUInt32LE(at),
			emptyCandidate: buf.readUInt32LE(at + 4),
			firstPage: buf.readUInt32LE(at + 8),
			lastPage: buf.readUInt32LE(at + 12),
		});
	}
	const out: Pdb = {
		pageSize,
		nextUnusedPage: buf.readUInt32LE(12),
		sequence: buf.readUInt32LE(0x14),
		tables,
		tracks: [],
		artists: [],
		albums: [],
		genres: [],
		labels: [],
		keys: [],
		colors: [],
		artwork: [],
		playlistTree: [],
		playlistEntries: [],
	};
	for (const table of tables) {
		for (const { at: r } of tableRows(buf, pageSize, table)) {
			switch (table.type) {
				case PageType.tracks:
					out.tracks.push(readTrack(buf, r));
					break;
				case PageType.artists: {
					const sub = buf.readUInt16LE(r);
					out.artists.push({
						id: buf.readUInt32LE(r + 4),
						name: nameAt(buf, r, 9, 0x0a, sub),
					});
					break;
				}
				case PageType.albums: {
					const sub = buf.readUInt16LE(r);
					out.albums.push({
						id: buf.readUInt32LE(r + 0x0c),
						artistId: buf.readUInt32LE(r + 8),
						name: nameAt(buf, r, 0x15, 0x16, sub),
					});
					break;
				}
				case PageType.genres:
					out.genres.push({
						id: buf.readUInt32LE(r),
						name: decodeString(buf, r + 4),
					});
					break;
				case PageType.labels:
					out.labels.push({
						id: buf.readUInt32LE(r),
						name: decodeString(buf, r + 4),
					});
					break;
				case PageType.keys:
					out.keys.push({
						id: buf.readUInt32LE(r),
						name: decodeString(buf, r + 8),
					});
					break;
				case PageType.colors:
					out.colors.push({
						id: buf.readUInt16LE(r + 5),
						name: decodeString(buf, r + 8),
					});
					break;
				case PageType.artwork:
					out.artwork.push({
						id: buf.readUInt32LE(r),
						path: decodeString(buf, r + 4),
					});
					break;
				case PageType.playlistTree:
					out.playlistTree.push({
						parentId: buf.readUInt32LE(r),
						sortOrder: buf.readUInt32LE(r + 8),
						id: buf.readUInt32LE(r + 12),
						isFolder: buf.readUInt32LE(r + 16) !== 0,
						name: decodeString(buf, r + 20),
					});
					break;
				case PageType.playlistEntries:
					out.playlistEntries.push({
						index: buf.readUInt32LE(r),
						trackId: buf.readUInt32LE(r + 4),
						playlistId: buf.readUInt32LE(r + 8),
					});
					break;
			}
		}
	}
	return out;
}
