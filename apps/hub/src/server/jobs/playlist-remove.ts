import { CHUNK, openBatch } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { getPlaylist, removeMembers } from "../lib/playlists.ts";
import { statement } from "../lib/raw.ts";
import { notifyPlaylists } from "../lib/sync/wake.ts";

export interface PlaylistRemovePayload {
	playlistId: string;
	// Every track of the playlist but these, or just these.
	except?: string[];
	ids?: string[];
}

// Takes tracks out of a manual playlist in chunks, each one a logged member change.
export default defineJob<PlaylistRemovePayload, { removed: number }>({
	kind: "playlist-remove",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const playlist = getPlaylist(payload.playlistId);
		if (!playlist) throw new Error("That playlist is gone");
		const rows = payload.ids
			? payload.ids
			: (
					statement(
						"SELECT track_id FROM playlist_tracks WHERE playlist_id = @id",
					).all({ id: payload.playlistId }) as { track_id: string }[]
				)
					.map((row) => row.track_id)
					.filter((trackId) => !(payload.except ?? []).includes(trackId));
		const info = {
			batchId: id,
			origin: "ui" as const,
			label: `Remove from ${playlist.name}`,
		};
		openBatch(info);
		let removed = 0;
		progress(0, rows.length, "Removing tracks");
		for (let i = 0; i < rows.length; i += CHUNK) {
			signal.throwIfAborted();
			const group = rows.slice(i, i + CHUNK);
			db().transaction((tx) => {
				removed += removeMembers(
					tx,
					info,
					payload.playlistId,
					group,
					new Date(),
				);
			});
			progress(
				Math.min(i + CHUNK, rows.length),
				rows.length,
				"Removing tracks",
			);
		}
		notifyPlaylists();
		return { removed };
	},
});
