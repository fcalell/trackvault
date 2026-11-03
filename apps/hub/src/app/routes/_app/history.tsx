import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/history")({
	component: History,
});

type Batch = AppRouter["history"]["list"]["__output"]["data"][number];

const ORIGINS: Record<string, string> = {
	ui: "You",
	rule: "Rules",
	autotag: "Auto-tag",
	rekordbox: "Rekordbox",
	agent: "Agent",
	scan: "Scan",
	analysis: "Analysis",
	mcp: "Claude",
};

const COLUMNS: TableColumn<Batch>[] = [
	{
		key: "label",
		label: "What",
		cell: (batch) => batch.label,
	},
	{
		key: "origin",
		label: "By",
		kind: "chip",
		family: "neutral",
		cell: (batch) =>
			ORIGINS[batch.origin] ??
			(batch.origin.startsWith("rekordbox:") ? "Rekordbox" : batch.origin),
	},
	{
		key: "count",
		label: "Changes",
		kind: "number",
		cell: (batch) => batch.count,
	},
	{
		key: "state",
		label: "State",
		kind: "status",
		cell: (batch) => ({
			tone: batch.undone ? ("idle" as const) : ("done" as const),
			label: batch.undone ? "Undone" : "Applied",
		}),
	},
	{
		key: "at",
		label: "When",
		kind: "age",
		cell: (batch) => batch.at.toISOString(),
	},
];

// Every batch of changes, newest first: what made it, how many fields it wrote and
// whether it was undone. A batch opens beside the list with its changes.
function History() {
	const open = useParams({ strict: false }).batchId;
	return (
		<>
			<Pane title="History" back={false}>
				<Table
					label="Batches"
					items={orpc.history.list.window({})}
					columns={COLUMNS}
					row={{
						id: (batch) => batch.id,
						href: (batch) => `/history/${batch.id}`,
					}}
					selected={open}
				/>
			</Pane>
			<Outlet />
		</>
	);
}
