import {
	preload,
	useMutation,
	useRead,
} from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { player } from "@fcalell/plugin-react-ui/lib/player";
import type { ChipMark, TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { fieldLabel } from "../../lib/changes.ts";
import {
	DECISION,
	INBOX_STATE,
	SOURCE_LABELS,
	STEP_ICON,
	STEP_TONE,
	VERSION,
} from "../../ui/acquire.ts";
import { queuedBatch } from "../../ui/batch.ts";
import { bitrate, bpm, duration, size } from "../../ui/figures.ts";
import { toTrack, trackRow, trackTitle } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/inbox/$itemId")({
	loader: ({ context, params }) =>
		preload(context.queryClient, orpc.inbox.get.read({ id: params.itemId })),
	component: Item,
});

type Loaded = AppRouter["inbox"]["get"]["__output"];

const KINDS = {
	exact: "Same audio",
	acoustic: "Sounds the same",
	fuzzy: "Same artist and title",
} as const;

const decisionFacts = (kind: string): ChipMark[] => {
	const mark = DECISION[kind];
	return mark ? [mark] : [];
};

// The library copy the file is held against: the one it would replace, else the best match.
const copyOf = (item: Loaded): Loaded["matches"][number] | undefined =>
	item.matches.find(
		(match) => match.trackId === item.decision?.replaces?.trackId,
	) ?? item.matches[0];

interface Fact {
	key: string;
	fact: string;
	incoming: string | number | null;
	library: string | number | null;
}

// The file beside the library copy, fact by fact.
function compare(item: Loaded): Fact[] {
	const copy = copyOf(item);
	return [
		{
			key: "title",
			fact: "Title",
			incoming: trackTitle(item),
			library: copy ? trackTitle(copy) : null,
		},
		{
			key: "artist",
			fact: "Artist",
			incoming: item.artist,
			library: copy?.artist ?? null,
		},
		{
			key: "quality",
			fact: "Quality",
			incoming: item.format ? bitrate(item.format, item.bitrate) : null,
			library: copy ? bitrate(copy.format, copy.bitrate) : null,
		},
		{
			key: "length",
			fact: "Length",
			incoming: duration(item.durationMs),
			library: copy ? duration(copy.durationMs) : null,
		},
		{
			key: "size",
			fact: "Size",
			incoming: size(item.size),
			library: copy?.size ? size(copy.size) : null,
		},
		{
			key: "path",
			fact: "Path",
			incoming: item.path,
			library: copy?.path ?? null,
		},
		{
			key: "genre",
			fact: "Genre",
			incoming: item.genre,
			library: copy?.genre ?? null,
		},
		{ key: "key", fact: "Key", incoming: item.key, library: copy?.key ?? null },
		{
			key: "bpm",
			fact: "BPM",
			incoming: bpm(Number(item.bpm) || null),
			library: bpm(copy?.bpm ?? null),
		},
		{
			key: "year",
			fact: "Year",
			incoming: item.year,
			library: copy?.year ?? null,
		},
	];
}

const COMPARE: TableColumn<Fact>[] = [
	{ key: "fact", label: "Fact", cell: (row) => row.fact },
	{
		key: "incoming",
		label: "This file",
		wrap: true,
		cell: (row) => row.incoming,
	},
	{
		key: "library",
		label: "In the library",
		wrap: true,
		cell: (row) => row.library,
	},
];

