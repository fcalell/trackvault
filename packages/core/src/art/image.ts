export interface ImageInfo {
	mime: "image/jpeg" | "image/png";
	width: number;
	height: number;
}

// Type and pixel size from the header bytes alone (JPEG SOFn, PNG IHDR).
export function imageInfo(data: Uint8Array): ImageInfo | null {
	const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	if (
		b.length > 24 &&
		b.readUInt32BE(0) === 0x89504e47 &&
		b.toString("latin1", 12, 16) === "IHDR"
	)
		return {
			mime: "image/png",
			width: b.readUInt32BE(16),
			height: b.readUInt32BE(20),
		};
	if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
		let i = 2;
		while (i + 9 < b.length) {
			if (b[i] !== 0xff) {
				i++;
				continue;
			}
			const marker = b[i + 1] as number;
			if (marker === 0xff) {
				i++;
				continue;
			}
			if (
				marker === 0xd8 ||
				(marker >= 0xd0 && marker <= 0xd7) ||
				marker === 0x01
			) {
				i += 2;
				continue;
			}
			const length = b.readUInt16BE(i + 2);
			// SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
			if (
				marker >= 0xc0 &&
				marker <= 0xcf &&
				![0xc4, 0xc8, 0xcc].includes(marker)
			)
				return {
					mime: "image/jpeg",
					height: b.readUInt16BE(i + 5),
					width: b.readUInt16BE(i + 7),
				};
			i += 2 + length;
		}
	}
	return null;
}
