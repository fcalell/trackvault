import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { type Act, sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import type { Picked, TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import {
	PROPOSAL_STATE_LABELS,
	PROPOSAL_VIEWS,
	type ProposalView,
	SOURCE_LABELS,
} from "../../../shared/intelligence.ts";
import { orpc } from "../../lib/api.ts";
import { fieldLabel } from "../../lib/changes.ts";
import { useChosen } from "../../lib/chosen.ts";
import { batchToast, queuedBatch } from "../../ui/batch.ts";
import { count } from "../../ui/figures.ts";
import { trackTitle } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/auto-tag-review")({
	loader: ({ context }) =>
		Promise.all([
			preload(context.queryClient, orpc.autotag.summary.read()),
			preload(
				context.queryClient,
				orpc.autotag.list.window({ state: "pending" }),
			),
		]),
	component: AutoTagReview,
});

type Track = AppRouter["autotag"]["list"]["__output"]["data"][number];

const CONFIDENCES = [70, 85, 95] as const;
const ACCEPT_SENTENCE =
	"The fields are written to the tags of the files on the hub's disk. Undo the batch in History.";

const fieldsOf = (row: Track, side: "before" | "after"): string =>
	row.proposals
		.map((each) => `${fieldLabel(each.field)}: ${each[side] ?? "empty"}`)
		.join(", ");

const COLUMNS: TableColumn<Track>[] = [
	{ key: "title", label: "Title", cell: trackTitle },
	{ key: "artist", label: "Artist", cell: (row) => row.artist },
	{
		key: "change",
		label: "Change",
		width: "1/4",
		wrap: true,
		kind: "change",
		cell: (row) => ({
			before: fieldsOf(row, "before"),
			after: fieldsOf(row, "after"),
		}),
	},
	{
		key: "source",
		label: "Source",
		width: "measure-short",
		wrap: true,
		kind: "chip",
		family: "neutral",
		cell: (row) =>
			[...new Set(row.proposals.map((each) => each.source))]
				.map((source) => SOURCE_LABELS[source] ?? source)
				.join(", "),
	},
	{
		key: "confidence",
		label: "Sure",
		kind: "number",
		cell: (row) =>
			`${Math.min(...row.proposals.map((each) => each.confidence))}%`,
	},
	{
		key: "other",
		label: "Other values",
		hidden: true,
		cell: (row) =>
			row.proposals
				.filter((each) => each.alternatives)
				.map((each) => `${fieldLabel(each.field)}: ${each.alternatives}`)
				.join("; ") || null,
	},
];

