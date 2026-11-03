import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
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

export const Route = createFileRoute("/_app/review")({
	loader: ({ context }) =>
		Promise.all([
			preload(context.queryClient, orpc.autotag.summary.read()),
			preload(
				context.queryClient,
				orpc.autotag.list.window({ state: "pending" }),
			),
		]),
	component: Review,
});

type Proposal = AppRouter["autotag"]["list"]["__output"]["data"][number];

const COLUMNS: TableColumn<Proposal>[] = [
	{ key: "label", label: "Track", cell: (row) => row.label },
	{
		key: "field",
		label: "Field",
		width: "measure-short",
		cell: (row) => fieldLabel(row.field),
	},
	{
		key: "change",
		label: "Change",
		kind: "change",
		cell: (row) => ({ before: row.before, after: row.after }),
	},
	{
		key: "source",
		label: "Source",
		kind: "chip",
		family: "neutral",
		cell: (row) => SOURCE_LABELS[row.source] ?? row.source,
	},
	{
		key: "confidence",
		label: "Sure",
		kind: "number",
		cell: (row) => `${row.confidence}%`,
	},
	{
		key: "other",
		label: "Other values",
		hidden: true,
		cell: (row) => row.alternatives || null,
	},
];

// The auto-tag results waiting for a decision: every field of every track as a
// before and after with where it came from and how sure that source is. Accepted
// fields are applied as one batch (History lists it) and written to the files.
function Review() {
	const [view, setView] = useState<ProposalView>("pending");
	const summary = orpc.autotag.summary.read();
	const items = orpc.autotag.list.window({ state: view });
	const accept = useMutation(orpc.autotag.accept.mutationOptions());
	const reject = useMutation(orpc.autotag.reject.mutationOptions());
	const [picked, setPicked] = useState<Picked<{ state: ProposalView }>>({
		ids: [],
	});
	const waiting = view === "pending";
	const { chosen, blocked: nothing } = useChosen(
		items,
		picked,
		setPicked,
		{ state: view },
		"fields",
	);
	return (
		<Pane
			title="Review"
			back={false}
			acts={[
				{
					icon: "CheckCheck",
					label: "Accept all above a confidence",
					sheet: sheetOf({
						title: "Accept by confidence",
						description:
							"Every waiting field at or above this confidence is accepted and applied as one batch. The rest stays here.",
						form: {
							act: orpc.autotag.acceptAbove,
							values: { confidence: 85 },
							fields: { confidence: { label: "Confidence, percent" } },
							submit: {
								label: "Accept and apply",
								done: "Applying the tags",
								to: "/jobs",
							},
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
						}),
					done: "Rejected",
				},
			]}
			foot={
				<ActionBar
					chosen={chosen}
					acts={[
						{
							label: "Accept",
							blocked: waiting
								? nothing
								: "Only waiting fields can be decided.",
							onAct: () => accept.mutateAsync({ proposals: picked }),
							done: "Applying the tags",
							to: "/jobs",
						},
						{
							label: "Reject",
							blocked: waiting
								? nothing
								: "Only waiting fields can be decided.",
							onAct: () => reject.mutateAsync({ proposals: picked }),
							done: "Rejected",
						},
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
								line: String(each[value]),
							})),
						),
						value: view,
						onChange: (value) => {
							setView((value as ProposalView) ?? "pending");
							setPicked({ ids: [] });
						},
					},
				]}
			/>
			<Table
				label="Proposals"
				items={items}
				columns={COLUMNS}
				row={{
					id: (row) => row.id,
					href: (row) => `/library/${row.trackId}`,
					act: (row) =>
						waiting
							? {
									icon: "Check",
									label: `Accept ${fieldLabel(row.field)} of ${row.label}`,
									onAct: () =>
										accept.mutateAsync({ proposals: { ids: [row.id] } }),
									done: "Accepted",
								}
							: undefined,
					more: (row) =>
						waiting
							? [
									{
										label: "Reject",
										onAct: () =>
											reject.mutateAsync({ proposals: { ids: [row.id] } }),
										done: "Rejected",
									},
								]
							: undefined,
				}}
				choose={{ picked, onPick: setPicked }}
			/>
		</Pane>
	);
}
