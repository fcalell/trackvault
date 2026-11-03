// A scan worker: reads the tags and hashes of the files it is handed.
import { parentPort } from "node:worker_threads";
import { analyzeFile } from "@trackvault/core/analyze";
import type { AnalyzeOutcome, AnalyzeRequest } from "./pool.ts";

const CONCURRENCY = 4;

async function one(item: {
	path: string;
	abs: string;
}): Promise<AnalyzeOutcome> {
	try {
		return { path: item.path, analysis: await analyzeFile(item.abs) };
	} catch (error) {
		return {
			path: item.path,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

parentPort?.on("message", async (request: AnalyzeRequest) => {
	const results: AnalyzeOutcome[] = new Array(request.items.length);
	let next = 0;
	const lanes = Array.from(
		{ length: Math.min(CONCURRENCY, request.items.length) },
		async () => {
			for (let i = next++; i < request.items.length; i = next++) {
				results[i] = await one(
					request.items[i] as { path: string; abs: string },
				);
			}
		},
	);
	await Promise.all(lanes);
	parentPort?.postMessage({ id: request.id, results });
});
