import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { CHANGE_COLUMNS, CHANGE_ROW } from "../../lib/changes.ts";

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
			wide
			acts={[
				{
					icon: "Undo2",
					label: "Undo batch",
					confirm: {
						title: "Undo this batch?",
						sentence:
							"Each field goes back to what it was, unless it has changed since; files are tagged and moved back to match.",
					},
					onAct: () => undo.mutateAsync({ id: batchId }),
					done: "Undoing the batch",
					to: "/jobs",
				},
			]}
		>
			<Table
				label="Changes"
				items={orpc.history.changes.window({ batchId })}
				columns={CHANGE_COLUMNS}
				row={CHANGE_ROW}
			/>
		</Pane>
	);
}
