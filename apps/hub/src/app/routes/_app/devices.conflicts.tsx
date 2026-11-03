import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { ActionBar } from "@fcalell/plugin-react-ui/components/action-bar";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Picked, TableColumn } from "@fcalell/ui-core/descriptors";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { fieldLabel } from "../../lib/changes.ts";
import { useChosen } from "../../lib/chosen.ts";
import { age } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/devices/conflicts")({
	component: Conflicts,
});

type Conflict = AppRouter["devices"]["conflicts"]["__output"]["data"][number];

const FIELDS: Record<string, string> = {
	color: "Colour",
	myTags: "My Tags",
	order: "Order",
	folder: "Folder",
};

const COLUMNS: TableColumn<Conflict>[] = [
	{ key: "label", label: "Track or playlist", cell: (row) => row.label },
	{
		key: "field",
		label: "Field",
		width: "measure-short",
		cell: (row) =>
			row.field ? (FIELDS[row.field] ?? fieldLabel(row.field)) : null,
	},
	{
		key: "change",
		label: "TrackVault to Rekordbox",
		kind: "change",
		cell: (row) => ({ before: row.hubValue, after: row.deviceValue }),
	},
	{
		key: "winner",
		label: "Kept",
		kind: "chip",
		family: "neutral",
		width: "measure-short",
		cell: (row) => (row.winner === "hub" ? "TrackVault" : "Rekordbox"),
	},
	{ key: "device", label: "Device", cell: (row) => row.device },
	{
		key: "at",
		label: "When",
		kind: "age",
		cell: (row) => age(row.at),
	},
];

// Fields changed in Rekordbox and in TrackVault since the last sync. The later change
// was kept; pick the side to settle on. A value taken is written as your change (History
// undoes it) and reaches every device.
function Conflicts() {
	const resolve = useMutation(orpc.devices.resolve.mutationOptions());
	const [picked, setPicked] = useState<Picked<{ state: "open" | "resolved" }>>({
		ids: [],
	});
	const conflicts = orpc.devices.conflicts.window({ state: "open" });
	const { chosen, blocked: nothing } = useChosen(
		conflicts,
		picked,
		setPicked,
		{ state: "open" },
		"conflicts",
	);
	return (
		<Pane
			title="Conflicts"
			back="/devices"
			wide
			foot={
				<ActionBar
					chosen={chosen}
					acts={[
						{
							label: "Take Rekordbox",
							blocked: nothing,
							onAct: () =>
								resolve.mutateAsync({ conflicts: picked, take: "device" }),
							done: "Took Rekordbox's values",
						},
						{
							label: "Keep TrackVault",
							blocked: nothing,
							onAct: () =>
								resolve.mutateAsync({ conflicts: picked, take: "hub" }),
							done: "Kept TrackVault's values",
						},
					]}
				/>
			}
		>
			<Table
				label="Conflicts"
				items={conflicts}
				columns={COLUMNS}
				row={{ id: (row) => String(row.id) }}
				choose={{ picked, onPick: setPicked }}
			/>
		</Pane>
	);
}
