import { Input } from "@repo/ui/components/input";
import { useLocation, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { orpc } from "#lib/api";
import { useQuery } from "#lib/query";

type FacetItem = { name: string; count: number };

const issueFilters = [
	{ key: "noArtist", label: "No Artist", severity: "error" },
	{ key: "noGenre", label: "No Genre", severity: "error" },
	{ key: "noAlbum", label: "No Album", severity: "warning" },
	{ key: "noYear", label: "No Year", severity: "warning" },
	{ key: "lowBitrate", label: "Low Bitrate", severity: "warning" },
] as const;

const facetTypes = [
	{ key: "artist", label: "By Artist" },
	{ key: "album", label: "By Album" },
	{ key: "genre", label: "By Genre" },
] as const;

export default function LibrarySidebar() {
	const navigate = useNavigate();
	const location = useLocation();
	const [expandedFacet, setExpandedFacet] = createSignal<string | null>(null);
	const [facetFilter, setFacetFilter] = createSignal("");

	const facetsQuery = useQuery(() => orpc.library.facets.queryOptions({}));

	const activeFilter = createMemo(() => {
		const params = new URLSearchParams(location().search);
		return {
			facet: params.get("facet"),
			value: params.get("value"),
			issue: params.get("issue"),
		};
	});

	function setFilter(params: Record<string, string | null>) {
		const searchObj: Record<string, string> = {};
		for (const [k, v] of Object.entries(params)) {
			if (v) searchObj[k] = v;
		}
		navigate({ to: "/library", search: searchObj } as never);
	}

	function clearFilter() {
		navigate({ to: "/library", search: {} } as never);
	}

	function toggleFacet(key: string) {
		setExpandedFacet((prev) => (prev === key ? null : key));
		setFacetFilter("");
	}

	function getFacetItems(key: string): FacetItem[] {
		const data = facetsQuery.data;
		if (!data) return [];
		if (key === "artist") return data.artists;
		if (key === "album") return data.albums;
		if (key === "genre") return data.genres;
		return [];
	}

	const filteredFacetItems = createMemo(() => {
		const expanded = expandedFacet();
		if (!expanded) return [];
		const items = getFacetItems(expanded);
		const filter = facetFilter().toLowerCase();
		if (!filter) return items.slice(0, 20);
		return items
			.filter((i) => i.name.toLowerCase().includes(filter))
			.slice(0, 20);
	});

	return (
		<div>
			{/* Browse section */}
			<div class="border-b border-input">
				<div class="px-4 pt-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
					Browse
				</div>
				<button
					type="button"
					class="flex w-full items-center gap-2.5 px-4 py-2 text-xs transition-colors hover:bg-muted hover:text-foreground"
					classList={{
						"text-foreground bg-background shadow-[inset_2px_0_0_var(--color-primary)]":
							!activeFilter().facet && !activeFilter().issue,
						"text-muted-foreground":
							!!activeFilter().facet || !!activeFilter().issue,
					}}
					onClick={clearFilter}
				>
					<span class="text-[11px]">*</span> All Tracks
					<Show when={facetsQuery.data}>
						{(d) => (
							<span class="ml-auto bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
								{d().totalCount.toLocaleString()}
							</span>
						)}
					</Show>
				</button>

				<For each={facetTypes}>
					{(facet) => (
						<>
							<button
								type="button"
								class="flex w-full items-center gap-2.5 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
								classList={{
									"text-foreground": expandedFacet() === facet.key,
								}}
								onClick={() => toggleFacet(facet.key)}
							>
								<span class="text-[11px]">#</span> {facet.label}
								<span class="ml-auto text-[10px]">
									{expandedFacet() === facet.key ? "▾" : "▸"}
								</span>
							</button>

							<Show when={expandedFacet() === facet.key}>
								<div class="border-y border-input bg-background">
									<div class="px-4 py-1.5 pl-8">
										<Input
											placeholder={`Filter ${facet.label.toLowerCase().replace("by ", "")}...`}
											value={facetFilter()}
											onInput={(e) => setFacetFilter(e.currentTarget.value)}
											class="h-7 text-[11px]"
										/>
									</div>
									<For each={filteredFacetItems()}>
										{(item) => (
											<button
												type="button"
												class="flex w-full items-center gap-2 py-1.5 pr-4 pl-8 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
												classList={{
													"text-foreground bg-background shadow-[inset_2px_0_0_var(--color-primary)]":
														activeFilter().facet === facet.key &&
														activeFilter().value === item.name,
												}}
												onClick={() =>
													setFilter({ facet: facet.key, value: item.name })
												}
											>
												{item.name}
												<span class="ml-auto bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
													{item.count}
												</span>
											</button>
										)}
									</For>
								</div>
							</Show>
						</>
					)}
				</For>
			</div>

			{/* Issues section */}
			<div>
				<div class="px-4 pt-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
					Issues
				</div>
				<For each={issueFilters}>
					{(issue) => (
						<button
							type="button"
							class="flex w-full items-center gap-2.5 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							classList={{
								"text-foreground bg-background shadow-[inset_2px_0_0_var(--color-primary)]":
									activeFilter().issue === issue.key,
							}}
							onClick={() => setFilter({ issue: issue.key })}
						>
							<span
								class="inline-block size-2"
								classList={{
									"bg-destructive": issue.severity === "error",
									"bg-yellow-500": issue.severity === "warning",
								}}
							/>
							{issue.label}
							<Show when={facetsQuery.data}>
								{(d) => {
									const issues = d().issues;
									const count = issues[issue.key as keyof typeof issues] ?? 0;
									return (
										<span class="ml-auto bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
											{count.toLocaleString()}
										</span>
									);
								}}
							</Show>
						</button>
					)}
				</For>
			</div>
		</div>
	);
}
