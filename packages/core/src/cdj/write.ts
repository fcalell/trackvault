import {
	encodeString,
	FLAG_DATA,
	FLAG_INDEX,
	PAGE_HEADER,
	PAGE_SIZE,
	PageType,
	ROW_GROUP,
	TABLE_COUNT,
	TRACK_FIXED,
	TRACK_STRINGS,
	TrackString,
} from "./format.ts";
import type { Pdb, PdbTrack } from "./types.ts";

export type PdbInput = Omit<
	Pdb,
	"tables" | "pageSize" | "nextUnusedPage" | "sequence"
> & {
	sequence?: number;
};

const align4 = (n: number) => (n + 3) & ~3;

function row(size: number, fill: (b: Buffer) => number | undefined): Buffer {
	const b = Buffer.alloc(size);
	const used = fill(b);
	return used === undefined ? b : b.subarray(0, align4(used));
}

// Fixed head, then strings; the row is padded to 4 bytes.
function withString(
	head: number,
	name: string,
	fill: (b: Buffer) => void,
): Buffer {
	const s = encodeString(name);
	const b = Buffer.alloc(align4(head + s.length));
	fill(b);
	s.copy(b, head);
	return b;
}

function trackRow(t: PdbTrack, slot: number): Buffer {
	const strings: string[] = new Array(TRACK_STRINGS).fill("");
	strings[TrackString.kuvoPublic] = "";
	strings[TrackString.autoloadHotCues] = "ON";
	strings[TrackString.dateAdded] = t.dateAdded;
	strings[TrackString.releaseDate] = t.releaseDate;
	strings[TrackString.mixName] = t.mixName;
	strings[TrackString.analyzePath] = t.analyzePath;
	strings[TrackString.analyzeDate] = t.analyzeDate;
	strings[TrackString.comment] = t.comment;
	strings[TrackString.title] = t.title;
	strings[TrackString.filename] = t.filename;
	strings[TrackString.filePath] = t.filePath;
	const encoded = strings.map(encodeString);
	let size = TRACK_FIXED;
	const offsets = encoded.map((e) => {
		const at = size;
		size += e.length;
		return at;
	});
	const b = Buffer.alloc(align4(size));
	b.writeUInt16LE(0x24, 0);
	b.writeUInt16LE(slot * 0x20, 2);
	// bitmask: seen as 0x000c0700 in exports of MP3s; meaning unknown (guess, see VERIFY.md)
	b.writeUInt32LE(0x000c0700, 4);
	b.writeUInt32LE(t.sampleRate, 0x08);
	b.writeUInt32LE(t.composerId, 0x0c);
	b.writeUInt32LE(t.fileSize, 0x10);
	b.writeUInt32LE(0, 0x14);
	b.writeUInt16LE(19048, 0x18);
	b.writeUInt16LE(30967, 0x1a);
	b.writeUInt32LE(t.artworkId, 0x1c);
	b.writeUInt32LE(t.keyId, 0x20);
	b.writeUInt32LE(t.originalArtistId, 0x24);
	b.writeUInt32LE(t.labelId, 0x28);
	b.writeUInt32LE(t.remixerId, 0x2c);
	b.writeUInt32LE(t.bitrate, 0x30);
	b.writeUInt32LE(t.trackNumber, 0x34);
	b.writeUInt32LE(t.tempo, 0x38);
	b.writeUInt32LE(t.genreId, 0x3c);
	b.writeUInt32LE(t.albumId, 0x40);
	b.writeUInt32LE(t.artistId, 0x44);
	b.writeUInt32LE(t.id, 0x48);
	b.writeUInt16LE(t.discNumber, 0x4c);
	b.writeUInt16LE(Math.min(t.playCount, 0xffff), 0x4e);
	b.writeUInt16LE(t.year, 0x50);
	b.writeUInt16LE(t.sampleDepth, 0x52);
	b.writeUInt16LE(Math.min(t.durationSec, 0xffff), 0x54);
	b.writeUInt16LE(41, 0x56);
	b.writeUInt8(t.colorId, 0x58);
	b.writeUInt8(t.rating, 0x59);
	b.writeUInt16LE(1, 0x5a);
	b.writeUInt16LE(slot % 2 === 0 ? 3 : 2, 0x5c);
	offsets.forEach((o, i) => {
		b.writeUInt16LE(o, 0x5e + 2 * i);
		encoded[i]?.copy(b, o);
	});
	return b;
}

// Packs rows into pages of PAGE_SIZE: the heap grows from the header, the row index
// (groups of 16 offsets + presence flags, 0x24 bytes each) from the page end.
function packPages(rows: Buffer[]): Buffer[][] {
	const pages: Buffer[][] = [];
	let cur: Buffer[] = [];
	let used = 0;
	for (const r of rows) {
		if (PAGE_HEADER + r.length + ROW_GROUP > PAGE_SIZE)
			throw new Error(
				`a row of ${r.length} bytes does not fit a ${PAGE_SIZE}-byte page`,
			);
		const groups = Math.ceil((cur.length + 1) / 16);
		if (
			PAGE_HEADER + used + r.length + groups * ROW_GROUP > PAGE_SIZE &&
			cur.length > 0
		) {
			pages.push(cur);
			cur = [];
			used = 0;
		}
		cur.push(r);
		used += r.length;
	}
	if (cur.length > 0) pages.push(cur);
	return pages;
}

