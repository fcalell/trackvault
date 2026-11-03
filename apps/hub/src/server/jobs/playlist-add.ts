import { CHUNK, openBatch } from "../lib/changes.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import {
	type PlaylistSelection,
	selectionIds,
} from "../lib/playlist-selection.ts";
import { addMembers, getPlaylist } from "../lib/playlists.ts";
import { notifyPlaylists } from "../lib/sync/wake.ts";

export interface PlaylistAddPayload {
	playlistId: string;
	tracks: PlaylistSelection;
}

export interface PlaylistAddResult {
	added: number;
	already: number;
}

// Adds a selection of the library to a manual playlist, at its end, 500 tracks to a
// transaction. Each track is a logged member, so the batch undoes and the devices see it.
// Safe to run twice: a track already in the playlist is left where it is.
export default defineJob<PlaylistAddPayload, PlaylistAddResult>({
	kind: "playlist-add",
	concurrency: 1,
	async run({ id, payload, signal, progress }) {
		const playlist = getPlaylist(payload.playlistId);
		if (!playlist) throw new Error("That playlist is gone");
		const ids = selectionIds(payload.tracks);
		const info = {
			batchId: id,
			origin: "ui" as const,
			label: `Add to ${playlist.name}`,
		};
		openBatch(info);
		let added = 0;
		progress(0, ids.length, "Adding tracks");
		for (let i = 0; i < ids.length; i += CHUNK) {
			signal.throwIfAborted();
			const group = ids.slice(i, i + CHUNK);
			db().transaction((tx) => {
				added += addMembers(tx, info, payload.playlistId, group, new Date());
			});
			progress(Math.min(i + CHUNK, ids.length), ids.length, "Adding tracks");
		}
		notifyPlaylists();
		progress(ids.length, ids.length, `${added} added`);
		return { added, already: ids.length - added };
	},
});
