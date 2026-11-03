import type { RowItem } from "@fcalell/plugin-native-ui/components/section";
import { duration, trackMeta } from "./format";
import { type Playable, playFrom } from "./play";

type Window = Parameters<typeof playFrom>[0];
type TrackLine = Playable & {
	bpm: number | null;
	key: string | null;
};

/** The rows of a window read of tracks: the record on a press, play at the row's end. */
export function trackItems(
	read: Window,
	rows: readonly TrackLine[],
	playing: string | undefined,
): RowItem[] {
	return rows.map((t, at) => ({
		key: t.id,
		title: t.title ?? "Untitled",
		meta: trackMeta(t),
		leading: playing === t.id ? { icon: "Volume2" as const } : undefined,
		trailing: { value: duration(t.durationMs) },
		href: `/track/${t.id}` as const,
		act: {
			icon: "Play" as const,
			label: "Play",
			onAct: () => playFrom(read, rows, at),
		},
	}));
}
