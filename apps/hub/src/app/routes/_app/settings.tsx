import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../../lib/api.ts";
import { authClient } from "../../lib/auth.ts";
import { FolderBrowser } from "../../lib/folder-browser.tsx";

export const Route = createFileRoute("/_app/settings")({
	loader: ({ context }) =>
		preload(context.queryClient, orpc.settings.read.read()),
	component: Settings,
});

function Settings() {
	const settings = orpc.settings.read.read();
	const update = useMutation(orpc.settings.update.mutationOptions());
	// The folder the browser has requested, and the one it shows (the choice).
	const [browsing, setBrowsing] = useState<string>();
	const [listed, setListed] = useState<string>();
	return (
		<Pane
			title="Settings"
			back={false}
			actions={[
				{
					icon: "RefreshCw",
					label: "Scan now",
					onAct: () => orpc.scan.start.call(),
					done: "Scan started",
					to: "/jobs",
				},
			]}
		>
			<Section title="Library" description="Where the hub finds your music.">
				<Form
					act={orpc.settings.update}
					commit="field"
					values={settings.at((each) => ({
						libraryRoot: each.libraryRoot ?? undefined,
						lowBitrateThreshold: each.lowBitrateThreshold,
					}))}
					submit={{ done: "Saved" }}
					fields={{
						libraryRoot: {
							label: "Library folder",
							description:
								"The folder on the hub that holds your music. Setting it scans it.",
						},
						lowBitrateThreshold: {
							label: "Low bitrate threshold",
							description:
								"Tracks under this many kbit/s are flagged. 0 turns the check off.",
						},
					}}
				/>
			</Section>
			<Section
				items={[
					{
						key: "browse",
						leading: { icon: "FolderSearch" },
						title: "Browse the hub's folders",
						meta: ["Pick the folder instead of typing its path"],
						act: {
							icon: "FolderOpen",
							label: "Browse folders",
							sheet: {
								title: "Choose the library folder",
								description:
									"Open folders until the one that holds your music is shown.",
								submit: {
									label: "Use this folder",
									onAct: () =>
										update.mutateAsync({ libraryRoot: listed as string }),
									done: "Library folder set",
									blocked: listed ? undefined : "Open a folder first",
								},
								children: (
									<FolderBrowser
										path={browsing}
										onPath={setBrowsing}
										onListed={setListed}
									/>
								),
							},
						},
					},
				]}
			/>
			<Section
				title="Account"
				items={[
					{
						key: "passkey",
						leading: { icon: "KeyRound" },
						title: "Passkey",
						meta: ["Sign in with this device instead of a code"],
						act: {
							icon: "Plus",
							label: "Add a passkey",
							onAct: async () => {
								const answer = await authClient.passkey.addPasskey();
								if (answer?.error)
									throw new Error(
										answer.error.message ?? "The passkey was not added",
									);
							},
							done: "Passkey added",
						},
					},
					{
						key: "sign-out",
						leading: { icon: "LogOut" },
						title: "Sign out",
						act: {
							icon: "LogOut",
							label: "Sign out",
							onAct: () => orpc.auth.signOut.call(),
							to: "/sign-in",
						},
					},
				]}
			/>
		</Pane>
	);
}
