import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray } from "@fcalell/plugin-db/orm";
import { defineService } from "@fcalell/plugin-node/server";
import { safeJoin, sanitizeFilename } from "@trackvault/core/paths";
import {
	flattenTransfers,
	type SlskdClient,
	type SlskdTransfer,
} from "@trackvault/core/slskd";
import { downloads, wishlist } from "../../schema/index.ts";
import { transfersChannel } from "../../shared/channels.ts";
import { db } from "../lib/db.ts";
import { moveAcross } from "../lib/inbox/files.ts";
import { registerItem } from "../lib/inbox/items.ts";
import { INBOX_DIR, SOULSEEK_DIR } from "../lib/inbox/paths.ts";
import { freeName } from "../lib/quarantine.ts";
import { readSettings } from "../lib/settings.ts";
import { downloadsDir, slskdClient, slskdConfigured } from "../lib/slskd.ts";
import {
	announceTransfer,
	bindTransfers,
	type DownloadRow,
	recentTransfers,
} from "../lib/transfers.ts";
import { requestInbox } from "./inbox.ts";

const BUSY_MS = 2500;
const IDLE_MS = 20_000;
// A request slskd never lists is given up on after this long.
const LOST_MS = 3 * 60 * 1000;
const ACTIVE = ["requested", "queued", "downloading", "completed"] as const;

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let log: (message: string) => void = () => {};
let lastError: string | null = null;

type State = DownloadRow["state"];

// slskd's state strings: "Queued, Remotely", "InProgress", "Completed, Succeeded"...
export function mapState(raw: string): State {
	if (raw.startsWith("Completed")) {
		if (raw.includes("Succeeded")) return "completed";
		return raw.includes("Cancelled") ? "cancelled" : "failed";
	}
	return raw.includes("InProgress") ? "downloading" : "queued";
}

const nameOf = (path: string): string =>
	path
		.split(/[\\/]+/)
		.filter(Boolean)
		.pop() ?? path;

// Where slskd put a finished file: its folder name under the downloads folder, else
// anywhere a few levels down that has the name and the size.
async function locate(dir: string, row: DownloadRow): Promise<string | null> {
	const parts = row.filename.split(/[\\/]+/).filter(Boolean);
	const name = parts.pop() as string;
	const folder = parts.pop();
	const fits = async (path: string): Promise<boolean> => {
		const info = await stat(path).catch(() => null);
		return Boolean(
			info?.isFile() && (row.size === 0 || info.size === row.size),
		);
	};
	const direct = [
		...(folder ? [join(dir, folder, name)] : []),
		join(dir, name),
		...(folder ? [join(dir, row.username, folder, name)] : []),
	];
	for (const path of direct) if (await fits(path)) return path;
	async function search(
		directory: string,
		depth: number,
	): Promise<string | null> {
		const entries = await readdir(directory, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isFile() && entry.name === name && (await fits(path)))
				return path;
		}
		if (depth === 0) return null;
		for (const entry of entries)
			if (entry.isDirectory()) {
				const found = await search(join(directory, entry.name), depth - 1);
				if (found) return found;
			}
		return null;
	}
	return search(dir, 3);
}

function fail(row: DownloadRow, message: string): void {
	db()
		.update(downloads)
		.set({ state: "failed", error: message, updatedAt: new Date() })
		.where(eq(downloads.id, row.id))
		.run();
	announceTransfer(row.id);
	if (row.wantId !== null)
		db()
			.update(wishlist)
			.set({ status: "wanted", updatedAt: new Date() })
			.where(
				and(eq(wishlist.id, row.wantId), eq(wishlist.status, "downloading")),
			)
			.run();
}

