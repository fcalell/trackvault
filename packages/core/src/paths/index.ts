import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

// Whether `candidate` is `root` or inside it, by path alone (no symlinks).
export function isUnderRoot(root: string, candidate: string): boolean {
	const rel = relative(resolve(root), resolve(candidate));
	return (
		rel === "" ||
		(!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
	);
}

// Joins relative segments onto the root and refuses anything that leaves it:
// "..", an absolute segment, a NUL byte.
export function safeJoin(root: string, ...segments: string[]): string {
	for (const segment of segments) {
		if (segment.includes("\0")) throw new Error("path contains a NUL byte");
		if (isAbsolute(segment)) throw new Error(`path is absolute: ${segment}`);
	}
	const joined = resolve(join(root, ...segments));
	if (!isUnderRoot(root, joined))
		throw new Error(`path leaves the library root: ${segments.join("/")}`);
	return joined;
}

// The root-relative path with "/" separators, the form the database stores.
export function toRelative(root: string, absolute: string): string {
	if (!isUnderRoot(root, absolute))
		throw new Error(`path is outside the library root: ${absolute}`);
	return relative(resolve(root), resolve(absolute)).split(sep).join("/");
}

// Like `isUnderRoot` after resolving symlinks, so a link cannot lead out of the root.
export async function isUnderRootReal(
	root: string,
	candidate: string,
): Promise<boolean> {
	try {
		return isUnderRoot(await realpath(root), await realpath(candidate));
	} catch {
		return false;
	}
}

const RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this strips
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const MAX_NAME_BYTES = 200;

// A file or folder name every filesystem the library syncs to accepts: no
// separators or reserved characters, no trailing dot or space, no reserved
// Windows device name, at most 200 UTF-8 bytes (the extension survives).
export function sanitizeFilename(name: string, fallback = "untitled"): string {
	let clean = name
		.normalize("NFC")
		.replace(ILLEGAL, "_")
		.replace(/\s+/g, " ")
		.trim();
	clean = clean.replace(/^\.+/, "").replace(/[. ]+$/, "");
	if (clean === "") return fallback;
	if (RESERVED_NAMES.test(clean)) clean = `_${clean}`;
	const encoder = new TextEncoder();
	if (encoder.encode(clean).length <= MAX_NAME_BYTES) return clean;
	const dot = clean.lastIndexOf(".");
	const extension = dot > 0 && clean.length - dot <= 8 ? clean.slice(dot) : "";
	let stem = extension ? clean.slice(0, dot) : clean;
	const budget = MAX_NAME_BYTES - encoder.encode(extension).length;
	while (encoder.encode(stem).length > budget) stem = stem.slice(0, -1);
	return `${stem.trimEnd().replace(/[. ]+$/, "")}${extension}`;
}