// The auto-tag results waiting for a decision: a row per track, its fields as a
// before and after with where they came from and how sure that source is. Accepted
// fields are applied as one batch (History lists it) and written to the files.
function AutoTagReview() {
	const [view, setView] = useState<ProposalView>("pending");
	const [source, setSource] = useState<string | undefined>();
	const [confidence, setConfidence] = useState<number | undefined>();
	const summary = orpc.autotag.summary.read();
	const within = { state: view, source, confidence };
	const items = orpc.autotag.list.window(within);
	const accept = useMutation(orpc.autotag.accept.mutationOptions());
	const reject = useMutation(orpc.autotag.reject.mutationOptions());
	const [picked, setPicked] = useState<Picked<typeof within>>({ ids: [] });
	const waiting = view === "pending";
	const { chosen, blocked: nothing } = useChosen(
		items,
		picked,
		setPicked,
		within,
		"tracks",
	);
	const accepting = (proposals: Picked<typeof within>): Act => ({
		label: "Accept",
		blocked: waiting ? nothing : "Only waiting tracks can be decided.",
		confirm: { title: "Accept these fields?", sentence: ACCEPT_SENTENCE },
		onAct: () =>
			queuedBatch(
				accept.mutateAsync({ proposals, within }),
				"Applying the tags",
			),
	});
	return (
		<Pane
			title="Auto-tag review"
			back={false}
			wide
			acts={[
				{
					icon: "CheckCheck",
					label: "Accept all above a confidence",
					sheet: sheetOf({
						title: "Accept by confidence",
						description:
							"Every waiting field at or above this confidence is accepted, written to the files and applied as one batch. Undo it in History. The rest stays here.",
						form: {
							act: orpc.autotag.acceptAbove,
							values: { confidence: 85 },
							fields: { confidence: { label: "Confidence, percent" } },
							submit: { label: "Accept and apply" },
							onDone: (job) => batchToast(job, "Applying the tags"),
						},
					}),
				},
				{
					icon: "X",
					label: "Reject everything waiting",
					confirm: {
						title: "Reject every waiting field?",
						sentence:
							"They leave this list and are not proposed again for those tracks.",
					},
					onAct: () =>
						reject.mutateAsync({
							proposals: { query: { state: "pending" }, except: [] },
							within: { state: "pending" },
						}),
					done: "Rejected",
				},
			]}
			foot={
				<ActionBar
					chosen={chosen}
					acts={[
						{
							label: "Reject",
							blocked: waiting
								? nothing
								: "Only waiting tracks can be decided.",
							confirm: {
								title: "Reject these fields?",
								sentence:
									"They leave this list and are not proposed again for those tracks.",
							},
							onAct: () => reject.mutateAsync({ proposals: picked, within }),
							done: "Rejected",
						},
						accepting(picked),
					]}
				/>
			}
		>
			<Toolbar
				filters={[
					{
						label: "Show",
						placeholder: "Waiting",
						options: summary.at((each) =>
							PROPOSAL_VIEWS.map((value) => ({
								value,
								label: PROPOSAL_STATE_LABELS[value],
								line: count(each[value]),
							})),
						),
						value: view,
						onChange: (value) => {
							setView((value as ProposalView) ?? "pending");
							setPicked({ ids: [] });
						},
					},
					{
						label: "Source",
						placeholder: "Any source",
						options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({
							value,
							label,
						})),
						value: source,
						onChange: (value) => {
							setSource(value ?? undefined);
							setPicked({ ids: [] });
						},
					},
					{
						label: "Confidence",
						placeholder: "Any confidence",
						options: CONFIDENCES.map((value) => ({
							value: String(value),
							label: `${value}% or more`,
						})),
						value: confidence === undefined ? undefined : String(confidence),
						onChange: (value) => {
							setConfidence(value ? Number(value) : undefined);
							setPicked({ ids: [] });
						},
					},
				]}
			/>
			<Table
				label="Tracks to review"
				items={items}
				columns={COLUMNS}
				row={{
					id: (row) => row.id,
					href: (row) => `/library/${row.id}`,
					act: (row) =>
						waiting
							? {
									...accepting({ ids: [row.id] }),
									icon: "Check",
									label: `Accept ${trackTitle(row)}`,
								}
							: undefined,
					more: (row) =>
						waiting
							? [
									{
										label: "Reject",
										confirm: {
											title: `Reject ${trackTitle(row)}?`,
											sentence:
												"Its fields leave this list and are not proposed again for the track.",
										},
										onAct: () =>
											reject.mutateAsync({
												proposals: { ids: [row.id] },
												within,
											}),
										done: "Rejected",
									},
								]
							: undefined,
				}}
				choose={{ picked, onPick: setPicked }}
				empty={
					view !== "pending" || source !== undefined || confidence !== undefined
						? {
								sentence: "No track matches these filters.",
								act: {
									label: "Clear filters",
									onAct: () => {
										setView("pending");
										setSource(undefined);
										setConfidence(undefined);
										setPicked({ ids: [] });
									},
								},
							}
						: {
								sentence:
									"No track waits for a decision. Auto-tag a track in the library and what the lookup providers find waits here.",
								act: { label: "Open the library", href: "/library" },
							}
				}
			/>
		</Pane>
	);
}
