import { inflateSync } from "node:zlib";

// Rekordbox 6/7 encrypts master.db with SQLCipher 4 and one fixed passphrase that
// ships inside the application (it is the same on every install: not derived from
// the user, the machine or a password). The community recovered it; pyrekordbox
// (dylanljones/pyrekordbox, db6/database.py + utils.py) keeps it obfuscated as
// zlib -> XOR("657f48f84c437cc1") -> Base85 and deobfuscates it at runtime. This is
// the same procedure, so the passphrase is never written out in this file.
//
// Source: pyrekordbox 0.4.4 (`BLOB` in db6/database.py, `deobfuscate`/`BLOB_KEY`
// in utils.py). Checked here: the result is a 64 hex digit string starting "402fd".
const BLOB =
	"PN_Pq^*N>(JYe*u^8;Yg76HuZ<mR13S?=>)b9;DpoTXV(6ItkU`}8*m6tx_I{Solh_N#dfe{v=";
const XOR_KEY = Buffer.from("657f48f84c437cc1", "latin1");

// Python's base64.b85decode alphabet (RFC 1924).
const B85 =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";
const B85_INDEX = new Map<string, number>([...B85].map((c, i) => [c, i]));

function b85decode(text: string): Buffer {
	const out: number[] = [];
	for (let i = 0; i < text.length; i += 5) {
		const group = text.slice(i, i + 5);
		const pad = 5 - group.length;
		let acc = 0;
		for (let j = 0; j < 5; j++) {
			const ch = j < group.length ? group[j] : "~";
			const v = B85_INDEX.get(ch ?? "~");
			if (v === undefined) throw new Error("bad base85 character");
			acc = acc * 85 + v;
		}
		for (let j = 0; j < 4 - pad; j++) out.push((acc >>> (24 - 8 * j)) & 0xff);
	}
	return Buffer.from(out);
}

let cached: string | undefined;

// The master.db passphrase of Rekordbox 6/7. Override with `REKORDBOX_DB_KEY` or
// the `key` option of `openMasterDb` if a future Rekordbox rotates it.
export function masterDbKey(): string {
	if (cached) return cached;
	const data = b85decode(BLOB);
	for (let i = 0; i < data.length; i++) {
		data[i] = (data[i] ?? 0) ^ (XOR_KEY[i % XOR_KEY.length] ?? 0);
	}
	const key = inflateSync(data).toString("utf8");
	if (!/^[0-9a-f]{64}$/.test(key) || !key.startsWith("402fd")) {
		throw new Error("derived master.db key does not look valid");
	}
	cached = key;
	return key;
}
