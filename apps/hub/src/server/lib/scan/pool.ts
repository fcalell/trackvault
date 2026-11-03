import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { analyzeFile, type FileAnalysis } from "@trackvault/core/analyze";
import { workerFile } from "../worker-file.ts";

export interface AnalyzeItem {
	path: string;
	abs: string;
}

export interface AnalyzeRequest {
	id: number;
	items: AnalyzeItem[];
}

export type AnalyzeOutcome =
	| { path: string; analysis: FileAnalysis }
	| { path: string; error: string };

// Files per message: big enough that the messaging is noise, small enough that
// the workers finish together.
const BATCH = 8;
// Fewer files than this are read on the calling thread: starting workers costs more.
const INLINE_BELOW = 24;

async function inline(item: AnalyzeItem): Promise<AnalyzeOutcome> {
	try {
		return { path: item.path, analysis: await analyzeFile(item.abs) };
	} catch (error) {
		return {
			path: item.path,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

// Reads `items` on a pool of worker threads (one per core) and hands the
// outcomes to `onOutcomes` batch by batch, in completion order. `onOutcomes`
// runs on the calling thread, one call at a time.
export async function analyzeAll(
	items: readonly AnalyzeItem[],
	onOutcomes: (outcomes: AnalyzeOutcome[]) => void,
	signal?: AbortSignal,
): Promise<void> {
	if (items.length === 0) return;
	if (items.length < INLINE_BELOW) {
		for (const item of items) {
			signal?.throwIfAborted();
			onOutcomes([await inline(item)]);
		}
		return;
	}

	const batches: AnalyzeItem[][] = [];
	for (let i = 0; i < items.length; i += BATCH)
		batches.push(items.slice(i, i + BATCH));
	const size = Math.min(availableParallelism(), batches.length);
	const workers: Worker[] = [];
	let cursor = 0;
	let failure: unknown;

	const lane = (worker: Worker) =>
		new Promise<void>((resolve, reject) => {
			let id = 0;
			const send = (): void => {
				if (
					failure !== undefined ||
					signal?.aborted ||
					cursor >= batches.length
				) {
					resolve();
					return;
				}
				const request: AnalyzeRequest = {
					id: id++,
					items: batches[cursor++] as AnalyzeItem[],
				};
				worker.postMessage(request);
			};
			worker.on("message", (message: { results: AnalyzeOutcome[] }) => {
				try {
					onOutcomes(message.results);
				} catch (error) {
					failure = error;
				}
				send();
			});
			worker.on("error", reject);
			worker.on("exit", (code) => {
				if (code !== 0)
					reject(new Error(`scan worker exited with code ${code}`));
			});
			send();
		});

	try {
		const lanes: Array<Promise<void>> = [];
		for (let i = 0; i < size; i++) {
			const worker = new Worker(
				workerFile(
					"analyze-worker",
					new URL("./analyze-worker.ts", import.meta.url),
				),
			);
			workers.push(worker);
			lanes.push(lane(worker));
		}
		await Promise.all(lanes);
		if (failure !== undefined) throw failure;
		signal?.throwIfAborted();
	} finally {
		await Promise.all(workers.map((worker) => worker.terminate()));
	}
}
