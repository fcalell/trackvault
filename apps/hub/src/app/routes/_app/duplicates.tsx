import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { clock, quality } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/duplicates")({
	component: Duplicates,
});

type Groups = AppRouter["dupes"]["groups"]["__output"];
type Group = Groups["groups"][number];

const REASONS = {
	exact: "Same audio",
	acoustic: "Sounds the same",
	fuzzy: "Same artist and title",
} as const;

const PAGE = 100;

// The duplicate groups the last search found, each a band over its tracks: the
// keeper first, with why it was picked. A group merges into its keeper (tags filled,
// the others quarantined) or is dismissed for good as "not duplicates".
function Duplicates() {
	const [limit, setLimit] = useState(PAGE);
	const merge = useMutation(orpc.dupes.merge.mutationOptions());
	const dismiss = useMutation(orpc.dupes.dismiss.mutationOptions());
	const keep = useMutation(orpc.dupes.keep.mutationOptions());
	const groups = orpc.dupes.groups.read({ limit });
	const status = orpc.dupes.status.read();
	const found = useRead(groups);
	const total = found?.total ?? 0;

	const rowsOf = (data: Groups): Row[] =>
		data.groups.flatMap((group) =>
			group.members.map((member) => ({
				key: `${group.id}-${member.id}`,
				group: String(group.id),
				leading: {
					icon:
						member.id === group.keeperId
							? ("Check" as const)
							: ("Copy" as const),
				},
				title: [member.artist, member.title ?? "Untitled"]
					.filter(Boolean)
					.join(" - "),
				facts: [
					quality(member.format, member.bitrate),
					clock(member.durationMs) ?? "No length",
					member.id === group.keeperId
						? `Keeper: ${group.keeperReason}`
						: "Duplicate",
				],
				more: [
					...(member.id === group.keeperId
						? []
						: [
								{
									label: "Keep this one instead",
									onAct: () =>
										keep.mutateAsync({ id: group.id, trackId: member.id }),
								},
							]),
					{
						label: "Not duplicates",
						onAct: () => dismiss.mutateAsync({ id: group.id }),
					},
				],
			})),
		);

	const band = (group: Group) => ({
		key: String(group.id),
		label: `${REASONS[group.reason]} - ${group.members.length} tracks`,
		act: {
			icon: "Merge" as const,
			label: "Merge into the keeper",
			confirm: {
				title: "Merge this group?",
				sentence:
					"The keeper gets the tags it lacks and the other files move to the quarantine. Undo the batch in History.",
			},
			onAct: () => merge.mutateAsync({ groupIds: [group.id] }),
			done: "Merging",
			to: "/jobs",
		},
	});

	return (
		<Pane
			title="Duplicates"
			back={false}
			wide
			acts={[
				{
					icon: "Search",
					label: "Find duplicates",
					onAct: () => orpc.dupes.run.call(),
					done: "Looking for duplicates",
					to: "/jobs",
				},
				{
					icon: "Merge",
					label: "Merge every exact duplicate",
					confirm: {
						title: "Merge every exact duplicate?",
						sentence:
							"Groups of identical audio merge into their keepers, and the other files move to the quarantine.",
					},
					onAct: () => merge.mutateAsync({ reason: "exact" }),
					done: "Merging",
					to: "/jobs",
				},
			]}
		>
			<Banner
				tone="attention"
				sentence={status
					.at((each) =>
						each.fpcalc === false
							? "Without fpcalc on the hub's PATH the search compares audio hashes and names only."
							: undefined,
					)
					.or(undefined)}
			/>
			<Section
				items={groups.at(rowsOf)}
				groups={groups.at((data) => data.groups.map(band))}
				empty={{
					sentence:
						"No duplicates found. Find duplicates to search the library.",
				}}
			/>
			{total > limit && (
				<Section
					items={[
						{
							key: "more",
							leading: { icon: "ChevronsDown" as const },
							title: `Showing ${limit} of ${total} groups`,
							act: {
								icon: "Plus" as const,
								label: "Show more groups",
								onAct: () => setLimit((was) => was + PAGE),
							},
						},
					]}
				/>
			)}
		</Pane>
	);
}
