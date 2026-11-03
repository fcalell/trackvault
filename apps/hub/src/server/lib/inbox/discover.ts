import { eq, inArray } from "@fcalell/plugin-db/orm";
import { sanitizeFilename } from "@trackvault/core/paths";
import { devices, inboxItems } from "../../../schema/index.ts";
import { db } from "../db.ts";
import { walkInbox } from "./files.ts";
import { type ItemRow, registerItem } from "./items.ts";
import { SOULSEEK_DIR } from "./paths.ts";

// A file touched this recently may still be arriving (a copy in progress).
export const SETTLE_MS = 4000;
// Approved and rejected items stay listed this long, then are forgotten.
const KEEP_DONE_MS = 14 * 24 * 3600 * 1000;

export interface Discovered {
	added: number;
	changed: number;
	removed: number;
	// Files still settling: look again soon.
	deferred: number;
}

const TERMINAL = new Set<ItemRow["state"]>(["approved", "rejected"]);

// The first folder under `Inbox/` says where a file came from.
function sourceOf(
	path: string,
	deviceFolders: ReadonlySet<string>,
): { source: ItemRow["source"]; ref: string | null } {
	const [, first, second] = path.split("/");
	if (first === SOULSEEK_DIR && second)
		return { source: "soulseek", ref: second };
	if (first && deviceFolders.has(first)) return { source: "agent", ref: first };
	return { source: "watch", ref: null };
}

// Brings the `inbox_items` rows in step with the files under `Inbox/`: a new file
// is an item, a file replaced or rewritten starts over, a file taken away by hand
// drops its item. Idempotent.
export async function discoverInbox(
	root: string,
	signal?: AbortSignal,
): Promise<Discovered> {
	const found = await walkInbox(root, signal);
	const database = db();
	const known = new Map<string, ItemRow>();
	for (const row of database.select().from(inboxItems).all())
		known.set(row.path, row);
	const deviceFolders = new Set(
		database
			.select({ name: devices.name, id: devices.id })
			.from(devices)
			.all()
			.flatMap((d) => [sanitizeFilename(d.name, "_"), d.id]),
	);
	const result: Discovered = { added: 0, changed: 0, removed: 0, deferred: 0 };
	const now = Date.now();
	const seen = new Set<string>();

	for (const file of found) {
		seen.add(file.path);
		const row = known.get(file.path);
		const settled = now - file.mtimeMs >= SETTLE_MS;
		if (row) {
			const same = row.size === file.size && row.mtimeMs === file.mtimeMs;
			if (same) continue;
			if (!settled) {
				result.deferred++;
				continue;
			}
			if (TERMINAL.has(row.state)) {
				// The same name came back as a new file.
				database.delete(inboxItems).where(eq(inboxItems.id, row.id)).run();
			} else {
				// Rewritten while waiting: the pipeline starts over on the new bytes.
				database
					.update(inboxItems)
					.set({
						state: "queued",
						steps: {},
						size: file.size,
						mtimeMs: file.mtimeMs,
						audioHash: null,
						fileHash: null,
						decision: null,
						decisionKind: null,
						matches: null,
						proposed: null,
						target: null,
						error: null,
						updatedAt: new Date(),
					})
					.where(eq(inboxItems.id, row.id))
					.run();
				result.changed++;
				continue;
			}
		}
		if (!settled) {
			result.deferred++;
			continue;
		}
		const origin = sourceOf(file.path, deviceFolders);
		if (
			registerItem({
				path: file.path,
				source: origin.source,
				sourceRef: origin.ref,
				size: file.size,
				mtimeMs: file.mtimeMs,
			})
		)
			result.added++;
	}

	// Items whose file is gone: taken out by hand (or approved and moved).
	const gone: string[] = [];
	for (const [path, row] of known) {
		if (seen.has(path)) continue;
		if (TERMINAL.has(row.state)) {
			if (now - row.updatedAt.getTime() > KEEP_DONE_MS) gone.push(row.id);
			continue;
		}
		gone.push(row.id);
	}
	for (let i = 0; i < gone.length; i += 400)
		database
			.delete(inboxItems)
			.where(inArray(inboxItems.id, gone.slice(i, i + 400)))
			.run();
	result.removed = gone.length;
	return result;
}
