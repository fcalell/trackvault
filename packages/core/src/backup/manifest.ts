import { gunzipSync, gzipSync } from "node:zlib";

// The index of what is offsite, written after every sync as `manifest/latest.json.gz`
// (encrypted when the objects are). A new box restores from it: the newest database
// backup, then every library file under its path, with the hashes to check each
// download against.

export interface ManifestFile {
	// Relative to the library root, "/" separated.
	path: string;
	// The object is `audio/<audioHash>.<ext>`.
	audioHash: string;
	fileHash: string;
	ext: string;
	size: number;
}

export interface ManifestDatabase {
	key: string;
	size: number;
	sha256?: string;
	takenAt: string;
	compression: "zstd" | "gzip" | "none";
	encrypted: boolean;
}

export interface Manifest {
	format: 1;
	createdAt: string;
	encrypted: boolean;
	keyCheck?: string;
	databases: ManifestDatabase[];
	files: ManifestFile[];
}

export const MANIFEST_KEY = "manifest/latest.json.gz";
export const audioKey = (file: { audioHash: string; ext: string }): string =>
	`audio/${file.audioHash}.${file.ext}`;

export const packManifest = (manifest: Manifest): Buffer =>
	gzipSync(Buffer.from(JSON.stringify(manifest)));

export function unpackManifest(data: Buffer): Manifest {
	const manifest = JSON.parse(gunzipSync(data).toString("utf8")) as Manifest;
	if (manifest.format !== 1) throw new Error("Unknown manifest format");
	return manifest;
}
