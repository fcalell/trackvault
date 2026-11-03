import { useMutation, useRead } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Picked, TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { useChosen } from "../../lib/chosen.ts";
import { queuedBatch } from "../../ui/batch.ts";
import { age, count, size } from "../../ui/figures.ts";
import { trackTitle } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/quarantine")({
	component: Quarantine,
});

type Held = AppRouter["quarantine"]["list"]["__output"]["data"][number];
type Choice = Picked<Record<string, never>>;

const EVERY: Choice = { query: {}, except: [] };

const COLUMNS: TableColumn<Held>[] = [
	{ key: "title", label: "Title", cell: trackTitle },
	{ key: "artist", label: "Artist", cell: (row) => row.artist },
	{
		key: "reason",
		label: "Reason",
		kind: "chip",
		family: "neutral",
		cell: (row) => row.reason,
	},
	{
		key: "originalPath",
		label: "Was at",
		kind: "source",
		cell: (row) => row.originalPath,
	},
	{
		key: "size",
		label: "Size",
		kind: "number",
		hidden: true,
		cell: (row) => size(row.size),
	},
	{
		key: "at",
		label: "Quarantined",
		kind: "age",
		cell: (row) => age(row.at),
	},
	{
		key: "daysLeft",
		label: "Days left",
		kind: "number",
		cell: (row) => row.daysLeft,
	},
];

// The files named, with the disk they hold: what a purge says it deletes.
const deleting = (
	held: { files: number; bytes: number } | undefined,
): string =>
	held
		? `${count(held.files)} ${held.files === 1 ? "file" : "files"} (${size(held.bytes)}) are removed from the disk for good. This cannot be undone.`
		: "The files are removed from the disk for good. This cannot be undone.";

// Files taken out of the library, kept under `.quarantine/` for the days Settings
// names. Restore puts them back where they lay; delete removes them for good.
function Quarantine() {
	const restore = useMutation(orpc.quarantine.restore.mutationOptions());
	const purge = useMutation(orpc.quarantine.purge.mutationOptions());
	const items = orpc.quarantine.list.window({});
	const [picked, setPicked] = useState<Choice>({ ids: [] });
	const { chosen, blocked: nothing } = useChosen(
		items,
		picked,
		setPicked,
		{},
		"files",
	);
	const everything = useRead(orpc.quarantine.size.read({ files: EVERY }));
	const subset = useRead(orpc.quarantine.size.read({ files: picked }));
	const restoring = (files: Choice, label = "Restore") => ({
		label,
		onAct: () =>
			queuedBatch(restore.mutateAsync({ files }), "Restoring the files"),
	});
	return (
		<Pane
			title="Quarantine"
			back={false}
			wide
			acts={[
				{
					icon: "ArchiveRestore",
					confirm: {
						title: "Restore every file?",
						sentence:
							"Each goes back where it lay and its track returns to the library.",
					},
					...restoring(EVERY, "Restore all"),
				},
				{
					icon: "Trash2",
					label: "Empty the quarantine",
					confirm: {
						title: "Delete every quarantined file?",
						sentence: deleting(everything),
					},
					onAct: () => purge.mutateAsync({ files: EVERY }),
					done: "Deleting files",
					to: "/jobs",
				},
			]}
			foot={
				<ActionBar
					chosen={chosen}
					acts={[
						{
							label: "Delete",
							destructive: true,
							blocked: nothing,
							confirm: {
								title: "Delete the chosen files?",
								sentence: deleting(subset),
							},
							onAct: () => purge.mutateAsync({ files: picked }),
							done: "Deleting files",
							to: "/jobs",
						},
						{ ...restoring(picked), blocked: nothing },
					]}
				/>
			}
		>
			<Table
				label="Quarantined files"
				items={items}
				columns={COLUMNS}
				row={{
					id: (row) => row.id,
					act: (row) => ({
						icon: "ArchiveRestore",
						...restoring({ ids: [row.id] }, `Restore ${trackTitle(row)}`),
					}),
					more: (row) => [
						...(row.batchId
							? [
									{
										label: "See the batch",
										href: `/history/${row.batchId}` as const,
									},
								]
							: []),
						{
							label: "Delete now",
							onAct: () => purge.mutateAsync({ files: { ids: [row.id] } }),
							confirm: {
								title: `Delete ${trackTitle(row)}?`,
								sentence: `${size(row.size)} is removed from the disk for good.`,
							},
						},
					],
				}}
				choose={{ picked, onPick: setPicked }}
			/>
		</Pane>
	);
}
