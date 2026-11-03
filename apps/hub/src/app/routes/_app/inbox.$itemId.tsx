import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import type { ChipMark } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { fieldLabel } from "../../lib/changes.ts";
import {
	DECISION,
	INBOX_STATE,
	megabytes,
	SOURCE_LABELS,
	STEP_ICON,
	STEP_TONE,
} from "../../ui/acquire.ts";
import { clock, quality } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/inbox/$itemId")({
	loader: ({ context, params }) =>
		preload(context.queryClient, orpc.inbox.get.read({ id: params.itemId })),
	component: Item,
});

const KINDS = {
	exact: "Same audio",
	acoustic: "Sounds the same",
	fuzzy: "Same artist and title",
} as const;

const decisionFacts = (kind: string): ChipMark[] => {
	const mark = DECISION[kind];
	return mark ? [mark] : [];
};

// One inbox item: where it stands in the pipeline, the verdict and why, what the
// cleanup would do to its tags, the library tracks it matched, and where it will be
// filed.
function Item() {
	const { itemId } = Route.useParams();
	const item = orpc.inbox.get.read({ id: itemId });
	const approve = useMutation(orpc.inbox.approve.mutationOptions());
	const reject = useMutation(orpc.inbox.reject.mutationOptions());
	const keep = useMutation(orpc.inbox.keep.mutationOptions());
	const retry = useMutation(orpc.inbox.retry.mutationOptions());
	const replace = useMutation(orpc.inbox.replace.mutationOptions());
	const items = { ids: [itemId] };

	return (
		<Pane
			title={item.at((each) => each.label)}
			noun="file"
			read={item}
			back="/inbox"
			record={{
				within: "Inbox",
				overline: [
					item.at((each) =>
						each.sourceRef
							? `${SOURCE_LABELS[each.source]} · ${each.sourceRef}`
							: SOURCE_LABELS[each.source],
					),
				],
				facts: [
					item.at((each) => INBOX_STATE[each.state]?.label ?? each.state),
					item.at((each) =>
						each.format ? quality(each.format, each.bitrate) : "Not read yet",
					),
					item.at((each) => clock(each.durationMs) ?? "No length"),
					item.at((each) => megabytes(each.size)),
				],
			}}
			acts={[
				{
					icon: "Check",
					label: "Approve",
					blocked: item.at((each) =>
						each.state === "awaiting-approval" ? undefined : "Not ready yet",
					),
					onAct: () => approve.mutateAsync({ items }),
					done: "Filing the track",
				},
				{
					icon: "ListRestart",
					label: "Keep it anyway",
					blocked: item.at((each) =>
						each.canKeep ? undefined : "Nothing to override",
					),
					onAct: () => keep.mutateAsync({ items }),
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
											? [`Replaces ${each.decision.replaces.label}`]
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
				items={item.at((each) =>
					each.steps.map((step) => ({
						key: step.id,
						leading: { icon: STEP_ICON[step.id] ?? ("Cog" as const) },
						title: step.label,
						facts: [{ tone: STEP_TONE[step.status] ?? ("idle" as const) }],
						line: step.reason ?? undefined,
					})),
				)}
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
					each.matches.map((match) => ({
						key: match.trackId,
						leading: { icon: "Music" as const },
						title: match.label,
						href: `/library/${match.trackId}`,
						facts: [
							KINDS[match.kind],
							match.version === "different"
								? "Another version"
								: "Same version",
							quality(match.format, match.bitrate),
						],
						trailing: { value: `${Math.round(match.confidence * 100)}%` },
						more:
							each.state === "duplicate" || each.state === "needs-review"
								? [
										{
											label: "Replace this track",
											confirm: {
												title: `Replace ${match.label}?`,
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
					})),
				)}
				empty={{ sentence: "Nothing in the library matches this file." }}
			/>
		</Pane>
	);
}
