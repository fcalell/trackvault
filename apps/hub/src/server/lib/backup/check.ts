import { Worker } from "node:worker_threads";
import { workerFile } from "../worker-file.ts";
import type { DatabaseCheck } from "./files.ts";

// `checkDatabase` on a worker thread: integrity_check reads the whole file, a second
// or two at 50k tracks, which would hold up everything else the hub does. The restore
// scripts, which run with the hub stopped, call `checkDatabase` directly.
export function checkDatabaseOffThread(
	path: string,
	signal?: AbortSignal,
): Promise<DatabaseCheck> {
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			workerFile("check-worker", new URL("./check-worker.ts", import.meta.url)),
			{ workerData: { path } },
		);
		const stop = (): void => {
			void worker.terminate();
			reject(signal?.reason ?? new Error("The check was cancelled"));
		};
		signal?.addEventListener("abort", stop, { once: true });
		const done = (): void => signal?.removeEventListener("abort", stop);
		worker.once(
			"message",
			(message: { check?: DatabaseCheck; error?: string }) => {
				done();
				if (message.check) resolve(message.check);
				else reject(new Error(message.error ?? "The check failed"));
			},
		);
		worker.once("error", (error) => {
			done();
			reject(error);
		});
		worker.once("exit", (code) => {
			done();
			if (code !== 0)
				reject(new Error(`check worker exited with code ${code}`));
		});
	});
}
