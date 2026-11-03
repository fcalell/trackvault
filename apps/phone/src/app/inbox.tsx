import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { Toolbar } from "@fcalell/plugin-native-ui/components/toolbar";
import type { StatusMark } from "@fcalell/ui-core/descriptors";
import { useState } from "react";
import { orpc } from "../lib/api";
import { duration } from "../lib/format";
import type { InboxRow } from "../lib/types";

type Group = "ready" | "review" | "processing" | "done";

const STATUS: Record<InboxRow["state"], StatusMark> = {
	queued: { tone: "waiting", label: "Queued" },
	processing: { tone: "running", label: "Checking" },
	"awaiting-approval": { tone: "active", label: "Ready" },
	duplicate: { tone: "attention", label: "Duplicate" },
	"needs-review": { tone: "attention", label: "Needs a look" },
	approved: { tone: "done", label: "Approved" },
	rejected: { tone: "idle", label: "Rejected" },
	failed: { tone: "failed", label: "Failed" },
};

const OPEN: ReadonlySet<InboxRow["state"]> = new Set([
	"awaiting-approval",
	"duplicate",
	"needs-review",
]);

export default function Inbox() {
	const [group, setGroup] = useState<Group>("ready");
	const items = orpc.inbox.list.window({ group, limit: 50 });
	const approve = useMutation(orpc.inbox.approve.mutationOptions());
	const reject = useMutation(orpc.inbox.reject.mutationOptions());
	const keep = useMutation(orpc.inbox.keep.mutationOptions());
	return (
		<Pane title="Inbox" back={false}>
			<Toolbar
				filters={[
					{
						label: "Show",
						options: [
							{ value: "ready", label: "Ready" },
							{ value: "review", label: "Needs a look" },
							{ value: "processing", label: "Checking" },
							{ value: "done", label: "Done" },
						],
						value: group,
						onChange: (value) => setGroup((value as Group | null) ?? "ready"),
					},
				]}
			/>
			<Section
				items={items.at((rows) =>
					rows.map((item) => {
						const ids = { ids: [item.id] };
						const open = OPEN.has(item.state);
						return {
							key: item.id,
							title: item.label,
							facts: [
								STATUS[item.state],
								...(item.format ? [item.format.toUpperCase()] : []),
								...(item.bitrate ? [`${item.bitrate} kbps`] : []),
								...(item.durationMs ? [duration(item.durationMs)] : []),
							],
							line: item.reason ?? undefined,
							trailing: { age: item.createdAt.toISOString() },
							act: open
								? {
										icon: "Check" as const,
										label:
											item.state === "awaiting-approval"
												? "Approve"
												: "Approve anyway",
										done: "Approved.",
										onAct: () =>
											(item.state === "awaiting-approval"
												? approve
												: keep
											).mutateAsync({ items: ids }),
									}
								: undefined,
							more: open
								? [
										{
											label: "Reject",
											icon: "X" as const,
											destructive: true,
											done: "Rejected.",
											onAct: () => reject.mutateAsync({ items: ids }),
										},
									]
								: undefined,
						};
					}),
				)}
				empty={{ sentence: "Nothing waiting here." }}
			/>
		</Pane>
	);
}
