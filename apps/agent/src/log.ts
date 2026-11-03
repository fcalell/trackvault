import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;

export interface Logger {
	debug(message: string): void;
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	child(scope: string): Logger;
	close(): Promise<void>;
}

// The key never reaches a log line.
function scrub(message: string): string {
	return message.replace(/stk_[A-Za-z0-9_-]+/g, "stk_***");
}

class FileLogger implements Logger {
	private stream: WriteStream | null = null;
	private written = 0;
	private rotating: Promise<void> | null = null;
	private readonly file: string | null;
	private readonly level: Level;
	private readonly scope: string;
	private readonly root: FileLogger | null;

	constructor(
		file: string | null,
		level: Level,
		scope = "agent",
		root: FileLogger | null = null,
	) {
		this.file = file;
		this.level = level;
		this.scope = scope;
		this.root = root;
	}

	async open(): Promise<void> {
		if (!this.file) return;
		await mkdir(dirname(this.file), { recursive: true });
		try {
			this.written = (await stat(this.file)).size;
		} catch {
			this.written = 0;
		}
		if (this.written > MAX_BYTES) await this.rotate();
		else this.stream = createWriteStream(this.file, { flags: "a" });
	}

	private async rotate(): Promise<void> {
		if (!this.file) return;
		await new Promise<void>((resolve) =>
			this.stream ? this.stream.end(resolve) : resolve(),
		);
		this.stream = null;
		for (let i = KEEP - 1; i >= 1; i--) {
			await rename(`${this.file}.${i}`, `${this.file}.${i + 1}`).catch(
				() => {},
			);
		}
		await rename(this.file, `${this.file}.1`).catch(() => {});
		await rm(`${this.file}.${KEEP + 1}`, { force: true });
		this.written = 0;
		this.stream = createWriteStream(this.file, { flags: "a" });
	}

	private write(level: Level, message: string): void {
		if (ORDER[level] < ORDER[this.level]) return;
		const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${this.scope}] ${scrub(message)}\n`;
		(level === "error" || level === "warn"
			? process.stderr
			: process.stdout
		).write(line);
		const sink = this.root ?? this;
		sink.stream?.write(line);
		sink.written += line.length;
		if (sink.written > MAX_BYTES && !sink.rotating) {
			sink.rotating = sink.rotate().finally(() => {
				sink.rotating = null;
			});
		}
	}

	debug(message: string) {
		this.write("debug", message);
	}
	info(message: string) {
		this.write("info", message);
	}
	warn(message: string) {
		this.write("warn", message);
	}
	error(message: string) {
		this.write("error", message);
	}
	child(scope: string): Logger {
		return new FileLogger(null, this.level, scope, this.root ?? this);
	}
	async close(): Promise<void> {
		const sink = this.root ?? this;
		await new Promise<void>((resolve) =>
			sink.stream ? sink.stream.end(resolve) : resolve(),
		);
		sink.stream = null;
	}
}

export async function createLogger(
	file: string | null,
	level: Level = "info",
): Promise<Logger> {
	const logger = new FileLogger(file, level);
	await logger.open();
	return logger;
}

export type { Level };
