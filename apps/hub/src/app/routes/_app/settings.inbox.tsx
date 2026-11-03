import { preload } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/settings/inbox")({
	loader: ({ context }) =>
		Promise.all([preload(context.queryClient, orpc.inbox.settings.read())]),
	component: InboxSettings,
});

function InboxSettings() {
	const inbox = orpc.inbox.settings.read();
	return (
		<Pane
			title="Inbox"
			back="/settings"
			cover
			record={{
				within: "Settings",
				description:
					"New files are checked against the library before they are filed.",
			}}
		>
			<Form
				act={orpc.inbox.updateSettings}
				commit="field"
				values={inbox.at((each) => ({ ...each }))}
				submit={{ done: "Saved" }}
				fields={{
					inboxAutoApprove: {
						label: "Approve new tracks",
						description:
							"A file the library does not have is filed without asking.",
					},
					inboxAutoReplace: {
						label: "Replace with better copies",
						description:
							"A copy that beats the library's (lossless over lossy, or 64 kbps more) takes its place.",
					},
					inboxAutoRejectDuplicates: {
						label: "Reject duplicates",
						description: "A file the library already has is set aside.",
					},
					inboxBitrateMarginKbps: {
						label: "Bitrate margin",
						description:
							"A lossy copy must beat the library's by this many kbps to count as better.",
					},
					inboxFuzzyPercent: {
						label: "Same song threshold",
						description:
							"Matches by artist and title under this percent need you.",
					},
					inboxAcousticPercent: {
						label: "Same recording threshold",
						description: "Matches by sound under this percent need you.",
					},
				}}
			/>
		</Pane>
	);
}
