import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Rekordbox 6/7 mirror the playlist tree in `masterPlaylists6.xml` next to
// master.db: one `<NODE Id="HEX" ParentId="HEX|0" Attribute="0|1|4" Timestamp="ms"
// Lib_Type="0" CheckType="0"/>` per playlist (pyrekordbox db6/aux_files.py
// `MasterPlaylistXml`). The writer keeps it in step with the database the way
// pyrekordbox does. Edited as text, so everything else in the file stays byte for
// byte as Rekordbox wrote it. The exact element layout is unverified (VERIFY.md).

export type PlaylistXmlOp =
	| {
			op: "add";
			id: string;
			parentId: string | null;
			attribute: number;
			at: number;
	  }
	| { op: "remove"; id: string }
	| { op: "update"; id: string; parentId: string | null; at: number };

const hex = (id: string): string => Number(id).toString(16).toUpperCase();

function nodeRe(id: string): RegExp {
	return new RegExp(
		`<NODE\\b[^>]*\\bId="${hex(id)}"[^>]*?/?>(?:\\s*</NODE>)?`,
		"i",
	);
}

function setAttr(node: string, name: string, value: string): string {
	const re = new RegExp(`(\\b${name}=")[^"]*(")`);
	return re.test(node) ? node.replace(re, `$1${value}$2`) : node;
}

// Applies the operations; returns false when the file does not exist (nothing to keep in step).
export async function applyMasterPlaylistsXml(
	dbDir: string,
	ops: readonly PlaylistXmlOp[],
): Promise<boolean> {
	if (ops.length === 0) return true;
	const path = join(dbDir, "masterPlaylists6.xml");
	let xml: string;
	try {
		xml = await readFile(path, "utf8");
	} catch {
		return false;
	}
	for (const o of ops) {
		const re = nodeRe(o.id);
		if (o.op === "add") {
			if (re.test(xml)) continue;
			const parent = o.parentId ? hex(o.parentId) : "0";
			const node = `<NODE Id="${hex(o.id)}" ParentId="${parent}" Attribute="${o.attribute}" Timestamp="${o.at}" Lib_Type="0" CheckType="0"/>`;
			xml = xml.replace(/<\/PLAYLISTS>/, `${node}</PLAYLISTS>`);
		} else if (o.op === "remove") {
			xml = xml.replace(re, "");
		} else {
			xml = xml.replace(re, (node) => {
				let next = setAttr(node, "Timestamp", String(o.at));
				next = setAttr(next, "ParentId", o.parentId ? hex(o.parentId) : "0");
				return next;
			});
		}
	}
	const tmp = `${path}.tv-tmp`;
	await writeFile(tmp, xml, "utf8");
	await rename(tmp, path);
	return true;
}
