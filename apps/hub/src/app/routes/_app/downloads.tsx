import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import type { TransferView } from "../../../shared/channels.ts";
import { orpc } from "../../lib/api.ts";
import { transfersLive } from "../../lib/live.ts";
import { TRANSFER_STATE } from "../../ui/acquire.ts";
import { size, speed } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/downloads")({
	component: Downloads,
});

const ACTIVE = new Set(["requested", "queued", "downloading", "completed"]);

function facts(t: TransferView): string[] {
	const parts = [t.username];
	if (t.state === "downloading" && t.size > 0)
		parts.push(
			`${Math.round((t.bytes / t.size) * 100)}% of ${size(t.size)}`,
			speed(t.speed),
		);
	else if (t.size > 0) parts.push(size(t.size));
	if (t.rawState && t.state === "queued") parts.push(t.rawState);
	return parts;
}

const line = (t: TransferView): string | undefined =>
	t.error && (t.state === "failed" || t.state === "cancelled")
		? t.error
		: undefined;

// Soulseek downloads as slskd moves them, live; a finished file goes to the inbox on
// its own, and the pipeline takes it from there.
function Downloads() {
	const cancel = useMutation(orpc.soulseek.cancel.mutationOptions());
	const retry = useMutation(orpc.soulseek.retry.mutationOptions());
	const clear = useMutation(orpc.soulseek.clear.mutationOptions());
	const toRow = (t: TransferView): Row => ({
		key: t.id,
		leading: { icon: "Download" },
		title: [t.artist, t.title ?? t.name].filter(Boolean).join(" - "),
		facts: [TRANSFER_STATE[t.state] ?? { tone: "idle" }, ...facts(t)],
		line: line(t),
		trailing: { age: t.updatedAt },
		...(t.state === "imported" && t.inboxItemId
			? {
					act: {
						icon: "Inbox" as const,
						label: "Open in the inbox",
						href: `/inbox/${t.inboxItemId}`,
					},
				}
			: ACTIVE.has(t.state)
				? {
						act: {
							icon: "X" as const,
							label: `Cancel ${t.name}`,
							onAct: () => cancel.mutateAsync({ id: t.id }),
						},
					}
				: t.state === "failed" || t.state === "cancelled"
					? {
							act: {
								icon: "RotateCcw" as const,
								label: `Try ${t.name} again`,
								onAct: () => retry.mutateAsync({ id: t.id }),
							},
						}
					: {}),
	});
	return (
		<Pane
			title="Downloads"
			read={transfersLive}
			back={false}
			wide
			acts={[
				{
					icon: "BrushCleaning",
					label: "Clear finished",
					onAct: () => clear.mutateAsync(),
					done: "Cleared",
				},
			]}
		>
			<Section
				items={transfersLive.at((transfers) => transfers.map(toRow))}
				empty={{
					sentence:
						"No downloads yet. Search Soulseek, or let the wishlist find what you want.",
				}}
			/>
		</Pane>
	);
}
