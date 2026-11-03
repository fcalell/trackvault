import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { Toolbar } from "@fcalell/plugin-react-ui/components/toolbar";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { useDebounced } from "../../lib/debounced.ts";
import { age } from "../../ui/figures.ts";
import { ORIGIN_OPTIONS, originLabel } from "../../ui/history.ts";

export const Route = createFileRoute("/_app/history")({
	component: History,
});

type Batch = AppRouter["history"]["list"]["__output"]["data"][number];

const STATES = [
	{ value: "applied", label: "Applied" },
	{ value: "undone", label: "Undone" },
];

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
		cell: (batch) => originLabel(batch.origin),
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
		cell: (batch) => age(batch.at),
	},
];

// Every batch of changes, newest first: what made it, how many fields it wrote and
// whether it was undone. A batch opens beside the list with its changes.
function History() {
	const open = useParams({ strict: false }).batchId;
	const [text, setText] = useState("");
	const [origin, setOrigin] = useState<string>();
	const [state, setState] = useState<"applied" | "undone">();
	const q = useDebounced(text.trim(), 120) || undefined;
	return (
		<>
			<Pane title="History" back={false} wide>
				<Toolbar
					search={{
						value: text,
						onChange: setText,
						placeholder: "Search the history",
					}}
					filters={[
						{
							label: "Made by",
							placeholder: "Anyone",
							options: ORIGIN_OPTIONS,
							value: origin,
							onChange: (value) => setOrigin(value ?? undefined),
						},
						{
							label: "State",
							placeholder: "Any state",
							options: STATES,
							value: state,
							onChange: (value) =>
								setState((value as "applied" | "undone") ?? undefined),
						},
					]}
				/>
				<Table
					label="Batches"
					items={orpc.history.list.window({ q, origin, state })}
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
