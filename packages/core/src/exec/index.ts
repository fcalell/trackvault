import { spawn } from "node:child_process";

export interface RunOptions {
	timeoutMs: number;
	// Stdout past this many bytes is dropped and the process killed.
	maxStdoutBytes?: number;
	maxStderrBytes?: number;
}

export interface RunResult {
	// True when the binary does not exist or cannot be executed.
	missing: boolean;
	timedOut: boolean;
	code: number | null;
	stdout: Buffer;
	stderr: string;
}

export function run(
	command: string,
	args: readonly string[],
	options: RunOptions,
): Promise<RunResult> {
	const maxOut = options.maxStdoutBytes ?? 64 * 1024 * 1024;
	const maxErr = options.maxStderrBytes ?? 256 * 1024;
	return new Promise((resolve) => {
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		let outBytes = 0;
		let errBytes = 0;
		let timedOut = false;
		let missing = false;
		let settled = false;
		const child = spawn(command, [...args], {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		const finish = (code: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				missing,
				timedOut,
				code,
				stdout: Buffer.concat(out),
				stderr: Buffer.concat(err).toString("utf8"),
			});
		};
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, options.timeoutMs);
		child.stdout.on("data", (chunk: Buffer) => {
			outBytes += chunk.length;
			if (outBytes > maxOut) {
				child.kill("SIGKILL");
				return;
			}
			out.push(chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			if (errBytes >= maxErr) return;
			errBytes += chunk.length;
			err.push(chunk);
		});
		child.on("error", (e: NodeJS.ErrnoException) => {
			missing = e.code === "ENOENT" || e.code === "EACCES";
			finish(null);
		});
		child.on("close", (code) => finish(code));
	});
}

const probed = new Map<string, Promise<boolean>>();

// Whether `binary` runs (`<binary> <versionArg>` exits 0). Cached per binary.
export function binaryAvailable(
	binary: string,
	versionArg = "-version",
): Promise<boolean> {
	const key = `${binary}\0${versionArg}`;
	let found = probed.get(key);
	if (!found) {
		found = run(binary, [versionArg], { timeoutMs: 10_000 }).then(
			(r) => !r.missing && !r.timedOut && r.code === 0,
		);
		probed.set(key, found);
	}
	return found;
}
