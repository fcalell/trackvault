import { FILE_ORGANIZER_PRESETS } from "@repo/constants/file-organizer";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@repo/ui/components/section";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/toast";
import { createFileRoute } from "@tanstack/solid-router";
import { FolderTree } from "lucide-solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { orpc } from "#lib/api";
import { useMutation } from "#lib/query";

export const Route = createFileRoute("/quality/file-organizer")({
	component: FileOrganizerPage,
});

function FileOrganizerPage() {
	const [pattern, setPattern] = createSignal<string>(
		FILE_ORGANIZER_PRESETS[0].pattern,
	);
	const [confirmOpen, setConfirmOpen] = createSignal(false);

	const preview = useMutation(() =>
		orpc.quality.fileOrganizer.preview.mutationOptions(),
	);

	const execute = useMutation(() =>
		orpc.quality.fileOrganizer.execute.mutationOptions(),
	);

	function handlePresetChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value;
		if (value) setPattern(value);
	}

	function handlePreview() {
		preview.mutate({ pattern: pattern() });
	}

	async function handleExecute() {
		setConfirmOpen(false);
		try {
			const result = await execute.mutateAsync({ pattern: pattern() });
			toast.success(`Moved ${result.moved} file(s)`);
			if (result.errors.length > 0) {
				toast.error(`${result.errors.length} file(s) failed to move`);
			}
			// Re-run preview to refresh
			handlePreview();
		} catch {
			toast.error("Failed to organize files");
		}
	}

	const moveCount = () => preview.data?.moves.length ?? 0;
	const alreadyInPlace = () => preview.data?.alreadyInPlace ?? 0;

	return (
		<>
			<Section>
				<SectionHeader>
					<SectionTitle>File Organizer</SectionTitle>
				</SectionHeader>

				<SectionContent>
					<div class="flex flex-col gap-4">
						<p class="text-sm text-muted-foreground">
							Reorganize files into a consistent folder structure based on track
							metadata.
						</p>

						<div class="flex flex-col gap-4">
							<div class="flex flex-col gap-2">
								<Label>Preset</Label>
								<select
									class="h-9 w-64 border border-input bg-background px-3 text-sm"
									onChange={handlePresetChange}
								>
									<For each={FILE_ORGANIZER_PRESETS}>
										{(preset) => (
											<option
												value={preset.pattern}
												selected={preset.pattern === pattern()}
											>
												{preset.label}
											</option>
										)}
									</For>
								</select>
							</div>

							<div class="flex flex-col gap-2">
								<Label>Pattern</Label>
								<Input
									value={pattern()}
									onInput={(e) => setPattern(e.currentTarget.value)}
									class="max-w-md"
									placeholder="{artist}/{album}/{title}"
								/>
								<p class="text-xs text-muted-foreground">
									Available tokens: {"{artist}"}, {"{album}"}, {"{title}"},{" "}
									{"{genre}"}
								</p>
							</div>

							<div>
								<Button
									onClick={handlePreview}
									disabled={!pattern() || preview.isPending}
								>
									<Show when={preview.isPending} fallback="Preview Changes">
										Previewing...
									</Show>
								</Button>
							</div>
						</div>
					</div>
				</SectionContent>
			</Section>

			<Switch>
				<Match when={preview.data}>
					<Section>
						<SectionHeader>
							<SectionTitle as="h3">Preview</SectionTitle>
							<div class="flex items-center gap-3">
								<span class="text-sm text-muted-foreground">
									{moveCount()} file(s) will be moved ({alreadyInPlace()}{" "}
									already in place)
								</span>
								<Show when={moveCount() > 0}>
									<Button
										size="sm"
										onClick={() => setConfirmOpen(true)}
										disabled={execute.isPending}
									>
										<Show
											when={execute.isPending}
											fallback={`Organize ${moveCount()} Files`}
										>
											Organizing...
										</Show>
									</Button>
								</Show>
							</div>
						</SectionHeader>

						<SectionContent>
							<Show
								when={moveCount() > 0}
								fallback={
									<EmptyState
										icon={<FolderTree />}
										title="All files in place"
										description="Every file already matches the selected pattern."
									/>
								}
							>
								<div class="max-h-[500px] overflow-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Current Path</TableHead>
												<TableHead>New Path</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											<For each={preview.data?.moves}>
												{(move) => (
													<TableRow>
														<TableCell class="max-w-[400px] truncate text-muted-foreground">
															{move.currentPath}
														</TableCell>
														<TableCell class="max-w-[400px] truncate">
															{move.newPath}
														</TableCell>
													</TableRow>
												)}
											</For>
										</TableBody>
									</Table>
								</div>
							</Show>
						</SectionContent>
					</Section>
				</Match>
				<Match when={preview.isIdle}>
					<Section>
						<SectionContent>
							<EmptyState
								icon={<FolderTree />}
								title="Preview file organization"
								description='Select a pattern and click "Preview Changes" to see what will be moved.'
							/>
						</SectionContent>
					</Section>
				</Match>
			</Switch>

			<Dialog open={confirmOpen()} onOpenChange={setConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm File Organization</DialogTitle>
						<DialogDescription>
							This will move {moveCount()} file(s) to new locations based on the
							pattern "{pattern()}". This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleExecute}>Move {moveCount()} Files</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
