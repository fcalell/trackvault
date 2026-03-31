import { STANDARD_GENRES } from "@repo/constants/genres";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Input } from "@repo/ui/components/input";
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
import { Tags } from "lucide-solid";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { orpc } from "#lib/api";
import { useMutation } from "#lib/query";

export const Route = createFileRoute("/quality/genre-normalization")({
	component: GenreNormalizationPage,
});

type ScanResult = {
	current: string;
	suggested: string;
	trackCount: number;
};

function GenreNormalizationPage() {
	const [mappings, setMappings] = createSignal<Map<string, string>>(new Map());

	const scan = useMutation(() =>
		orpc.quality.genreNormalization.scan.mutationOptions(),
	);

	const apply = useMutation(() =>
		orpc.quality.genreNormalization.apply.mutationOptions(),
	);

	function handleScan() {
		scan.mutate(undefined as never, {
			onSuccess(data: ScanResult[]) {
				const initial = new Map<string, string>();
				for (const row of data) {
					initial.set(row.current, row.suggested);
				}
				setMappings(initial);
			},
		});
	}

	function updateMapping(from: string, to: string) {
		setMappings((prev) => {
			const next = new Map(prev);
			next.set(from, to);
			return next;
		});
	}

	async function applyOne(from: string) {
		const to = mappings().get(from);
		if (!to || from === to) return;

		try {
			const result = await apply.mutateAsync({
				mappings: [{ from, to }],
			});
			toast.success(`Updated ${result.updated} track(s)`);
			handleScan();
		} catch {
			toast.error("Failed to apply genre mapping");
		}
	}

	async function applyAll() {
		const allMappings = [...mappings().entries()]
			.filter(([from, to]) => from !== to)
			.map(([from, to]) => ({ from, to }));

		if (allMappings.length === 0) {
			toast.info("No changes to apply");
			return;
		}

		try {
			const result = await apply.mutateAsync({ mappings: allMappings });
			toast.success(`Updated ${result.updated} track(s)`);
			handleScan();
		} catch {
			toast.error("Failed to apply genre mappings");
		}
	}

	const nonStandardResults = () => {
		const data = scan.data as ScanResult[] | undefined;
		if (!data) return [];
		return data.filter(
			(r) =>
				!STANDARD_GENRES.includes(
					r.current as (typeof STANDARD_GENRES)[number],
				),
		);
	};

	const totalAffectedTracks = () =>
		nonStandardResults().reduce((sum, r) => sum + r.trackCount, 0);

	return (
		<>
			<Section>
				<SectionHeader>
					<SectionTitle>Genre Normalization</SectionTitle>
				</SectionHeader>

				<SectionContent>
					<div class="flex flex-col gap-4">
						<p class="text-sm text-muted-foreground">
							Find non-standard genre tags and normalize them to a consistent
							set.
						</p>
						<div>
							<Button onClick={handleScan} disabled={scan.isPending}>
								<Show
									when={scan.isPending}
									fallback="Scan for Non-Standard Genres"
								>
									Scanning...
								</Show>
							</Button>
						</div>
					</div>
				</SectionContent>
			</Section>

			<Switch>
				<Match when={scan.data}>
					<Section>
						<SectionHeader>
							<SectionTitle as="h3">Results</SectionTitle>
							<div class="flex items-center gap-3">
								<span class="text-sm text-muted-foreground">
									{nonStandardResults().length} non-standard genre(s) found (
									{totalAffectedTracks()} tracks affected)
								</span>
								<Show when={nonStandardResults().length > 0}>
									<Button
										variant="outline"
										size="sm"
										onClick={applyAll}
										disabled={apply.isPending}
									>
										<Show when={apply.isPending} fallback="Apply All">
											Applying...
										</Show>
									</Button>
								</Show>
							</div>
						</SectionHeader>

						<SectionContent>
							<Show
								when={nonStandardResults().length > 0}
								fallback={
									<EmptyState
										icon={<Tags />}
										title="All genres are standard"
										description="Your library genres look great!"
									/>
								}
							>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Current Genre</TableHead>
											<TableHead>Suggested</TableHead>
											<TableHead>Track Count</TableHead>
											<TableHead class="w-24" />
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={nonStandardResults()}>
											{(row) => (
												<TableRow>
													<TableCell class="font-medium">
														{row.current}
													</TableCell>
													<TableCell>
														<Input
															value={
																mappings().get(row.current) ?? row.suggested
															}
															onInput={(e) =>
																updateMapping(
																	row.current,
																	e.currentTarget.value,
																)
															}
															class="max-w-[200px]"
															list="standard-genres"
														/>
													</TableCell>
													<TableCell>{row.trackCount}</TableCell>
													<TableCell>
														<Button
															variant="outline"
															size="sm"
															onClick={() => applyOne(row.current)}
															disabled={
																apply.isPending ||
																mappings().get(row.current) === row.current
															}
														>
															Apply
														</Button>
													</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>

								<datalist id="standard-genres">
									<For each={[...STANDARD_GENRES]}>
										{(genre) => <option value={genre} />}
									</For>
								</datalist>
							</Show>
						</SectionContent>
					</Section>
				</Match>
				<Match when={scan.isIdle}>
					<Section>
						<SectionContent>
							<EmptyState
								icon={<Tags />}
								title="Scan your genres"
								description="Click the button above to find non-standard genres in your library."
							/>
						</SectionContent>
					</Section>
				</Match>
			</Switch>
		</>
	);
}
