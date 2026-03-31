import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Label } from "@repo/ui/components/label";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@repo/ui/components/section";
import { Slider } from "@repo/ui/components/slider";
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
import { Search } from "lucide-solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { orpc } from "#lib/api";
import { useMutation } from "#lib/query";

export const Route = createFileRoute("/quality/duplicates")({
	component: DuplicatesPage,
});

type FindDuplicatesResult = Awaited<
	ReturnType<typeof orpc.library.findDuplicates.call>
>;
type DuplicateTrack = FindDuplicatesResult["duplicateGroups"][number][number];

function DuplicatesPage() {
	const [probability, setProbability] = createSignal(0.8);
	const [matchTags, setMatchTags] = createSignal(true);
	const [matchFilename, setMatchFilename] = createSignal(false);
	const [selected, setSelected] = createSignal<Set<string>>(new Set());

	const findDuplicates = useMutation(() =>
		orpc.library.findDuplicates.mutationOptions(),
	);

	const batchDelete = useMutation(() =>
		orpc.library.batchDelete.mutationOptions(),
	);

	function handleFind() {
		setSelected(new Set<string>());
		findDuplicates.mutate({
			probability: probability(),
			matchTags: matchTags(),
			matchFilename: matchFilename(),
		});
	}

	function toggleSelect(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function keepHighestBitrate() {
		const groups = findDuplicates.data?.duplicateGroups;
		if (!groups) return;

		const toSelect = new Set<string>();
		for (const group of groups) {
			let highestIdx = 0;
			let highestBitrate = group[0]?.bitrate ?? 0;
			for (let i = 1; i < group.length; i++) {
				const b = group[i]?.bitrate ?? 0;
				if (b > highestBitrate) {
					highestBitrate = b;
					highestIdx = i;
				}
			}
			for (let i = 0; i < group.length; i++) {
				if (i !== highestIdx) {
					const track = group[i];
					if (track) toSelect.add(track.id);
				}
			}
		}
		setSelected(toSelect);
	}

	async function handleDelete() {
		const ids = [...selected()];
		if (ids.length === 0) return;

		try {
			const result = await batchDelete.mutateAsync({ ids });
			toast.success(`Deleted ${result.deleted} track(s)`);
			if (result.errors.length > 0) {
				toast.error(`${result.errors.length} file(s) failed to delete`);
			}
			setSelected(new Set<string>());
			// Re-run search to refresh results
			handleFind();
		} catch {
			toast.error("Failed to delete tracks");
		}
	}

	function groupTitle(group: DuplicateTrack[], index: number) {
		const first = group[0];
		const title = first?.title ?? "Unknown";
		const artist = first?.artist ?? "Unknown";
		return `Group ${index + 1} -- ${title} by ${artist}`;
	}

	return (
		<>
			<Section>
				<SectionHeader>
					<SectionTitle>Duplicates</SectionTitle>
				</SectionHeader>

				<SectionContent>
					<div class="flex flex-col gap-6">
						<p class="text-sm text-muted-foreground">
							Find tracks that may be duplicates based on metadata similarity.
						</p>

						<div class="flex items-end gap-6">
							<div class="flex flex-col gap-2">
								<Label>Similarity: {Math.round(probability() * 100)}%</Label>
								<Slider
									value={[probability()]}
									minValue={0.1}
									maxValue={1}
									step={0.05}
									onChange={(v) => {
										const val = v[0];
										if (val != null) setProbability(val);
									}}
									class="w-64"
								/>
							</div>

							<Checkbox
								checked={matchTags()}
								onChange={setMatchTags}
								label="Match by tags"
							/>

							<Checkbox
								checked={matchFilename()}
								onChange={setMatchFilename}
								label="Match by filename"
							/>

							<Button
								onClick={handleFind}
								disabled={
									findDuplicates.isPending || (!matchTags() && !matchFilename())
								}
							>
								<Show
									when={findDuplicates.isPending}
									fallback="Find Duplicates"
								>
									Searching...
								</Show>
							</Button>
						</div>
					</div>
				</SectionContent>
			</Section>

			<Switch>
				<Match when={findDuplicates.data}>
					{(data) => (
						<Section>
							<SectionHeader>
								<SectionTitle as="h3">Results</SectionTitle>
								<div class="flex items-center gap-3">
									<span class="text-sm text-muted-foreground">
										{data().duplicateGroups.length} group(s) found
									</span>
									<Show when={data().duplicateGroups.length > 0}>
										<Button
											variant="outline"
											size="sm"
											onClick={keepHighestBitrate}
										>
											Keep Highest Bitrate
										</Button>
										<Button
											variant="destructive"
											size="sm"
											onClick={handleDelete}
											disabled={selected().size === 0 || batchDelete.isPending}
										>
											<Show
												when={batchDelete.isPending}
												fallback={`Delete Selected (${selected().size})`}
											>
												Deleting...
											</Show>
										</Button>
									</Show>
								</div>
							</SectionHeader>

							<SectionContent>
								<Show
									when={data().duplicateGroups.length > 0}
									fallback={
										<EmptyState
											icon={<Search />}
											title="No duplicates found"
											description="Your library looks clean!"
										/>
									}
								>
									<div class="flex flex-col gap-8">
										<For each={data().duplicateGroups}>
											{(group, i) => (
												<div class="flex flex-col gap-2">
													<h4 class="text-xs font-bold uppercase tracking-widest">
														{groupTitle(group, i())}
													</h4>
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead class="w-10" />
																<TableHead>Title</TableHead>
																<TableHead>Artist</TableHead>
																<TableHead>Bitrate</TableHead>
																<TableHead>File</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															<For each={group}>
																{(track) => (
																	<TableRow>
																		<TableCell>
																			<Checkbox
																				checked={selected().has(track.id)}
																				onChange={() => toggleSelect(track.id)}
																			/>
																		</TableCell>
																		<TableCell>{track.title ?? "--"}</TableCell>
																		<TableCell>
																			{track.artist ?? "--"}
																		</TableCell>
																		<TableCell>
																			{track.bitrate
																				? `${track.bitrate} kbps`
																				: "--"}
																		</TableCell>
																		<TableCell class="max-w-[300px] truncate text-muted-foreground">
																			{track.filepath ?? track.filename ?? "--"}
																		</TableCell>
																	</TableRow>
																)}
															</For>
														</TableBody>
													</Table>
												</div>
											)}
										</For>
									</div>
								</Show>
							</SectionContent>
						</Section>
					)}
				</Match>
				<Match when={findDuplicates.isIdle}>
					<Section>
						<SectionContent>
							<EmptyState
								icon={<Search />}
								title="Scan for duplicates"
								description='Configure options and click "Find Duplicates" to scan your library.'
							/>
						</SectionContent>
					</Section>
				</Match>
			</Switch>
		</>
	);
}
