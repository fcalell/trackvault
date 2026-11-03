import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/quarantine")({
	component: Quarantine,
});

type Held = AppRouter["quarantine"]["list"]["__output"]["data"][number];

const COLUMNS: TableColumn<Held>[] = [
	{ key: "label", label: "Track", cell: (row) => row.label },
	{
		key: "originalPath",
		label: "Was at",
		kind: "source",
		cell: (row) => row.originalPath,
	},
	{
		key: "daysLeft",
		label: "Days left",
		kind: "number",
		cell: (row) => row.daysLeft,
	},
	{
		key: "at",
		label: "Moved",
		kind: "age",
		cell: (row) => row.at.toISOString(),
	},
];

// Files taken out of the library, kept under `.quarantine/` for the days Settings
// names. Restore puts them back where they lay; delete removes them for good.
function Quarantine() {
	const restore = useMutation(orpc.quarantine.restore.mutationOptions());
	const purge = useMutation(orpc.quarantine.purge.mutationOptions());
	return (
		<Pane
			title="Quarantine"
			back={false}
			acts={[
				{
					icon: "ArchiveRestore",
					label: "Restore all",
					confirm: {
						title: "Restore every file?",
						sentence:
							"Each goes back where it lay and its track returns to the library.",
					},
					onAct: () => orpc.quarantine.restoreAll.call(),
					done: "Restoring files",
					to: "/jobs",
				},
				{
					icon: "Trash2",
					label: "Empty the quarantine",
					confirm: {
						title: "Delete every quarantined file?",
						sentence:
							"The files are removed from the disk for good. This cannot be undone.",
					},
					onAct: () => purge.mutateAsync({}),
					done: "Deleting files",
					to: "/jobs",
				},
			]}
		>
			<Table
				label="Quarantined files"
				items={orpc.quarantine.list.window({})}
				columns={COLUMNS}
				row={{
					id: (row) => row.id,
					act: (row) => ({
						icon: "ArchiveRestore",
						label: `Restore ${row.label}`,
						onAct: () => restore.mutateAsync({ fileIds: [Number(row.id)] }),
						done: "Restoring",
					}),
					more: (row) => [
						{
							label: "Delete now",
							onAct: () => purge.mutateAsync({ fileIds: [Number(row.id)] }),
							confirm: {
								title: `Delete ${row.label}?`,
								sentence: "The file is removed from the disk for good.",
							},
						},
					],
				}}
			/>
		</Pane>
	);
}
