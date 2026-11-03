import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	hkdfSync,
	randomBytes,
} from "node:crypto";
import { open } from "node:fs/promises";

// Client-side encryption for what leaves the hub: AES-256-GCM in 1 MiB chunks, so a
// big file is encrypted, uploaded in parts and decrypted as a stream, and any byte
// range of the ciphertext can be produced without reading the file from the start.
//
// Layout: "TVE1" | chunk size u32 | salt 16 | chunks...
// A chunk is ciphertext + 16 byte tag. The file key is HKDF(master, salt); the IV is
// the chunk number; the additional data is one byte, 1 on the last chunk, so a file
// cut short or chunks put in another order fail to decrypt.
//
// What it does not do: hide the object's size (to within 16 bytes per MiB) or its
// key name (`audio/<audio hash>.<ext>`: the hash is of the audio, not the tags), nor
// does it protect a key that is lost: the key lives in the hub's settings, which a
// database backup carries, so a copy of the key kept elsewhere is what restores a
// library after losing the hub.

export const MAGIC = "TVE1";
export const HEADER = 24;
export const CHUNK = 1024 * 1024;
const TAG = 16;

export const encryptedSize = (plain: number): number =>
	HEADER + plain + TAG * Math.max(1, Math.ceil(plain / CHUNK));

export const newKey = (): string => randomBytes(32).toString("hex");

export const isKey = (value: string): boolean => /^[0-9a-f]{64}$/i.test(value);

// Short, non-reversible: tells a wrong key from a right one.
export const keyCheck = (key: string): string =>
	createHmac("sha256", Buffer.from(key, "hex"))
		.update("trackvault-key-check")
		.digest("hex")
		.slice(0, 16);

function fileKey(master: string, salt: Buffer): Buffer {
	return Buffer.from(
		hkdfSync(
			"sha256",
			Buffer.from(master, "hex"),
			salt,
			"trackvault-offsite-v1",
			32,
		),
	);
}

function iv(index: number): Buffer {
	const out = Buffer.alloc(12);
	out.writeBigUInt64BE(BigInt(index), 4);
	return out;
}

function header(salt: Buffer): Buffer {
	const out = Buffer.alloc(HEADER);
	out.write(MAGIC, 0, "ascii");
	out.writeUInt32BE(CHUNK, 4);
	salt.copy(out, 8);
	return out;
}

// Bytes by range: a file on disk, a buffer, or another source encrypted.
export interface ByteSource {
	readonly size: number;
	// Hex of the salt of an encrypted source; absent for plain ones.
	readonly salt?: string;
	read(start: number, end: number): Promise<Buffer>;
	close?(): Promise<void>;
}

export class BufferSource implements ByteSource {
	private readonly data: Buffer;
	constructor(data: Buffer) {
		this.data = data;
	}
	get size(): number {
		return this.data.length;
	}
	async read(start: number, end: number): Promise<Buffer> {
		return this.data.subarray(start, end);
	}
}

export class FileSource implements ByteSource {
	private readonly fh: Awaited<ReturnType<typeof open>>;
	readonly size: number;
	private constructor(fh: Awaited<ReturnType<typeof open>>, size: number) {
		this.fh = fh;
		this.size = size;
	}
	static async open(path: string): Promise<FileSource> {
		const fh = await open(path, "r");
		return new FileSource(fh, (await fh.stat()).size);
	}
	async read(start: number, end: number): Promise<Buffer> {
		const length = Math.min(end, this.size) - start;
		const buffer = Buffer.allocUnsafe(Math.max(0, length));
		let done = 0;
		while (done < length) {
			const { bytesRead } = await this.fh.read(
				buffer,
				done,
				length - done,
				start + done,
			);
			if (bytesRead === 0)
				throw new Error("The file changed while it was read");
			done += bytesRead;
		}
		return buffer;
	}
	async close(): Promise<void> {
		await this.fh.close();
	}
}

export class EncryptedSource implements ByteSource {
	readonly size: number;
	readonly salt: string;
	private readonly saltBytes: Buffer;
	private readonly key: Buffer;
	private readonly inner: ByteSource;
	constructor(inner: ByteSource, master: string, salt?: string) {
		this.inner = inner;
		this.saltBytes = salt ? Buffer.from(salt, "hex") : randomBytes(16);
		this.salt = this.saltBytes.toString("hex");
		this.key = fileKey(master, this.saltBytes);
		this.size = encryptedSize(inner.size);
	}

	private async chunk(index: number): Promise<Buffer> {
		const start = index * CHUNK;
		const plain = await this.inner.read(
			start,
			Math.min(start + CHUNK, this.inner.size),
		);
		const last = start + CHUNK >= this.inner.size;
		const cipher = createCipheriv("aes-256-gcm", this.key, iv(index));
		cipher.setAAD(Buffer.from([last ? 1 : 0]));
		return Buffer.concat([
			cipher.update(plain),
			cipher.final(),
			cipher.getAuthTag(),
		]);
	}

	async read(start: number, end: number): Promise<Buffer> {
		end = Math.min(end, this.size);
		const out: Buffer[] = [];
		let at = start;
		if (at < HEADER) {
			out.push(header(this.saltBytes).subarray(at, Math.min(end, HEADER)));
			at = HEADER;
		}
		const unit = CHUNK + TAG;
		while (at < end) {
			const index = Math.floor((at - HEADER) / unit);
			const chunkStart = HEADER + index * unit;
			const block = await this.chunk(index);
			out.push(
				block.subarray(
					at - chunkStart,
					Math.min(end - chunkStart, block.length),
				),
			);
			at = chunkStart + block.length;
		}
		return Buffer.concat(out);
	}

	async close(): Promise<void> {
		await this.inner.close?.();
	}
}

export class WrongKeyError extends Error {
	constructor() {
		super(
			"The encryption key does not open this file (wrong key, or the file is damaged)",
		);
		this.name = "WrongKeyError";
	}
}

// Decrypts a whole file's bytes, chunk by chunk, to `write`.
export async function decryptTo(
	source: ByteSource,
	master: string,
	write: (plain: Buffer) => Promise<void>,
): Promise<void> {
	const head = await source.read(0, HEADER);
	if (head.length < HEADER || head.toString("ascii", 0, 4) !== MAGIC)
		throw new Error("This is not an encrypted TrackVault file");
	const chunk = head.readUInt32BE(4);
	const key = fileKey(master, head.subarray(8, 24));
	const unit = chunk + TAG;
	let at = HEADER;
	for (let index = 0; at < source.size; index++) {
		const block = await source.read(at, Math.min(at + unit, source.size));
		const last = at + block.length >= source.size;
		const decipher = createDecipheriv("aes-256-gcm", key, iv(index));
		decipher.setAAD(Buffer.from([last ? 1 : 0]));
		decipher.setAuthTag(block.subarray(block.length - TAG));
		try {
			await write(
				Buffer.concat([
					decipher.update(block.subarray(0, block.length - TAG)),
					decipher.final(),
				]),
			);
		} catch (error) {
			if (error instanceof Error && /authenticate|auth/i.test(error.message))
				throw new WrongKeyError();
			throw error;
		}
		at += block.length;
	}
}

export async function decryptBuffer(
	data: Buffer,
	master: string,
): Promise<Buffer> {
	const parts: Buffer[] = [];
	await decryptTo(new BufferSource(data), master, async (p) => {
		parts.push(p);
	});
	return Buffer.concat(parts);
}
