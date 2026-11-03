import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	WANTED_QUALITY,
	WANTED_QUALITY_LABELS,
} from "../../../shared/acquire.ts";
import { orpc } from "../../lib/api.ts";
import { authClient } from "../../lib/auth.ts";
import { FolderBrowser } from "../../lib/folder-browser.tsx";

export const Route = createFileRoute("/_app/settings")({
	loader: ({ context }) =>
		Promise.all([
			preload(context.queryClient, orpc.settings.read.read()),
			preload(context.queryClient, orpc.soulseek.settings.read()),
			preload(context.queryClient, orpc.inbox.settings.read()),
			preload(context.queryClient, orpc.imports.spotify.read()),
		]),
	component: Settings,
});

function Settings() {
	const settings = orpc.settings.read.read();
	const update = useMutation(orpc.settings.update.mutationOptions());
	const soulseek = orpc.soulseek.settings.read();
	const inbox = orpc.inbox.settings.read();
	const spotify = orpc.imports.spotify.read();
	const test = useMutation(orpc.soulseek.test.mutationOptions());
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
				title="Soulseek"
				description="Searches and downloads go through slskd running beside the hub."
			>
				<Form
					act={orpc.soulseek.updateSettings}
					commit="field"
					values={soulseek.at((each) => ({
						slskdUrl: each.slskdUrl ?? "",
						slskdApiKey: each.slskdApiKey ?? "",
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
							description:
								"Made in slskd's options (web.authentication.api_keys). Type a new one to replace it; empty removes it.",
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
							meta: ["Asks slskd who it is and whether it is online"],
							act: {
								icon: "Play",
								label: "Test the connection",
								onAct: () => test.mutateAsync(),
								done: "Connected to slskd",
							},
						},
					]}
				/>
			</Section>
			<Section
				title="Inbox"
				description="New files are checked against the library before they are filed."
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
			</Section>
			<Section
				title="Playlist import"
				description="Spotify playlists need your own app's client id and secret (developer.spotify.com/dashboard)."
			>
				<Form
					act={orpc.imports.updateSpotify}
					commit="field"
					values={spotify.at((each) => ({
						spotifyClientId: each.spotifyClientId ?? "",
						spotifyClientSecret: each.spotifyClientSecret ?? "",
					}))}
					submit={{ done: "Saved" }}
					fields={{
						spotifyClientId: { label: "Spotify client id" },
						spotifyClientSecret: {
							label: "Spotify client secret",
							description: "Type a new one to replace it; empty removes it.",
						},
					}}
				/>
			</Section>
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
