import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { createEffect, createSignal, Show } from "solid-js";
import { orpc } from "#lib/api";
import { useMutation, useQuery, useQueryClient } from "#lib/query";

export default function SettingsDialog(props: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = createSignal(props.open ?? false);
	const [libraryPath, setLibraryPath] = createSignal("");

	const settingsQuery = useQuery(() => orpc.settings.read.queryOptions({}));

	createEffect(() => {
		if (settingsQuery.error) {
			setOpen(true);
		}
	});

	createEffect(() => {
		const data = settingsQuery.data;
		if (data?.libraryPath) {
			setLibraryPath(data.libraryPath);
		}
	});

	const selectFolder = useMutation(() =>
		orpc.electron.selectFolder.mutationOptions(),
	);
	const updateSettings = useMutation(() =>
		orpc.settings.update.mutationOptions(),
	);

	async function handleSelectFolder() {
		const path = await selectFolder.mutateAsync({});
		if (path) setLibraryPath(path);
	}

	async function handleSave() {
		const path = libraryPath();
		if (!path) return;
		await updateSettings.mutateAsync({ libraryPath: path });
		await queryClient.invalidateQueries();
		handleOpenChange(false);
	}

	function handleOpenChange(value: boolean) {
		setOpen(value);
		props.onOpenChange?.(value);
	}

	return (
		<Dialog open={open()} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>Configure your music library</DialogDescription>
				</DialogHeader>

				<div class="grid gap-4 py-4">
					<div class="grid gap-2">
						<Label>Library Path</Label>
						<div class="flex gap-2">
							<Input
								value={libraryPath()}
								onInput={(e) => setLibraryPath(e.currentTarget.value)}
								placeholder="/path/to/music"
								class="flex-1"
								readOnly
							/>
							<Button
								variant="outline"
								onClick={handleSelectFolder}
								disabled={selectFolder.isPending}
							>
								Browse
							</Button>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						onClick={handleSave}
						disabled={!libraryPath() || updateSettings.isPending}
					>
						<Show when={updateSettings.isPending} fallback="Save">
							Saving...
						</Show>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
