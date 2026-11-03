import type { Track } from "@fcalell/ui-core/descriptors";

// What the library draws of a track: the columns of a list row, which a record
// has as well.
export interface TrackFacts {
	id: string;
	title: string | null;
	artist: string | null;
	durationMs: number | null;
	hasArt?: boolean;
}

// The player's track for a row: the file the hub serves, with what is known of it.
export function toTrack(row: TrackFacts, peaks?: ArrayLike<number>): Track {
	return {
		src: `/media/${encodeURIComponent(row.id)}`,
		key: row.id,
		title: row.title ?? "Untitled",
		line: row.artist ?? undefined,
		image: row.hasArt
			? `/media/${encodeURIComponent(row.id)}/art?size=320`
			: undefined,
		duration: row.durationMs ? row.durationMs / 1000 : undefined,
		peaks: peaks ? { values: peaks } : undefined,
	};
}

// The hub's `/media/<id>/peaks`: one byte per value, 255 the loudest stretch.
// Undefined while the waveform is not drawn yet.
export async function fetchPeaks(
	id: string,
): Promise<Float32Array | undefined> {
	const response = await fetch(`/media/${encodeURIComponent(id)}/peaks`);
	if (response.status === 404) return undefined;
	if (!response.ok) throw new Error("The waveform could not be read.");
	return Float32Array.from(
		new Uint8Array(await response.arrayBuffer()),
		(v) => v / 255,
	);
}
