import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import type { Picked, TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import {
	INBOX_GROUP_LABELS,
	INBOX_GROUPS,
	type InboxGroup,
} from "../../../shared/acquire.ts";
import { orpc } from "../../lib/api.ts";
import { useChosen } from "../../lib/chosen.ts";
import {
	DECISION,
	INBOX_STATE,
	megabytes,
	SOURCE_LABELS,
} from "../../ui/acquire.ts";
import { clock, quality } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/inbox")({
	component: Inbox,
});

type Item = AppRouter["inbox"]["list"]["__output"]["data"][number];
type Filter = { group?: InboxGroup | undefined };

const COLUMNS: TableColumn<Item>[] = [
	{ key: "label", label: "File", cell: (row) => row.label },
	{
		key: "state",
		label: "State",
		kind: "status",
		cell: (row) => INBOX_STATE[row.state] ?? { tone: "idle" as const },
	},
	{
		key: "decision",
		label: "Verdict",
		kind: "chip",
		family: "neutral",
		cell: (row) => (row.decision ? DECISION[row.decision] : null) ?? null,
	},
	{
		key: "reason",
		label: "Why",
		wrap: true,
		cell: (row) => row.reason,
	},
	{
		key: "quality",
		label: "Quality",
		cell: (row) => (row.format ? quality(row.format, row.bitrate) : null),
	},
	{
		key: "time",
		label: "Time",
		kind: "number",
		cell: (row) => clock(row.durationMs),
	},
	{
		key: "source",
		label: "From",
		kind: "chip",
		family: "neutral",
		cell: (row) => SOURCE_LABELS[row.source],
	},
	{
		key: "target",
		label: "Goes to",
		kind: "source",
		cell: (row) => row.target,
	},
	{
		key: "size",
		label: "Size",
		hidden: true,
		cell: (row) => megabytes(row.size),
	},
	{
		key: "steps",
		label: "Steps",
		kind: "number",
		hidden: true,
		cell: (row) => row.stepsDone,
	},
	{
		key: "arrived",
		label: "Arrived",
		kind: "age",
		cell: (row) => row.createdAt.toISOString(),
	},
];

// New music, held until you say yes. Files from your devices, Soulseek downloads and
// anything dropped in the library's Inbox folder run through the pipeline (hash,
// fingerprint, duplicate check, cleanup, names, target path) and wait here for
// approval; a duplicate or a doubt waits for your call.
function Inbox() {
	const open = useParams({ strict: false }).itemId;
	const [group, setGroup] = useState<InboxGroup>();
	const counts = orpc.inbox.counts.read();
	const query: Filter = { group };
	const [picked, setPicked] = useState<Picked<Filter>>({ ids: [] });
	const approve = useMutation(orpc.inbox.approve.mutationOptions());
	const reject = useMutation(orpc.inbox.reject.mutationOptions());
	const keep = useMutation(orpc.inbox.keep.mutationOptions());
	const retry = useMutation(orpc.inbox.retry.mutationOptions());
	const files = orpc.inbox.list.window(query);
	const { chosen, blocked: nothing } = useChosen(
		files,
		picked,
		setPicked,
		query,
		"files",
	);

	return (
		<>
			<Pane
				title="Inbox"
				back={false}
				wide
				acts={[
					{
						icon: "CheckCheck",
						label: "Approve everything that is ready",
						confirm: {
							title: "Approve every ready file?",
							sentence:
								"Each moves to the folder its target names and joins the library with the cleaned tags. Undo the batch in History.",
						},
						onAct: () =>
							approve.mutateAsync({
								items: { query: { group: "ready" }, except: [] },
							}),
						done: "Filing tracks",
						to: "/jobs",
					},
					{
						icon: "RefreshCw",
						label: "Check the inbox",
						onAct: () => orpc.inbox.check.call(),
						done: "Looking in the inbox",
					},
				]}
				foot={
					<ActionBar
						chosen={chosen}
						acts={[
							{
								label: "Keep it anyway",
								blocked: nothing,
								onAct: () => keep.mutateAsync({ items: picked }),
								done: "Running the pipeline again",
							},
							{
								label: "Try again",
								blocked: nothing,
								onAct: () => retry.mutateAsync({ items: picked }),
								done: "Running the pipeline again",
							},
							{
								label: "Reject",
								destructive: true,
								blocked: nothing,
								confirm: {
									title: "Reject the chosen files?",
									sentence:
										"They leave the inbox and wait in the quarantine's folder until its days are up.",
								},
								onAct: () => reject.mutateAsync({ items: picked }),
								done: "Rejecting",
								to: "/jobs",
							},
							{
								label: "Approve",
								blocked: nothing,
								onAct: () => approve.mutateAsync({ items: picked }),
								done: "Filing tracks",
								to: "/jobs",
							},
						]}
					/>
				}
			>
				<Toolbar
					filters={[
						{
							label: "Show",
							placeholder: "Everything open",
							options: counts.at((each) =>
								INBOX_GROUPS.map((value) => ({
									value,
									label: INBOX_GROUP_LABELS[value],
									line: String(each[value]),
								})),
							),
							value: group,
							onChange: (value) => setGroup((value as InboxGroup) ?? undefined),
						},
					]}
				/>
				<Table
					label="Inbox"
					items={files}
					columns={COLUMNS}
					row={{
						id: (row) => row.id,
						href: (row) => `/inbox/${row.id}`,
						act: (row) =>
							row.state === "awaiting-approval"
								? {
										icon: "Check",
										label: `Approve ${row.label}`,
										onAct: () =>
											approve.mutateAsync({ items: { ids: [row.id] } }),
										done: "Filing the track",
									}
								: undefined,
						more: (row) => [
							...(row.state === "duplicate" || row.state === "needs-review"
								? [
										{
											label: "Keep it anyway",
											onAct: () =>
												keep.mutateAsync({ items: { ids: [row.id] } }),
										},
									]
								: []),
							...(row.state === "failed"
								? [
										{
											label: "Try again",
											onAct: () =>
												retry.mutateAsync({ items: { ids: [row.id] } }),
										},
									]
								: []),
							...(row.state !== "approved" && row.state !== "rejected"
								? [
										{
											label: "Reject",
											destructive: true,
											confirm: {
												title: `Reject ${row.label}?`,
												sentence:
													"The file leaves the inbox and waits in the quarantine's folder until its days are up.",
											},
											onAct: () =>
												reject.mutateAsync({ items: { ids: [row.id] } }),
										},
									]
								: []),
						],
					}}
					selected={open}
					choose={{ picked, onPick: setPicked }}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
