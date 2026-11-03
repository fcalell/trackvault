// Pioneer "DeviceSQL" export.pdb: constants, the string codec and the page geometry.
//
// Source: Deep Symmetry crate-digger `rekordbox_pdb.ksy` (the Kaitai spec) and
// rekordcrate 0.2.0 `src/pdb`, both read on the build box. All integers are
// little-endian (unlike ANLZ, which is big-endian). See VERIFY.md for what is checked.

export const PAGE_SIZE = 4096;
export const PAGE_HEADER = 0x28;
export const ROW_GROUP = 0x24;
export const TABLE_COUNT = 20;

export const PageType = {
	tracks: 0,
	genres: 1,
	artists: 2,
	albums: 3,
	labels: 4,
	keys: 5,
	colors: 6,
	playlistTree: 7,
	playlistEntries: 8,
	historyPlaylists: 11,
	historyEntries: 12,
	artwork: 13,
	columns: 16,
	history: 19,
} as const;

// page_flags: bit 0x40 set = an index ("strange") page that holds no rows.
export const FLAG_DATA = 0x34;
export const FLAG_INDEX = 0x64;

// Offsets of the 21 string slots of a track row (index into ofs_strings).
export const TrackString = {
	isrc: 0,
	texter: 1,
	message: 5,
	kuvoPublic: 6,
	autoloadHotCues: 7,
	dateAdded: 10,
	releaseDate: 11,
	mixName: 12,
	analyzePath: 14,
	analyzeDate: 15,
	comment: 16,
	title: 17,
	filename: 19,
	filePath: 20,
} as const;
export const TRACK_STRINGS = 21;
export const TRACK_FIXED = 0x88;

// A DeviceSQL string: ASCII up to 126 chars inline (header byte = (len+1)<<1 | 1),
// else 0x40 + u16 total length + pad byte + ASCII, or 0x90 + same header + UTF-16LE.
export function encodeString(text: string): Buffer {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range test
	const ascii = /^[\u0000-\u007f]*$/.test(text);
	if (ascii && text.length <= 126) {
		const out = Buffer.alloc(text.length + 1);
		out[0] = ((text.length + 1) << 1) | 1;
		out.write(text, 1, "latin1");
		return out;
	}
	const body = ascii
		? Buffer.from(text, "latin1")
		: Buffer.from(text, "utf16le");
	const total = body.length + 4;
	if (total > 0xffff) throw new Error("string too long for a DeviceSQL string");
	const out = Buffer.alloc(total);
	out[0] = ascii ? 0x40 : 0x90;
	out.writeUInt16LE(total, 1);
	body.copy(out, 4);
	return out;
}

export function decodeString(buf: Buffer, at: number): string {
	if (at < 0 || at >= buf.length) return "";
	const kind = buf[at] as number;
	if (kind === 0x40 || kind === 0x90) {
		if (at + 4 > buf.length) return "";
		const total = buf.readUInt16LE(at + 1);
		const end = Math.min(buf.length, at + total);
		return kind === 0x40
			? buf.toString("latin1", at + 4, end)
			: buf.toString("utf16le", at + 4, end - ((end - at - 4) % 2));
	}
	if ((kind & 1) === 1) {
		const len = (kind >> 1) - 1;
		return buf.toString("latin1", at + 1, Math.min(buf.length, at + 1 + len));
	}
	return "";
}
