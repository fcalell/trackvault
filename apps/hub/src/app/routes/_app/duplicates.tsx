import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { toast } from "@fcalell/plugin-react-ui/lib/toast";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { queuedBatch } from "../../ui/batch.ts";
import { DUPE_REASONS } from "../../ui/duplicates.ts";
import { bitrate, count, duration, size } from "../../ui/figures.ts";
import { trackRow } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/duplicates")({
	component: Duplicates,
});

type Groups = AppRouter["dupes"]["groups"]["__output"];
type Group = Groups["groups"][number];
type Member = Group["members"][number];
type View = "open" | "dismissed";

const VIEWS: Record<View, string> = {
	open: "Open",
	dismissed: "Not duplicates",
};

const PAGE = 100;

const plural = (n: number, noun: string): string =>
	`${count(n)} ${noun}${n === 1 ? "" : "s"}`;

// What tells the copies apart, side by side: the file, its quality, its tags, and
// what Rekordbox and the playlists hold of it.
const facts = (member: Member) => [
	bitrate(member.format, member.bitrate),
	duration(member.durationMs) ?? "No length",
	...(member.size === null ? [] : [size(member.size)]),
	`${member.tags} of ${member.tagSlots} tags`,
	plural(member.cues, "cue"),
	`In ${plural(member.playlists, "playlist")}`,
	...(member.path ? [{ code: member.path }] : []),
];

// The duplicate groups the last search found, each a band over its tracks: the
// keeper first, with why it was picked. A group merges into its keeper (tags filled,
// the others quarantined) or is dismissed as "not duplicates", and the dismissed
// ones can be read and brought back.
function Duplicates() {
	const [limit, setLimit] = useState(PAGE);
	const [view, setView] = useState<View>("open");
	const merge = useMutation(orpc.dupes.merge.mutationOptions());
	const dismiss = useMutation(orpc.dupes.dismiss.mutationOptions());
	const restore = useMutation(orpc.dupes.restore.mutationOptions());
	const keep = useMutation(orpc.dupes.keep.mutationOptions());
	const groups = orpc.dupes.groups.read({ limit, state: view });
	const status = orpc.dupes.status.read();
	const found = useRead(groups);
	const total = found?.total ?? 0;

	const dismissGroup = async (group: Group) => {
		await dismiss.mutateAsync({ id: group.id });
		toast("Marked as not duplicates", {
			act: {
				label: "Undo",
				onAct: () => restore.mutateAsync({ id: group.id }),
			},
		});
	};
	const keepMember = async (group: Group, member: Member) => {
		const previous = await keep.mutateAsync({
			id: group.id,
			trackId: member.id,
		});
		toast("Keeper changed", {
			act: {
				label: "Undo",
				onAct: () =>
					keep.mutateAsync({
						id: group.id,
						trackId: previous.keeperId,
						reason: previous.keeperReason,
					}),
			},
		});
	};
	const bringBack = async (group: Group) => {
		await restore.mutateAsync({ id: group.id });
		toast("Back among the duplicates", {
			act: {
				label: "Undo",
				onAct: () => dismiss.mutateAsync({ id: group.id }),
			},
		});
	};

	const rowsOf = (data: Groups): Row[] =>
		data.groups.flatMap((group) =>
			group.members.map((member) =>
				trackRow(member, {
					key: `${group.id}-${member.id}`,
					group: String(group.id),
					leading: {
						icon:
							member.id === group.keeperId
								? ("Check" as const)
								: ("Copy" as const),
					},
					facts: facts(member),
					note:
						member.id === group.keeperId
							? `Keeper: ${group.keeperReason}`
							: undefined,
					more:
						view === "dismissed"
							? [
									{
										label: "These are duplicates",
										onAct: () => bringBack(group),
									},
								]
							: [
									...(member.id === group.keeperId
										? []
										: [
												{
													label: "Keep this one instead",
													confirm: {
														title: "Keep this one instead?",
														sentence:
															"A merge keeps this file, and the other copies go to the quarantine.",
													},
													onAct: () => keepMember(group, member),
												},
											]),
									{
										label: "Not duplicates",
										confirm: {
											title: "These are not duplicates?",
											sentence:
												"The group leaves this list and later searches do not offer it again. Bring it back from the Not duplicates view.",
										},
										onAct: () => dismissGroup(group),
									},
								],
				}),
			),
		);

	const band = (group: Group) => ({
		key: String(group.id),
		label: `${DUPE_REASONS[group.reason]} - ${group.members.length} tracks`,
		act:
			view === "dismissed"
				? {
						icon: "Undo2" as const,
						label: "These are duplicates",
						onAct: () => bringBack(group),
					}
				: {
						icon: "Merge" as const,
						label: "Merge into the keeper",
						confirm: {
							title: "Merge this group?",
							sentence:
								"The keeper gets the tags it lacks and the other files move to the quarantine. Undo the batch in History.",
						},
						onAct: () =>
							queuedBatch(
								merge.mutateAsync({ groupIds: [group.id] }),
								"Merging the group",
							),
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
					onAct: () =>
						queuedBatch(
							merge.mutateAsync({ reason: "exact" }),
							"Merging every exact duplicate",
						),
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
			<Toolbar
				filters={[
					{
						label: "Show",
						placeholder: "Open",
						options: status.at((each) =>
							(Object.keys(VIEWS) as View[]).map((value) => ({
								value,
								label: VIEWS[value],
								line: count(each[value]),
							})),
						),
						value: view,
						onChange: (value) => {
							setView(value === "dismissed" ? "dismissed" : "open");
							setLimit(PAGE);
						},
					},
				]}
			/>
			<Section
				items={groups.at(rowsOf)}
				groups={groups.at((data) => data.groups.map(band))}
				empty={{
					sentence:
						view === "open"
							? "No duplicates found. Find duplicates to search the library."
							: "No group was marked as not duplicates.",
					act:
						view === "open"
							? {
									label: "Find duplicates",
									onAct: () => orpc.dupes.run.call(),
									done: "Looking for duplicates",
									to: "/jobs",
								}
							: undefined,
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
