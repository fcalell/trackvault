import type { Run } from "@fcalell/ui-core/descriptors";

export const duration = (ms: number | null | undefined): string => {
	if (!ms) return "";
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The parts a track's meta line shows, the empty ones left out. */
export function trackMeta(t: {
	artist: string | null;
	bpm: number | null;
	key: string | null;
}): Run[] {
	return [
		t.artist ?? "Unknown artist",
		...(t.bpm ? [`${Math.round(t.bpm)} BPM`] : []),
		...(t.key ? [t.key] : []),
	];
}
