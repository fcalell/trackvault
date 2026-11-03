import { type FSWatcher, watch } from "node:fs";
import { sep } from "node:path";
import { defineService } from "@fcalell/plugin-node/server";
import { AUDIO_EXTENSIONS } from "@trackvault/core/tags";
import scan, { type ScanPayload } from "../jobs/scan.ts";
import { isInboxPath } from "../lib/inbox/paths.ts";
import { readSettings } from "../lib/settings.ts";
import { requestInboxSoon } from "./inbox.ts";
import { enqueue } from "./jobs.ts";

// Events settle this long before the scan they cause starts.
const DEBOUNCE_MS = 2000;
// More changed paths than this is a full pass: cheaper than many small ones.
const MAX_PATHS = 200;
// The safety net under the watcher, which can miss events (overflow, network mounts).
const RECONCILE_MS = 15 * 60 * 1000;

let watcher: FSWatcher | null = null;
let root: string | null = null;
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let reconcile: ReturnType<typeof setInterval> | null = null;
let log: (message: string) => void = () => {};

const isFullScan = (payload: ScanPayload): boolean =>
	!payload.paths || payload.paths.length === 0;

// Queues a scan of the whole library, or of `paths`. A full scan already waiting
// or running covers any request, and is returned instead of a second job.
export function requestScan(paths?: string[]) {
	return enqueue(scan, paths && paths.length > 0 ? { paths } : {}, {
		reuse: (existing) =>
			isFullScan(existing) ||
			(paths?.every((p) => existing.paths?.includes(p)) ?? false),
	});
}

function flushPending(): void {
	timer = null;
	const paths = [...pending];
	pending = new Set();
	if (paths.length === 0) return;
	requestScan(paths.length > MAX_PATHS ? undefined : paths);
}

function onEvent(filename: string | null): void {
	if (!root || filename === null) return;
	const path = filename.split(sep).join("/");
	// A folder has no extension; a file counts only when it is audio. Hidden
	// entries (our own temporary copies included) never do.
	if (path.split("/").some((part) => part.startsWith("."))) return;
	// The inbox has its own pipeline; the scan never reads it.
	if (isInboxPath(path)) {
		requestInboxSoon();
		return;
	}
	const dot = path.lastIndexOf(".");
	const ext = dot > path.lastIndexOf("/") ? path.slice(dot).toLowerCase() : "";
	if (ext !== "" && !AUDIO_EXTENSIONS.has(ext)) return;
	pending.add(path);
	if (timer) clearTimeout(timer);
	timer = setTimeout(flushPending, DEBOUNCE_MS);
}

function stopWatching(): void {
	watcher?.close();
	watcher = null;
	if (timer) clearTimeout(timer);
	timer = null;
	pending = new Set();
}

// (Re)starts the watcher on the library root in the settings; null stops it.
export function watchLibrary(): void {
	stopWatching();
	root = readSettings().libraryRoot;
	if (!root) return;
	try {
		watcher = watch(root, { recursive: true }, (_event, filename) =>
			onEvent(filename),
		);
		watcher.on("error", (error) =>
			log(`scanner: watcher stopped: ${error.message}`),
		);
	} catch (error) {
		log(
			`scanner: cannot watch ${root}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// The library root changed (or was set): watch it and look at it.
export function libraryRootChanged(): void {
	watchLibrary();
	if (root) requestScan();
}

export default defineService({
	name: "scanner",
	start({ log: logger }) {
		log = (message) => logger.info(message);
		watchLibrary();
		if (root) requestScan();
		reconcile = setInterval(() => {
			if (root) requestScan();
		}, RECONCILE_MS);
		return () => {
			stopWatching();
			if (reconcile) clearInterval(reconcile);
			reconcile = null;
		};
	},
});
