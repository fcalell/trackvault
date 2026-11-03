import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { STORED_CHANGE_COLUMNS, STORED_CHANGE_ROW } from "../../lib/changes.ts";
import { queuedBatch } from "../../ui/batch.ts";
import { count, date } from "../../ui/figures.ts";
import { originLabel } from "../../ui/history.ts";

export const Route = createFileRoute("/_app/history/$batchId")({
	loader: ({ context, params }) =>
		preload(context.queryClient, orpc.history.get.read({ id: params.batchId })),
	component: Batch,
});

// One batch: every field it changed as before and after, and the act that puts
// them back (a field edited since is left as it is now).
function Batch() {
	const { batchId } = Route.useParams();
	const batch = orpc.history.get.read({ id: batchId });
	const undo = useMutation(orpc.history.undo.mutationOptions());
	return (
		<Pane
			title={batch.at((each) => each.label)}
			noun="batch"
			read={batch}
			back="/history"
			cover
			wide
			record={{
				within: "History",
				facts: [
					batch.at((each) => originLabel(each.origin)),
					batch.at((each) => `${count(each.count)} changes`),
					batch.at((each) => ({
						tone: each.undone ? ("idle" as const) : ("done" as const),
						label: each.undone ? "Undone" : "Applied",
					})),
					batch.at((each) => date(each.at)),
				],
			}}
			acts={[
				{
					icon: "Undo2",
					label: "Undo batch",
					blocked: batch.at((each) =>
						each.undoable
							? undefined
							: each.undone
								? "This batch was already undone"
								: each.origin === "scan"
									? "A scan only reads the disk; there is nothing to undo"
									: "Nothing changed, so there is nothing to undo",
					),
					confirm: {
						title: "Undo this batch?",
						sentence:
							"Each field goes back to what it was, unless it has changed since; files are tagged and moved back to match.",
					},
					onAct: () =>
						queuedBatch(undo.mutateAsync({ id: batchId }), "Undoing the batch"),
				},
			]}
		>
			<Table
				label="Changes"
				items={orpc.history.changes.window({ batchId })}
				columns={STORED_CHANGE_COLUMNS}
				row={STORED_CHANGE_ROW}
				empty={{ sentence: "This batch changed no field." }}
			/>
		</Pane>
	);
}
