import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import {
	WANTED_QUALITY,
	WANTED_QUALITY_LABELS,
} from "../../../shared/acquire.ts";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/settings/soulseek")({
	loader: ({ context }) =>
		Promise.all([preload(context.queryClient, orpc.soulseek.settings.read())]),
	component: SoulseekSettings,
});

function SoulseekSettings() {
	const soulseek = orpc.soulseek.settings.read();
	const test = useMutation(orpc.soulseek.test.mutationOptions());
	return (
		<Pane
			title="Soulseek"
			back="/settings"
			cover
			record={{
				within: "Settings",
				description:
					"Searches and downloads go through slskd running beside the hub.",
			}}
		>
			<Form
				act={orpc.soulseek.updateSettings}
				commit="field"
				values={soulseek.at((each) => ({
					slskdUrl: each.slskdUrl ?? "",
					slskdApiKey: each.slskdApiKey ?? undefined,
					slskdDownloadsDir: each.slskdDownloadsDir ?? "",
					wantedQuality: each.wantedQuality,
					slskdMaxQueue: each.slskdMaxQueue,
					wishlistAutoDownload: each.wishlistAutoDownload,
					wishlistMinScore: each.wishlistMinScore,
				}))}
				submit={{ done: "Saved" }}
				fields={{
					slskdUrl: {
						label: "slskd address",
						description: "For example http://localhost:5030.",
					},
					slskdApiKey: {
						label: "slskd API key",
						control: "secret",
						description:
							"Made in slskd's options (web.authentication.api_keys).",
					},
					slskdDownloadsDir: {
						label: "slskd downloads folder",
						description:
							"Where slskd saves files, as the hub sees it. Empty asks slskd.",
					},
					wantedQuality: {
						label: "Quality wanted",
						options: WANTED_QUALITY.map((value) => ({
							value,
							label: WANTED_QUALITY_LABELS[value],
						})),
					},
					slskdMaxQueue: {
						label: "Longest peer queue",
						description:
							"Peers with a longer queue are passed over. 0 keeps all.",
					},
					wishlistAutoDownload: {
						label: "Download for the wishlist",
						description:
							"The best candidate above the score below is downloaded without asking. Off marks the want found for you to look at.",
					},
					wishlistMinScore: {
						label: "Lowest score to download",
						description: "From 0 to 100.",
					},
				}}
			/>
			<Section
				items={[
					{
						key: "test",
						leading: { icon: "PlugZap" },
						title: "Test the connection",
						line: "Asks slskd who it is and whether it is online",
						act: {
							icon: "Play",
							label: "Test the connection",
							onAct: () => test.mutateAsync(),
							done: "Connected to slskd",
						},
					},
				]}
			/>
		</Pane>
	);
}
