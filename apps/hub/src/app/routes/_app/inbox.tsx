import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Picked, TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import {
	INBOX_GROUP_LABELS,
	type InboxFilterGroup,
	type InboxGroup,
} from "../../../shared/acquire.ts";
import { orpc } from "../../lib/api.ts";
import { INBOX_STATE, SOURCE_LABELS } from "../../ui/acquire.ts";
import { queuedBatch } from "../../ui/batch.ts";
import { age, bitrate, duration, size } from "../../ui/figures.ts";
import { trackTitle } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/inbox")({
	component: Inbox,
});

type Item = AppRouter["inbox"]["list"]["__output"]["data"][number];
type Filter = { group?: InboxFilterGroup | undefined };

// A duplicate or a doubt says why; a new track that is ready has nothing to add to "Ready".
const why = (row: Item): string | null =>
	row.decision === "accept" && !row.error ? null : row.reason;

const COLUMNS: TableColumn<Item>[] = [
	{ key: "title", label: "Title", cell: trackTitle },
	{ key: "artist", label: "Artist", cell: (row) => row.artist },
	{
		key: "state",
		label: "State",
		kind: "status",
		cell: (row) => INBOX_STATE[row.state] ?? { tone: "idle" as const },
	},
	{ key: "reason", label: "Why", wrap: true, cell: why },
	{
		key: "quality",
		label: "Quality",
		cell: (row) => (row.format ? bitrate(row.format, row.bitrate) : null),
	},
	{
		key: "time",
		label: "Time",
		kind: "number",
		cell: (row) => duration(row.durationMs),
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
		cell: (row) => size(row.size),
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
		cell: (row) => age(row.createdAt),
	},
];

// What an empty band says; the Ready and Needs a look bands stand even when empty.
const NOTHING: Record<InboxGroup, string> = {
	ready: "No file is ready to approve.",
	review: "No file needs a look.",
	processing: "No file is being processed.",
	done: "No file was approved or rejected yet.",
};

// New music, held until you say yes. Files from your devices, Soulseek downloads and
// anything dropped in the library's Inbox folder run through the pipeline (hash,
// fingerprint, duplicate check, tag rules, names, target path) and wait here for
// approval; a duplicate or a doubt waits for your call.
function Inbox() {
	const open = useParams({ strict: false }).itemId;
	const counts = orpc.inbox.counts.read();
	const reach = useRead(counts);
	const [picked, setPicked] = useState<Picked<Filter>>({ ids: [] });
	const approve = useMutation(orpc.inbox.approve.mutationOptions());
	const reject = useMutation(orpc.inbox.reject.mutationOptions());
	const keep = useMutation(orpc.inbox.keep.mutationOptions());
	const retry = useMutation(orpc.inbox.retry.mutationOptions());
	const choosable = (reach?.ready ?? 0) + (reach?.review ?? 0);

	const ticked =
		"ids" in picked
			? picked.ids.length
			: Math.max(0, choosable - picked.except.length);
	const nothing = ticked === 0 ? "Choose files first." : undefined;

	const row = {
		id: (item: Item) => item.id,
		href: (item: Item) => `/inbox/${item.id}`,
		act: (item: Item) =>
			item.state === "awaiting-approval"
				? {
						icon: "Check" as const,
						label: `Approve ${item.title}`,
						onAct: () =>
							queuedBatch(
								approve.mutateAsync({ items: { ids: [item.id] } }),
								"Filing the track",
							),
					}
				: item.trackId
					? {
							icon: "Music" as const,
							label: `Open ${item.title} in the library`,
							href: `/library/${item.trackId}`,
						}
					: undefined,
		more: (item: Item) => [
			...(item.state === "duplicate" || item.state === "needs-review"
				? [
						{
							label: "Keep",
							onAct: () => keep.mutateAsync({ items: { ids: [item.id] } }),
						},
					]
				: []),
			...(item.state === "failed"
				? [
						{
							label: "Try again",
							onAct: () => retry.mutateAsync({ items: { ids: [item.id] } }),
						},
					]
				: []),
			...(item.state !== "approved" && item.state !== "rejected"
				? [
						{
							label: "Reject",
							destructive: true,
							confirm: {
								title: `Reject ${item.title}?`,
								sentence:
									"The file leaves the inbox and waits in the quarantine's folder until its days are up.",
							},
							onAct: () => reject.mutateAsync({ items: { ids: [item.id] } }),
						},
					]
				: []),
		],
	};

	const band = (group: InboxGroup, choosing: boolean) =>
		!choosing && reach?.[group] === 0 ? null : (
			<Section
				key={group}
				title={INBOX_GROUP_LABELS[group]}
				folded={group === "done"}
			>
				{choosing ? (
					<Table
						label={INBOX_GROUP_LABELS[group]}
						items={orpc.inbox.list.window({ group })}
						columns={COLUMNS}
						row={row}
						empty={{ sentence: NOTHING[group] }}
						selected={open}
						choose={{ picked, onPick: setPicked }}
					/>
				) : (
					<Table
						label={INBOX_GROUP_LABELS[group]}
						items={orpc.inbox.list.window({ group })}
						columns={COLUMNS}
						row={row}
						empty={{ sentence: NOTHING[group] }}
						selected={open}
					/>
				)}
			</Section>
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
						label: counts.at((each) => `Approve ${each.ready} ready`),
						blocked: counts.at((each) =>
							each.ready === 0 ? "Nothing is ready" : undefined,
						),
						confirm: {
							title: "Approve every ready file?",
							sentence:
								"Each moves to the folder its target names and joins the library with the cleaned tags. Undo the batch in History.",
						},
						onAct: () =>
							queuedBatch(
								approve.mutateAsync({
									items: { query: { group: "ready" }, except: [] },
								}),
								"Filing tracks",
							),
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
						chosen={{
							count: ticked,
							of: choosable,
							noun: "files",
							onAll: (all) =>
								setPicked(
									all
										? { query: { group: "waiting" }, except: [] }
										: { ids: [] },
								),
						}}
						acts={[
							{
								label: "Keep",
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
								onAct: () =>
									queuedBatch(
										approve.mutateAsync({ items: picked }),
										"Filing tracks",
									),
							},
						]}
					/>
				}
			>
				{band("ready", true)}
				{band("review", true)}
				{band("processing", false)}
				{band("done", false)}
			</Pane>
			<Outlet />
		</>
	);
}
