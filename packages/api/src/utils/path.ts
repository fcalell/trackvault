import * as path from "node:path";

export function isUnderDirectory(filePath: string, directory: string): boolean {
	const resolved = path.resolve(filePath);
	const resolvedDir = path.resolve(directory);
	return resolved.startsWith(`${resolvedDir}${path.sep}`);
}
