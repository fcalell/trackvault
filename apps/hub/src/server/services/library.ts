import { eq, sql } from "@fcalell/plugin-db/orm";
import type { ChannelHandle } from "@fcalell/plugin-node/server";
import { defineService } from "@fcalell/plugin-node/server";
import { settings, tracks } from "../../schema/index.ts";
import { libraryChannel } from "../../shared/channels.ts";
import { db, type Tx } from "../lib/db.ts";
import { readSettings } from "../lib/settings.ts";

type LibraryChannel = ChannelHandle<(typeof libraryChannel)["server"]>;

let channel: LibraryChannel | null = null;

// More ids than this in one message is a refetch, not a patch.
const MAX_IDS = 5000;

// Bumps the library version inside the writer's transaction and returns it: every
// row the batch touches carries it, so "changed since version N" is one index range.
export function bumpVersion(tx: Tx | ReturnType<typeof db>): number {
	readSettings();
	const row = tx
		.update(settings)
		.set({
			libraryVersion: sql`${settings.libraryVersion} + 1`,
			updatedAt: new Date(),
		})
		.where(eq(settings.id, 1))
		.returning({ version: settings.libraryVersion })
		.get();
	if (!row) throw new Error("settings row is missing");
	return row.version;
}

// Tells every connected client which tracks a committed batch changed.
export function notifyChanged(
	ids: readonly string[],
	version: number,
	all = false,
): void {
	if (!channel) return;
	if (ids.length === 0 && !all) return;
	const wide = all || ids.length > MAX_IDS;
	channel.broadcast("changed", {
		ids: wide ? [] : [...ids],
		version,
		all: wide,
	});
}

export default defineService({
	name: "library",
	start({ ws }) {
		channel = ws.channel(libraryChannel, {
			onSubscribe(conn) {
				conn.send("snapshot", { version: readSettings().libraryVersion });
			},
		});
		return () => {
			channel = null;
		};
	},
});

// The low-bitrate threshold changed: re-decide the flag of every track in one
// statement. Returns the new library version.
export function applyLowBitrateThreshold(kbps: number): number {
	const database = db();
	return database.transaction((tx) => {
		const version = bumpVersion(tx);
		tx.update(tracks)
			.set({
				issues: sql`(${tracks.issues} & ~1) | (CASE WHEN ${kbps} > 0 AND ${tracks.bitrate} > 0 AND ${tracks.bitrate} < ${kbps} AND (${tracks.issues} & 128) = 0 THEN 1 ELSE 0 END)`,
				version,
			})
			.where(
				sql`(${tracks.issues} & 1) != (CASE WHEN ${kbps} > 0 AND ${tracks.bitrate} > 0 AND ${tracks.bitrate} < ${kbps} AND (${tracks.issues} & 128) = 0 THEN 1 ELSE 0 END)`,
			)
			.run();
		return version;
	});
}