// A finished download moves into `Inbox/Soulseek/<peer>/` and becomes an inbox item.
async function importDownload(
	client: SlskdClient,
	row: DownloadRow,
): Promise<void> {
	const root = readSettings().libraryRoot;
	if (!root) return;
	const dir = await downloadsDir(client);
	if (!dir) {
		fail(row, "slskd's downloads folder is unknown: set it in Settings");
		return;
	}
	const from = await locate(dir, row);
	if (!from) {
		fail(row, `The downloaded file was not found under ${dir}`);
		return;
	}
	const relative = [
		INBOX_DIR,
		SOULSEEK_DIR,
		sanitizeFilename(row.username, "_"),
		sanitizeFilename(nameOf(row.filename), "download"),
	].join("/");
	const landed = await freeName(root, relative, () => false);
	await moveAcross(from, safeJoin(root, landed));
	const item = registerItem({
		path: landed,
		source: "soulseek",
		sourceRef: row.username,
		size: row.size,
		wantId: row.wantId,
		downloadId: row.id,
		needsCutoffCheck: row.needsCutoffCheck,
	});
	db()
		.update(downloads)
		.set({
			state: "imported",
			inboxItemId: item?.id ?? null,
			error: null,
			updatedAt: new Date(),
		})
		.where(eq(downloads.id, row.id))
		.run();
	if (row.wantId !== null)
		db()
			.update(wishlist)
			.set({ status: "downloaded", updatedAt: new Date() })
			.where(eq(wishlist.id, row.wantId))
			.run();
	announceTransfer(row.id);
	// The record in slskd is only a record now.
	const slskdId = row.slskdId;
	if (slskdId)
		await client.downloads
			.cancel(row.username, slskdId, true)
			.catch(() => undefined);
	requestInbox();
}

// One look at slskd's transfers: the rows of ours it knows get its state and progress,
// finished ones are imported, ones it has lost are failed.
export async function pollTransfers(): Promise<number> {
	const database = db();
	const rows = database
		.select()
		.from(downloads)
		.where(inArray(downloads.state, [...ACTIVE]))
		.all();
	if (rows.length === 0) return 0;
	const client = slskdClient();
	const listed = flattenTransfers(await client.downloads.list());
	const byFile = new Map<string, SlskdTransfer>();
	for (const t of listed) byFile.set(`${t.username}\0${t.filename}`, t);
	for (const row of rows) {
		const t = byFile.get(`${row.username}\0${row.filename}`);
		if (!t) {
			// Completed rows whose record slskd dropped are still ours to import.
			if (row.state === "completed") {
				await importDownload(client, row);
				continue;
			}
			if (Date.now() - row.updatedAt.getTime() > LOST_MS)
				fail(row, "slskd does not list this transfer any more");
			continue;
		}
		const state = mapState(t.state);
		const changed =
			row.rawState !== t.state ||
			row.bytes !== Math.round(t.bytesTransferred) ||
			row.slskdId !== t.id;
		if (changed) {
			database
				.update(downloads)
				.set({
					state,
					rawState: t.state,
					slskdId: t.id,
					bytes: Math.round(t.bytesTransferred),
					speed: t.averageSpeed,
					size: t.size || row.size,
					error:
						state === "failed" || state === "cancelled"
							? (t.exception ?? t.state)
							: null,
					updatedAt: new Date(),
				})
				.where(eq(downloads.id, row.id))
				.run();
			announceTransfer(row.id);
		}
		if (state === "failed" || state === "cancelled") {
			if (row.wantId !== null)
				database
					.update(wishlist)
					.set({ status: "wanted", updatedAt: new Date() })
					.where(
						and(
							eq(wishlist.id, row.wantId),
							eq(wishlist.status, "downloading"),
						),
					)
					.run();
		}
		if (state === "completed" && row.state !== "imported")
			await importDownload(client, {
				...row,
				state,
				slskdId: t.id,
				size: t.size || row.size,
			});
	}
	return rows.length;
}

function schedule(ms: number): void {
	if (stopped) return;
	timer = setTimeout(async () => {
		let next = IDLE_MS;
		try {
			if (slskdConfigured()) {
				const active = await pollTransfers();
				next = active > 0 ? BUSY_MS : IDLE_MS;
				lastError = null;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message !== lastError) log(`slskd: ${message}`);
			lastError = message;
		}
		schedule(next);
	}, ms);
}

// Watches slskd's transfers while any download is in flight (every few seconds, else
// every 20), pushes them to the `transfers` channel and moves finished files into the
// inbox. With no slskd configured it does nothing.
export default defineService({
	name: "slskd",
	start({ ws, log: logger }) {
		log = (message) => logger.info(message);
		stopped = false;
		const channel = ws.channel(transfersChannel, {
			onSubscribe(conn) {
				conn.send("snapshot", { transfers: recentTransfers() });
			},
		});
		bindTransfers(channel);
		schedule(2000);
		return () => {
			stopped = true;
			if (timer) clearTimeout(timer);
			timer = null;
			bindTransfers(null);
		};
	},
});
