import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { Candidates } from "../../lib/candidates.tsx";
import { WANT_SOURCES, WANT_STATE, wantName } from "../../ui/acquire.ts";
import { until } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/wishlist/$wantId")({
	loader: ({ context, params }) =>
		preload(
			context.queryClient,
			orpc.wishlist.get.read({ id: Number(params.wantId) }),
		),
	component: WantRecord,
});

// One want: how the search stands and the candidates the last search kept, ranked.
function WantRecord() {
	const id = Number(Route.useParams().wantId);
	const want = orpc.wishlist.get.read({ id });
	const searchNow = useMutation(orpc.wishlist.searchNow.mutationOptions());
	const ignore = useMutation(orpc.wishlist.ignore.mutationOptions());
	const wants = { ids: [String(id)] };
	return (
		<Pane
			title={want.at(wantName)}
			noun="want"
			read={want}
			back="/wishlist"
			wide
			record={{
				within: "Wishlist",
				overline: [want.at((each) => WANT_SOURCES[each.source] ?? each.source)],
				facts: [
					want.at((each) => WANT_STATE[each.status]?.label ?? each.status),
					want.at((each) => `${each.attempts} searches`),
				],
			}}
			acts={[
				{
					icon: "Search",
					label: "Search now",
					onAct: () => searchNow.mutateAsync({ wants }),
					done: "Searching Soulseek",
				},
				{
					icon: "EyeOff",
					label: "Ignore",
					onAct: () => ignore.mutateAsync({ wants, ignored: true }),
					done: "Ignored",
				},
			]}
		>
			<Section
				title="Search"
				items={want.at((each) => [
					{
						key: "next",
						label: "Next search",
						title:
							each.status === "wanted" || each.status === "searching"
								? (until(each.nextSearchAt) ?? "When the runner looks")
								: "Not scheduled",
					},
					{
						key: "wants",
						label: "Wants",
						title: each.betterCopy ? "A better copy" : "Any copy",
					},
					{
						key: "last",
						label: "Last search",
						title: each.note ?? "Not searched yet",
						wrap: true,
					},
				])}
			/>
			<Section
				title="Candidates"
				description="From the last search, best first. Download one and the file lands in the inbox."
			>
				<Candidates searchId={`want-${id}`} wantId={id} />
			</Section>
		</Pane>
	);
}
