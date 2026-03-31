import { Button } from "@repo/ui/components/button";
import { Slider } from "@repo/ui/components/slider";
import { Pause, Play, Volume2, VolumeX } from "lucide-solid";
import type { Accessor } from "solid-js";
import { createEffect, Show } from "solid-js";
import { playerStore, type Track } from "#lib/player";

export default function Player() {
	return (
		<Show when={playerStore.currentTrack()}>
			{(track) => <PlayerInner track={track} />}
		</Show>
	);
}

function PlayerInner(props: { track: Accessor<Track> }) {
	let audioRef!: HTMLAudioElement;

	createEffect(() => {
		audioRef.volume = playerStore.volume();
	});

	createEffect(() => {
		const track = props.track();
		audioRef.src = `local-file://${track.audioSrc}`;
		audioRef.load();
		audioRef.play();
	});

	createEffect(() => {
		if (playerStore.isPlaying()) {
			audioRef.play();
		} else {
			audioRef.pause();
		}
	});

	function handleTimeUpdate() {
		if (audioRef.duration) {
			playerStore.setProgress((audioRef.currentTime / audioRef.duration) * 100);
			playerStore.setDuration(audioRef.duration);
		}
	}

	function handleSeek(value: number[]) {
		const v = value[0];
		if (v == null) return;
		const newTime = (v / 100) * audioRef.duration;
		audioRef.currentTime = newTime;
		playerStore.setProgress(v);
	}

	function handleVolumeChange(value: number[]) {
		const v = value[0];
		if (v != null) playerStore.setVolume(v);
	}

	function formatTime(seconds: number) {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, "0")}`;
	}

	return (
		<div class="flex h-14 items-center gap-6 border-t-[length:var(--border-heavy)] border-border bg-card px-5">
			<div class="w-48 shrink-0">
				<p class="truncate text-sm font-semibold">{props.track().title}</p>
				<p class="truncate text-xs text-muted-foreground">
					{props.track().artist}
				</p>
			</div>

			<div class="flex flex-1 items-center gap-3">
				<Button
					variant="ghost"
					size="icon"
					onClick={playerStore.togglePlayPause}
				>
					<Show when={playerStore.isPlaying()} fallback={<Play />}>
						<Pause />
					</Show>
				</Button>

				<span class="w-10 text-right text-xs tabular-nums text-muted-foreground">
					{formatTime((playerStore.progress() / 100) * playerStore.duration())}
				</span>

				<Slider
					value={[playerStore.progress()]}
					minValue={0}
					maxValue={100}
					step={0.1}
					onChange={handleSeek}
					class="flex-1"
				/>

				<span class="w-10 text-xs tabular-nums text-muted-foreground">
					{formatTime(playerStore.duration())}
				</span>
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<Button variant="ghost" size="icon" onClick={playerStore.toggleMute}>
					<Show when={playerStore.volume() > 0} fallback={<VolumeX />}>
						<Volume2 />
					</Show>
				</Button>

				<Slider
					value={[playerStore.volume()]}
					minValue={0}
					maxValue={1}
					step={0.01}
					onChange={handleVolumeChange}
					class="w-24"
				/>
			</div>

			{/* biome-ignore lint/a11y/useMediaCaption: music player, no captions */}
			<audio
				ref={audioRef}
				onTimeUpdate={handleTimeUpdate}
				onEnded={() => playerStore.stop()}
			/>
		</div>
	);
}