// One inbox item: where it stands in the pipeline, the verdict and why, the file
// beside the library copy it matched, what the cleanup would do to its tags, and
// where it will be filed.
function Item() {
	const { itemId } = Route.useParams();
	const item = orpc.inbox.get.read({ id: itemId });
	const loaded = useRead(item);
	const approve = useMutation(orpc.inbox.approve.mutationOptions());
	const reject = useMutation(orpc.inbox.reject.mutationOptions());
	const keep = useMutation(orpc.inbox.keep.mutationOptions());
	const retry = useMutation(orpc.inbox.retry.mutationOptions());
	const replace = useMutation(orpc.inbox.replace.mutationOptions());
	const items = { ids: [itemId] };
	const copy = loaded ? copyOf(loaded) : undefined;

	return (
		<Pane
			title={item.at(trackTitle)}
			noun="file"
			read={item}
			back="/inbox"
			cover
			wide
			record={{
				within: "Inbox",
				overline: [item.at((each) => SOURCE_LABELS[each.source])],
				facts: [
					item.at((each) => INBOX_STATE[each.state]?.label ?? each.state),
					item.at((each) =>
						each.format ? bitrate(each.format, each.bitrate) : "Not read yet",
					),
					item.at((each) => duration(each.durationMs) ?? "No length"),
					item.at((each) => size(each.size)),
				],
			}}
			acts={[
				{
					icon: "Play",
					label: "Play a preview",
					onAct: () => {
						if (loaded)
							player.play(toTrack({ ...loaded, title: trackTitle(loaded) }));
					},
				},
				{
					icon: "Check",
					label: "Approve",
					blocked: item.at((each) =>
						each.state === "awaiting-approval" ? undefined : "Not ready yet",
					),
					onAct: () =>
						queuedBatch(approve.mutateAsync({ items }), "Filing the track"),
				},
				{
					icon: "ListRestart",
					label: "Keep",
					blocked: item.at((each) =>
						each.canKeep ? undefined : "Nothing to override",
					),
					onAct: () => keep.mutateAsync({ items }),
					done: "Running the pipeline again",
				},
				{
					icon: "Replace",
					label: "Replace",
					blocked: item.at((each) =>
						(each.state === "duplicate" || each.state === "needs-review") &&
						copyOf(each)
							? undefined
							: "No library copy to replace",
					),
					confirm: {
						title: "Replace the library copy?",
						sentence:
							"Once approved, this file takes the track's playlists, tags and rating, and the old file goes to the quarantine.",
					},
					onAct: () =>
						copy
							? replace.mutateAsync({ id: itemId, trackId: copy.trackId })
							: Promise.resolve(),
					done: "Running the pipeline again",
				},
				{
					icon: "RotateCcw",
					label: "Try again",
					blocked: item.at((each) =>
						each.state === "failed" ? undefined : "Nothing failed",
					),
					onAct: () => retry.mutateAsync({ items }),
					done: "Running the pipeline again",
				},
				{
					icon: "Trash2",
					label: "Reject",
					destructive: true,
					blocked: item.at((each) =>
						each.state === "approved" || each.state === "rejected"
							? "Already decided"
							: undefined,
					),
					confirm: {
						title: "Reject this file?",
						sentence:
							"The file leaves the inbox and waits in the quarantine's folder until its days are up.",
					},
					onAct: () => reject.mutateAsync({ items }),
					done: "Rejecting",
					to: "/inbox",
				},
			]}
		>
			<Section
				title="Compare"
				description="This file beside the library copy it matched."
			>
				<Table
					label="Compare"
					items={item.at(compare)}
					columns={COMPARE}
					row={{ id: (row) => row.key }}
				/>
			</Section>
			<Section
				title="Verdict"
				items={item.at((each) =>
					each.decision
						? [
								{
									key: "decision",
									label: "Decision",
									title: each.decision.reason,
									wrap: true,
									facts: [
										...decisionFacts(each.decision.kind),
										...(each.decision.replaces
											? [`Replaces ${trackTitle(copyOf(each) ?? each)}`]
											: each.overridden
												? ["Your call"]
												: []),
									],
								},
								...(each.target
									? [
											{
												key: "target",
												label: "Goes to",
												title: { code: each.target },
											},
										]
									: []),
								...(each.cutoff
									? [
											{
												key: "cutoff",
												label: "Spectrum",
												title: each.cutoff.explanation,
												wrap: true,
											},
										]
									: []),
								...(each.error
									? [
											{
												key: "error",
												label: "Error",
												title: each.error,
												wrap: true,
											},
										]
									: []),
							]
						: each.error
							? [
									{
										key: "error",
										label: "Error",
										title: each.error,
										wrap: true,
									},
								]
							: [],
				)}
				empty={{ sentence: "The duplicate check has not run yet." }}
			/>
			<Section
				title="Pipeline"
				items={item.at((each) => [
					...(each.sourceRef
						? [
								{
									key: "source",
									label: "From",
									title: each.sourceRef,
									wrap: true,
								},
							]
						: []),
					...each.steps.map((step) => ({
						key: step.id,
						leading: { icon: STEP_ICON[step.id] ?? ("Cog" as const) },
						title: step.label,
						facts: [{ tone: STEP_TONE[step.status] ?? ("idle" as const) }],
						line: step.reason ?? undefined,
					})),
				])}
			/>
			<Section
				title="Tags"
				items={item.at((each) =>
					each.tags.map((tag) => ({
						key: tag.field,
						label: fieldLabel(tag.field),
						change: tag.before === null ? "added" : "changed",
						title: tag.after ?? { absent: "None" },
						line:
							tag.before === null ? undefined : `In the file: ${tag.before}`,
					})),
				)}
			/>
			<Section
				title="In the library"
				description="Tracks this file matches. Replace one to swap this copy in: playlists, tags and rating move over."
				items={item.at((each) =>
					each.matches.map((match) =>
						trackRow(match, {
							key: match.trackId,
							leading: { icon: "Music" as const },
							href: `/library/${match.trackId}`,
							facts: [
								KINDS[match.kind],
								VERSION[match.version] ?? match.version,
								bitrate(match.format, match.bitrate),
							],
							trailing: { value: `${Math.round(match.confidence * 100)}%` },
							act: {
								icon: "Play" as const,
								label: `Play ${trackTitle(match)}`,
								onAct: () =>
									player.play(
										toTrack({
											...match,
											id: match.trackId,
											title: trackTitle(match),
										}),
									),
							},
							more:
								each.state === "duplicate" || each.state === "needs-review"
									? [
											{
												label: "Replace this track",
												confirm: {
													title: `Replace ${trackTitle(match)}?`,
													sentence:
														"Once approved, this file takes the track's playlists, tags and rating, and the old file goes to the quarantine.",
												},
												onAct: () =>
													replace.mutateAsync({
														id: itemId,
														trackId: match.trackId,
													}),
												done: "Running the pipeline again",
											},
										]
									: [],
						}),
					),
				)}
				empty={{ sentence: "Nothing in the library matches this file." }}
			/>
		</Pane>
	);
}
