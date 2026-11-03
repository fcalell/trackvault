import { desc, eq } from "@fcalell/plugin-db/orm";
import type { ChannelHandle } from "@fcalell/plugin-node/server";
import { composeTitle } from "@trackvault/core/normalize";
import { downloads, wishlist } from "../../schema/index.ts";
import type { TransferView, transfersChannel } from "../../shared/channels.ts";
import { db } from "./db.ts";

type TransfersChannel = ChannelHandle<(typeof transfersChannel)["server"]>;
export type DownloadRow = typeof downloads.$inferSelect;

let channel: TransfersChannel | null = null;

export const bindTransfers = (handle: TransfersChannel | null): void => {
	channel = handle;
};

const basename = (path: string): string =>
	path
		.split(/[\\/]+/)
		.filter(Boolean)
		.pop() ?? path;

// "Artist - Title (Mix)" of the want a download is for.
function wantName(id: number | null): string | null {
	if (id === null) return null;
	const want = db().select().from(wishlist).where(eq(wishlist.id, id)).get();
	return want ? `${want.artist} - ${composeTitle(want.title, want.mix)}` : null;
}

export function transferView(row: DownloadRow): TransferView {
	return {
		id: row.id,
		username: row.username,
		name: basename(row.filename),
		artist: row.artist,
		title: row.title === null ? null : composeTitle(row.title, row.mix),
		format: row.format,
		bitrate: row.bitrate,
		state: row.state,
		rawState: row.rawState,
		size: row.size,
		bytes: row.bytes,
		speed: row.speed,
		error: row.error,
		wantId: row.wantId,
		want: wantName(row.wantId),
		inboxItemId: row.inboxItemId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function recentTransfers(limit = 300): TransferView[] {
	return db()
		.select()
		.from(downloads)
		.orderBy(desc(downloads.createdAt), desc(downloads.id))
		.limit(limit)
		.all()
		.map(transferView);
}

export function announceTransfer(id: string): void {
	const row = db().select().from(downloads).where(eq(downloads.id, id)).get();
	if (row) channel?.broadcast("upsert", transferView(row));
}

export function removeTransferView(id: string): void {
	channel?.broadcast("remove", { id });
}
