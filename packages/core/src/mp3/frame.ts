// MPEG audio frame headers and the layout of an MP3 file: where the ID3v2 tag
// ends, where the first frame starts, whether it is a Xing/Info/VBRI header
// frame, and where the trailing ID3v1/APE/ID3v2 tags begin. The audio hash and
// the audio info both stand on this, so a tag edit never moves what they read.

const BITRATES = {
	// [version][layer] in kbit/s; index 0 is "free", 15 is invalid.
	v1: {
		1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
		2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
		3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
	},
	v2: {
		1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
		2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
		3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
	},
} as const;

const SAMPLE_RATES = {
	1: [44100, 48000, 32000],
	2: [22050, 24000, 16000],
	2.5: [11025, 12000, 8000],
} as const;

export interface FrameHeader {
	version: 1 | 2 | 2.5;
	layer: 1 | 2 | 3;
	bitrateKbps: number;
	sampleRate: number;
	channels: 1 | 2;
	samplesPerFrame: number;
	length: number;
	crcProtected: boolean;
}

// The header at `b[o]`, or null when those four bytes are no valid frame.
export function parseFrameHeader(b: Uint8Array, o: number): FrameHeader | null {
	if (o + 4 > b.length) return null;
	const b0 = b[o] as number;
	const b1 = b[o + 1] as number;
	const b2 = b[o + 2] as number;
	const b3 = b[o + 3] as number;
	if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
	const versionBits = (b1 >> 3) & 3;
	const layerBits = (b1 >> 1) & 3;
	if (versionBits === 1 || layerBits === 0) return null;
	const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
	const layer = (4 - layerBits) as 1 | 2 | 3;
	const bitrateIndex = b2 >> 4;
	const rateIndex = (b2 >> 2) & 3;
	if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
	const table = BITRATES[version === 1 ? "v1" : "v2"][layer];
	const bitrateKbps = table[bitrateIndex] as number;
	const sampleRate = SAMPLE_RATES[version][rateIndex] as number;
	const padding = (b2 >> 1) & 1;
	const samplesPerFrame =
		layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152;
	let length: number;
	if (layer === 1) {
		length = (Math.floor((12 * bitrateKbps * 1000) / sampleRate) + padding) * 4;
	} else {
		const coefficient = layer === 3 && version !== 1 ? 72 : 144;
		length =
			Math.floor((coefficient * bitrateKbps * 1000) / sampleRate) + padding;
	}
	return {
		version,
		layer,
		bitrateKbps,
		sampleRate,
		channels: b3 >> 6 === 3 ? 1 : 2,
		samplesPerFrame,
		length,
		crcProtected: (b1 & 1) === 0,
	};
}

export interface VbrHeader {
	kind: "Xing" | "Info" | "VBRI";
	frames: number | null;
	bytes: number | null;
}

// A Xing/Info/VBRI header inside the first frame `b[o..]`, or null.
export function parseVbrHeader(
	b: Uint8Array,
	o: number,
	header: FrameHeader,
): VbrHeader | null {
	const at = (offset: number, text: string): boolean => {
		for (let i = 0; i < text.length; i++) {
			if (b[o + offset + i] !== text.charCodeAt(i)) return false;
		}
		return true;
	};
	const u32 = (offset: number): number =>
		(((b[o + offset] as number) << 24) |
			((b[o + offset + 1] as number) << 16) |
			((b[o + offset + 2] as number) << 8) |
			(b[o + offset + 3] as number)) >>>
		0;
	if (o + header.length > b.length) return null;
	if (at(36, "VBRI")) return { kind: "VBRI", bytes: u32(46), frames: u32(50) };
	const side =
		header.version === 1
			? header.channels === 1
				? 17
				: 32
			: header.channels === 1
				? 9
				: 17;
	const xing = 4 + (header.crcProtected ? 2 : 0) + side;
	const kind = at(xing, "Xing") ? "Xing" : at(xing, "Info") ? "Info" : null;
	if (kind === null) return null;
	const flags = u32(xing + 4);
	let cursor = xing + 8;
	let frames: number | null = null;
	let bytes: number | null = null;
	if (flags & 1) {
		frames = u32(cursor);
		cursor += 4;
	}
	if (flags & 2) bytes = u32(cursor);
	return { kind, frames, bytes };
}

export function syncsafe(b: Uint8Array, o: number): number {
	return (
		(((b[o] as number) & 0x7f) << 21) |
		(((b[o + 1] as number) & 0x7f) << 14) |
		(((b[o + 2] as number) & 0x7f) << 7) |
		((b[o + 3] as number) & 0x7f)
	);
}

export function isId3v2Header(b: Uint8Array, o: number): boolean {
	return (
		b[o] === 0x49 &&
		b[o + 1] === 0x44 &&
		b[o + 2] === 0x33 &&
		(b[o + 3] as number) < 0xff &&
		(b[o + 4] as number) < 0xff &&
		((b[o + 6] as number) |
			(b[o + 7] as number) |
			(b[o + 8] as number) |
			(b[o + 9] as number)) <
			0x80
	);
}
