import { createRoot, createSignal } from "solid-js";

export type Track = {
	title: string;
	artist: string;
	audioSrc: string;
};

function createPlayerStore() {
	const [currentTrack, setCurrentTrack] = createSignal<Track | null>(null);
	const [isPlaying, setIsPlaying] = createSignal(false);
	const [volume, setVolume] = createSignal(1);
	const [progress, setProgress] = createSignal(0);
	const [duration, setDuration] = createSignal(0);

	function play(track: Track) {
		const current = currentTrack();
		if (current?.audioSrc === track.audioSrc) {
			setIsPlaying(true);
			return;
		}
		setCurrentTrack(track);
		setProgress(0);
		setIsPlaying(true);
	}

	function togglePlayPause() {
		setIsPlaying(!isPlaying());
	}

	function stop() {
		setIsPlaying(false);
		setProgress(0);
	}

	function toggleMute() {
		setVolume(volume() > 0 ? 0 : 1);
	}

	return {
		currentTrack,
		isPlaying,
		volume,
		progress,
		duration,
		setVolume,
		setProgress,
		setDuration,
		setIsPlaying,
		play,
		togglePlayPause,
		stop,
		toggleMute,
	};
}

export const playerStore = createRoot(createPlayerStore);
