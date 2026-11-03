import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// core/analysis runs `ffmpeg` itself; this wrapper puts it at the lowest CPU
// priority so a background analysis never slows a scan, a download or the browser.
export async function niceFfmpeg(): Promise<string> {
	const file = process.env.DB_FILE;
	if (!file) throw new Error("DB_FILE is not set");
	const script = join(dirname(file), "bin", "ffmpeg-nice");
	await mkdir(dirname(script), { recursive: true });
	await writeFile(script, '#!/bin/sh\nexec nice -n 19 ffmpeg "$@"\n');
	await chmod(script, 0o755);
	return script;
}
