import type { TrackWithFile } from "@repo/schema/library";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Separator } from "@repo/ui/components/separator";
import { toast } from "@repo/ui/components/toast";
import { X } from "lucide-solid";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { orpc } from "#lib/api";
import { formatDuration } from "#lib/format";
import { useMutation, useQueryClient } from "#lib/query";

export default function TrackDetailPanel(props: {
	track: TrackWithFile | null;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();

	const [title, setTitle] = createSignal("");
	const [artist, setArtist] = createSignal("");
	const [album, setAlbum] = createSignal("");
	const [genre, setGenre] = createSignal("");
	const [year, setYear] = createSignal("");
	const [comment, setComment] = createSignal("");

	createEffect(() => {
		const t = props.track;
		if (t) {
			setTitle(t.title ?? "");
			setArtist(t.artist ?? "");
			setAlbum(t.album ?? "");
			setGenre(t.genre ?? "");
			setYear(t.year != null ? String(t.year) : "");
			setComment(t.comment ?? "");
		}
	});

	// Escape key handler
	createEffect(() => {
		if (!props.track) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") props.onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		onCleanup(() => document.removeEventListener("keydown", onKeyDown));
	});

	const updateMutation = useMutation(() =>
		orpc.library.update.mutationOptions(),
	);

	function isDirty() {
		const t = props.track;
		if (!t) return false;
		return (
			title() !== (t.title ?? "") ||
			artist() !== (t.artist ?? "") ||
			album() !== (t.album ?? "") ||
			genre() !== (t.genre ?? "") ||
			year() !== (t.year != null ? String(t.year) : "") ||
			comment() !== (t.comment ?? "")
		);
	}

	async function handleSave() {
		const t = props.track;
		if (!t) return;

		const fields: Record<string, unknown> = {};
		if (title() !== (t.title ?? "")) fields.title = title();
		if (artist() !== (t.artist ?? "")) fields.artist = artist();
		if (album() !== (t.album ?? "")) fields.album = album();
		if (genre() !== (t.genre ?? "")) fields.genre = genre();
		if (year() !== (t.year != null ? String(t.year) : ""))
			fields.year = year() ? Number.parseInt(year(), 10) : undefined;
		if (comment() !== (t.comment ?? "")) fields.comment = comment();

		try {
			await updateMutation.mutateAsync({ id: t.id, ...fields });
			await queryClient.invalidateQueries({
				queryKey: orpc.library.scan.queryOptions({}).queryKey,
			});
			toast.success("Track updated");
			props.onClose();
		} catch {
			toast.error("Failed to update track");
		}
	}

	return (
		<Show when={props.track}>
			{(track) => (
				<div class="absolute top-0 right-0 bottom-0 z-20 flex w-[360px] animate-[slide-in-right_0.2s_ease-out] flex-col border-l-[length:var(--border-heavy)] border-border bg-card">
					{/* Header */}
					<div class="flex items-center justify-between border-b border-border px-4 py-3">
						<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
							Track Details
						</span>
						<Button
							variant="ghost"
							size="icon"
							onClick={props.onClose}
							class="size-8"
						>
							<X class="size-4" />
						</Button>
					</div>

					{/* Editable fields */}
					<div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
						<div class="flex flex-col gap-1.5">
							<Label>Title</Label>
							<Input
								value={title()}
								onInput={(e) => setTitle(e.currentTarget.value)}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label>Artist</Label>
							<Input
								value={artist()}
								onInput={(e) => setArtist(e.currentTarget.value)}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label>Album</Label>
							<Input
								value={album()}
								onInput={(e) => setAlbum(e.currentTarget.value)}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label>Genre</Label>
							<Input
								value={genre()}
								onInput={(e) => setGenre(e.currentTarget.value)}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label>Year</Label>
							<Input
								type="number"
								value={year()}
								onInput={(e) => setYear(e.currentTarget.value)}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label>Comment</Label>
							<Input
								value={comment()}
								onInput={(e) => setComment(e.currentTarget.value)}
							/>
						</div>

						<Separator />

						{/* Read-only fields */}
						<div class="flex flex-col gap-3">
							<div class="flex flex-col gap-1">
								<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									Duration
								</span>
								<span class="text-sm">
									{track().duration != null
										? formatDuration(track().duration as number)
										: "--"}
								</span>
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									Bitrate
								</span>
								<span class="text-sm">
									{track().bitrate != null ? `${track().bitrate} kbps` : "--"}
								</span>
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									Filename
								</span>
								<span class="break-all text-sm">
									{track().filename ?? "--"}
								</span>
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									Path
								</span>
								<span class="break-all text-sm">
									{track().filepath ?? "--"}
								</span>
							</div>
						</div>
					</div>

					{/* Footer */}
					<div class="flex justify-end gap-2 border-t border-border px-4 py-3">
						<Button variant="outline" onClick={props.onClose}>
							Cancel
						</Button>
						<Button
							onClick={handleSave}
							disabled={!isDirty() || updateMutation.isPending}
						>
							<Show when={updateMutation.isPending} fallback="Save">
								Saving...
							</Show>
						</Button>
					</div>
				</div>
			)}
		</Show>
	);
}
