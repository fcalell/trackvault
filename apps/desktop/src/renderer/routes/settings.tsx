import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@repo/ui/components/section";
import { toast } from "@repo/ui/components/toast";
import { createFileRoute } from "@tanstack/solid-router";
import { createEffect, createSignal, Show } from "solid-js";
import Shell from "#components/shell";
import { orpc } from "#lib/api";
import { useMutation, useQuery } from "#lib/query";

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const [libraryPath, setLibraryPath] = createSignal("");
	const [bitrateThreshold, setBitrateThreshold] = createSignal(320);

	const settingsQuery = useQuery(() => orpc.settings.read.queryOptions({}));
	const selectFolder = useMutation(() =>
		orpc.electron.selectFolder.mutationOptions(),
	);
	const updateSettings = useMutation(() =>
		orpc.settings.update.mutationOptions(),
	);

	createEffect(() => {
		const data = settingsQuery.data;
		if (data) {
			setLibraryPath(data.libraryPath);
			if (data.lowBitrateThreshold != null) {
				setBitrateThreshold(data.lowBitrateThreshold);
			}
		}
	});

	async function handleBrowse() {
		const path = await selectFolder.mutateAsync({});
		if (path) setLibraryPath(path);
	}

	async function handleSave() {
		const path = libraryPath();
		if (!path) return;
		try {
			await updateSettings.mutateAsync({
				libraryPath: path,
				lowBitrateThreshold: bitrateThreshold(),
			});
			toast.success("Settings saved");
		} catch {
			toast.error("Failed to save settings");
		}
	}

	return (
		<Shell>
			<Section>
				<SectionHeader>
					<SectionTitle>Settings</SectionTitle>
				</SectionHeader>

				<SectionContent>
					<div class="flex max-w-xl flex-col gap-8">
						<div class="flex flex-col gap-4">
							<h3 class="text-sm font-bold uppercase tracking-widest">
								Library
							</h3>

							<div class="flex flex-col gap-2">
								<Label>Library Path</Label>
								<div class="flex gap-2">
									<Input
										value={libraryPath()}
										readOnly
										placeholder="/path/to/music"
										class="flex-1"
									/>
									<Button
										variant="outline"
										onClick={handleBrowse}
										disabled={selectFolder.isPending}
									>
										Browse
									</Button>
								</div>
								<p class="text-xs text-muted-foreground">
									Scans this folder and all subfolders for MP3 files.
								</p>
							</div>
						</div>

						<div class="flex flex-col gap-4">
							<h3 class="text-sm font-bold uppercase tracking-widest">
								Quality
							</h3>

							<div class="flex flex-col gap-2">
								<Label>Low Bitrate Threshold</Label>
								<div class="flex items-center gap-2">
									<Input
										type="number"
										value={bitrateThreshold()}
										onInput={(e) =>
											setBitrateThreshold(Number(e.currentTarget.value))
										}
										class="w-24"
										min={64}
										max={320}
									/>
									<span class="text-xs text-muted-foreground">kbps</span>
								</div>
								<p class="text-xs text-muted-foreground">
									Tracks below this bitrate are flagged as low quality.
								</p>
							</div>
						</div>

						<div>
							<Button
								onClick={handleSave}
								disabled={!libraryPath() || updateSettings.isPending}
							>
								<Show when={updateSettings.isPending} fallback="Save">
									Saving...
								</Show>
							</Button>
						</div>
					</div>
				</SectionContent>
			</Section>
		</Shell>
	);
}
