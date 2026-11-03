import { defineService } from "@fcalell/plugin-node/server";
import inbox from "../jobs/inbox.ts";
import { inboxState } from "../lib/inbox/state.ts";
import { readSettings } from "../lib/settings.ts";
import { enqueue } from "./jobs.ts";

// The safety net under the folder watcher (the scanner's), which can miss events.
const RECONCILE_MS = 5 * 60 * 1000;
// Events from one copy settle for this long before the pass they cause.
const DEBOUNCE_MS = 1000;

let timer: ReturnType<typeof setTimeout> | null = null;
let reconcile: ReturnType<typeof setInterval> | null = null;

// Queues a pass over the inbox now. A pass already waiting is returned; one already
// running looks again when it finishes (the dirty flag).
export function requestInbox() {
	inboxState.dirty = true;
	return enqueue(inbox, {}, { reuse: () => true });
}

// The same, after a short quiet: a folder watcher fires once per file of a copy.
export function requestInboxSoon(): void {
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		if (readSettings().libraryRoot) requestInbox();
	}, DEBOUNCE_MS);
}

// Looks at `<library>/Inbox/` at start and every few minutes; the scanner's watcher
// and the sync uploads ask for a pass when something lands.
export default defineService({
	name: "inbox",
	start() {
		reconcile = setInterval(() => {
			if (readSettings().libraryRoot) requestInbox();
		}, RECONCILE_MS);
		return () => {
			if (timer) clearTimeout(timer);
			if (reconcile) clearInterval(reconcile);
			timer = null;
			reconcile = null;
		};
	},
	// The first pass is a job: it waits for the runner, which has started by now.
	ready() {
		if (readSettings().libraryRoot) requestInbox();
	},
});
