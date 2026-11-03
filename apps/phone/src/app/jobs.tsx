import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import type { StatusMark } from "@fcalell/ui-core/descriptors";
import { orpc } from "../lib/api";
import type { JobRow } from "../lib/types";

const STATUS: Record<JobRow["state"], StatusMark> = {
	queued: { tone: "waiting", label: "Queued" },
	running: { tone: "running", label: "Running" },
	done: { tone: "done", label: "Done" },
	failed: { tone: "failed", label: "Failed" },
	cancelled: { tone: "idle", label: "Cancelled" },
};

export default function Jobs() {
	const jobs = orpc.jobs.list.read({ limit: 50 });
	const cancel = useMutation(orpc.jobs.cancel.mutationOptions());
	return (
		<Pane title="Jobs" back="/more">
			<Section
				items={jobs.at((rows) =>
					rows.map((j) => ({
						key: j.id,
						title: j.kind,
						status: STATUS[j.state],
						meta: [j.error ?? j.message ?? ""].filter(Boolean),
						trailing:
							j.state === "running" && j.total > 0
								? { value: `${j.done}/${j.total}` }
								: { age: j.createdAt },
						more:
							j.state === "queued" || j.state === "running"
								? [
										{
											label: "Cancel",
											icon: "X" as const,
											destructive: true,
											onAct: () => cancel.mutateAsync({ id: j.id }),
										},
									]
								: undefined,
					})),
				)}
				empty={{ sentence: "No jobs yet." }}
			/>
		</Pane>
	);
}