function buildPage(
	index: number,
	type: number,
	next: number,
	flags: number,
	rows: Buffer[],
	sequence: number,
): Buffer {
	const page = Buffer.alloc(PAGE_SIZE);
	page.writeUInt32LE(index, 4);
	page.writeUInt32LE(type, 8);
	page.writeUInt32LE(next, 0x0c);
	page.writeUInt32LE(sequence, 0x10);
	const n = rows.length;
	page.writeUIntLE(n | (n << 13), 0x18, 3);
	page[0x1b] = flags;
	let heap = 0;
	rows.forEach((r, i) => {
		r.copy(page, PAGE_HEADER + heap);
		const g = Math.floor(i / 16);
		const base = PAGE_SIZE - g * ROW_GROUP;
		page.writeUInt16LE(heap, base - 6 - 2 * (i % 16));
		page.writeUInt16LE(page.readUInt16LE(base - 4) | (1 << (i % 16)), base - 4);
		heap += r.length;
	});
	const groups = Math.ceil(n / 16);
	page.writeUInt16LE(PAGE_SIZE - PAGE_HEADER - heap - groups * ROW_GROUP, 0x1c);
	page.writeUInt16LE(heap, 0x1e);
	return page;
}

// A complete export.pdb for the content: header page, then per table one index page and
// its data pages. All 20 table types are listed (the ones the model does not fill are
// empty) the way a Rekordbox export lists them.
export function buildPdb(content: PdbInput): Buffer {
	const sequence = content.sequence ?? 1;
	const specs = new Map<number, Buffer[]>();
	specs.set(
		PageType.tracks,
		content.tracks.map((t, i) => trackRow(t, i % 16)),
	);
	specs.set(
		PageType.artists,
		content.artists.map((a, i) =>
			withString(0x0a, a.name, (b) => {
				b.writeUInt16LE(0x60, 0);
				b.writeUInt16LE((i % 16) * 0x20, 2);
				b.writeUInt32LE(a.id, 4);
				b[8] = 3;
				b[9] = 0x0a;
			}),
		),
	);
	specs.set(
		PageType.albums,
		content.albums.map((a, i) =>
			withString(0x16, a.name, (b) => {
				b.writeUInt16LE(0x80, 0);
				b.writeUInt16LE((i % 16) * 0x20, 2);
				b.writeUInt32LE(a.artistId, 8);
				b.writeUInt32LE(a.id, 0x0c);
				b[0x14] = 3;
				b[0x15] = 0x16;
			}),
		),
	);
	specs.set(
		PageType.genres,
		content.genres.map((g) =>
			withString(4, g.name, (b) => b.writeUInt32LE(g.id, 0)),
		),
	);
	specs.set(
		PageType.labels,
		content.labels.map((g) =>
			withString(4, g.name, (b) => b.writeUInt32LE(g.id, 0)),
		),
	);
	specs.set(
		PageType.keys,
		content.keys.map((k) =>
			withString(8, k.name, (b) => {
				b.writeUInt32LE(k.id, 0);
				b.writeUInt32LE(k.id, 4);
			}),
		),
	);
	specs.set(
		PageType.colors,
		content.colors.map((c) =>
			withString(8, c.name, (b) => {
				b.writeUInt8(1, 4);
				b.writeUInt16LE(c.id, 5);
			}),
		),
	);
	specs.set(
		PageType.artwork,
		content.artwork.map((a) =>
			withString(4, a.path, (b) => b.writeUInt32LE(a.id, 0)),
		),
	);
	specs.set(
		PageType.playlistTree,
		content.playlistTree.map((p) =>
			withString(0x14, p.name, (b) => {
				b.writeUInt32LE(p.parentId, 0);
				b.writeUInt32LE(p.sortOrder, 8);
				b.writeUInt32LE(p.id, 0x0c);
				b.writeUInt32LE(p.isFolder ? 1 : 0, 0x10);
			}),
		),
	);
	specs.set(
		PageType.playlistEntries,
		content.playlistEntries.map((e) =>
			row(12, (b) => {
				b.writeUInt32LE(e.index, 0);
				b.writeUInt32LE(e.trackId, 4);
				b.writeUInt32LE(e.playlistId, 8);
				return 12;
			}),
		),
	);

	// layout: page 0 header, then each table's index page and data pages in turn
	const chunks: Buffer[] = [];
	const tableRefs: { type: number; first: number; last: number }[] = [];
	const plan = Array.from({ length: TABLE_COUNT }, (_, type) => ({
		type,
		pages: packPages(specs.get(type) ?? []),
	}));
	let next = 1;
	const placed = plan.map((t) => {
		const first = next;
		next += 1 + t.pages.length;
		return { ...t, first, last: t.pages.length === 0 ? first : next - 1 };
	});
	const total = next;
	for (const t of placed) {
		const afterIndex = t.pages.length === 0 ? total : t.first + 1;
		chunks.push(
			buildPage(t.first, t.type, afterIndex, FLAG_INDEX, [], sequence),
		);
		t.pages.forEach((rows, i) => {
			const idx = t.first + 1 + i;
			const nextPage = i === t.pages.length - 1 ? total : idx + 1;
			chunks.push(buildPage(idx, t.type, nextPage, FLAG_DATA, rows, sequence));
		});
		tableRefs.push({ type: t.type, first: t.first, last: t.last });
	}

	const head = Buffer.alloc(PAGE_SIZE);
	head.writeUInt32LE(PAGE_SIZE, 4);
	head.writeUInt32LE(TABLE_COUNT, 8);
	head.writeUInt32LE(total, 12);
	head.writeUInt32LE(5, 0x10);
	head.writeUInt32LE(sequence + 1, 0x14);
	tableRefs.forEach((t, i) => {
		const at = 0x1c + i * 16;
		head.writeUInt32LE(t.type, at);
		head.writeUInt32LE(total, at + 4);
		head.writeUInt32LE(t.first, at + 8);
		head.writeUInt32LE(t.last, at + 12);
	});
	return Buffer.concat([head, ...chunks]);
}
