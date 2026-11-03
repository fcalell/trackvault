// A backup-check worker: opens the file it is given read-only and runs the database
// check (integrity_check scans every page), so the hub's own thread keeps serving.
import { parentPort, workerData } from "node:worker_threads";
import { checkDatabase } from "./files.ts";

const { path } = workerData as { path: string };
try {
	parentPort?.postMessage({ check: checkDatabase(path) });
} catch (error) {
	parentPort?.postMessage({
		error: error instanceof Error ? error.message : String(error),
	});
}
