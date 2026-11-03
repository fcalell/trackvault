import { useWindow } from "@fcalell/plugin-api/tanstack-query";
import {
	player,
	usePlayer,
	windowQueue,
} from "@fcalell/plugin-react-ui/lib/player";
import { createContext } from "react";
import { fetchPeaks, type TrackFacts, toTrack } from "../ui/track.ts";

type ListRead = Parameters<typeof windowQueue>[0] &
	NonNullable<Parameters<typeof useWindow>[0]>;

// The window read of the list a record opened from, so the record's Play walks that list.
export const ListSource = createContext<ListRead | undefined>(undefined);

// Plays a track of a list with the list as the queue (Next and Previous fetch the rows
// beside it through the read's own pages), its waveform with it; the track alone where
// the list has not loaded it. `act` is the row's play act, a pause on the row playing.
export function useListPlay(read: ListRead | undefined) {
	const rows = useWindow(read)?.rows;
	const current = usePlayer();
	const play = async (
		row: TrackFacts,
		peaks?: ArrayLike<number>,
	): Promise<void> => {
		const known = peaks ?? (await fetchPeaks(row.id).catch(() => undefined));
		const at =
			rows?.findIndex(
				(each) => (each as TrackFacts | undefined)?.id === row.id,
			) ?? -1;
		player.play(
			toTrack(row, known),
			read && at >= 0 ? windowQueue(read, { track: toTrack, at }) : undefined,
		);
	};
	const act = (row: TrackFacts) => {
		const here = current.track?.key === row.id;
		return {
			icon: here && current.playing ? ("Pause" as const) : ("Play" as const),
			label: `${here && current.playing ? "Pause" : "Play"} ${row.title ?? "Untitled"}`,
			onAct: () => (here ? player.toggle() : play(row)),
		};
	};
	return { play, act, playing: current.track?.key };
}
