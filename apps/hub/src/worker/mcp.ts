import { defineMcp } from "@fcalell/plugin-api/mcp";
import type * as routes from "./routes/index.ts";

// What an MCP client (Claude) may do with the library: read it, and make the safe
// changes (playlists, queueing jobs). Nothing here edits tags directly or removes files:
// auto-tag results wait in Auto-tag review for the owner.
export default defineMcp<typeof routes>({
	instructions:
		"TrackVault is a DJ's music library. Search it, read tracks, playlists and stats, get harmonic next-track suggestions, build playlists, and queue auto-tag, analysis and cover-art jobs. Auto-tag results are proposals the owner reviews; tags are never changed directly. Track ids come from the search and playlist tools.",
	tools: {
		"agent.search":
			"Searches the library by words, genre, key, tempo range, energy or played-never, 50 at most per call, and returns the total.",
		"agent.track":
			"Reads one track by id: tags, tempo, key, energy, loudness, plays.",
		"agent.playlists":
			"Lists the playlists and folders with their track counts.",
		"agent.playlistTracks": "Lists the tracks of a manual playlist in order.",
		"agent.stats":
			"Library overview: counts, formats, genres, tempo histogram, key wheel, additions per month, most played, freshness.",
		"agent.nextTracks":
			"Suggests tracks that mix well after a track, scored on key, tempo, energy, genre and freshness, with the reasons.",
		"agent.addToPlaylist": "Adds tracks to the end of a manual playlist.",
		"agent.createPlaylist":
			"Creates a manual playlist, optionally with tracks.",
		"agent.queueAutotag":
			"Queues auto-tag for tracks (ids or a filter); the results wait in the owner's Auto-tag review.",
		"agent.queueAnalyse":
			"Queues BPM, key, energy and loudness analysis for tracks (ids or a filter).",
		"agent.queueArt": "Queues a cover-art search for tracks (ids or a filter).",
	},
});
