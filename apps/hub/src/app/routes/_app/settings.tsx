import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	WANTED_QUALITY,
	WANTED_QUALITY_LABELS,
} from "../../../shared/acquire.ts";
import { COMPRESSION_LABELS, COMPRESSIONS } from "../../../shared/backups.ts";
import {
	AUTOTAG_POLICIES,
	AUTOTAG_POLICY_LABELS,
} from "../../../shared/intelligence.ts";
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
			preload(context.queryClient, orpc.autotag.settings.read()),
			preload(context.queryClient, orpc.backups.settings.read()),
		]),
	component: Settings,
});

function Settings() {
	const settings = orpc.settings.read.read();
	const update = useMutation(orpc.settings.update.mutationOptions());
	const soulseek = orpc.soulseek.settings.read();
	const inbox = orpc.inbox.settings.read();
	const spotify = orpc.imports.spotify.read();
	const autotag = orpc.autotag.settings.read();
	const test = useMutation(orpc.soulseek.test.mutationOptions());
	const backups = orpc.backups.settings.read();
	const bucketTest = useMutation(orpc.backups.test.mutationOptions());
	const backupNow = useMutation(orpc.backups.backupNow.mutationOptions());
	const revealKey = useMutation(orpc.backups.revealKey.mutationOptions());
	// The encryption key, shown on request and until it is hidden again.
	const [key, setKey] = useState<string | null>(null);
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
				title="Auto-tag"
				description="Providers are asked about a track and what they agree on waits in Review. A provider with no key or user agent is not asked."
			>
				<Form
					act={orpc.autotag.updateSettings}
					commit="field"
					values={autotag.at((each) => ({
						autotagMusicbrainz: each.autotagMusicbrainz,
						autotagMusicbrainzAgent: each.autotagMusicbrainzAgent ?? "",
						autotagAcoustid: each.autotagAcoustid,
						autotagAcoustidKey: each.autotagAcoustidKey ?? "",
						autotagDiscogs: each.autotagDiscogs,
						autotagDiscogsToken: each.autotagDiscogsToken ?? "",
						autotagBeatport: each.autotagBeatport,
						autotagBeatportToken: each.autotagBeatportToken ?? "",
						autotagDeezer: each.autotagDeezer,
						autotagPolicy: each.autotagPolicy,
						autotagMinConfidence: each.autotagMinConfidence,
						autotagCacheDays: each.autotagCacheDays,
						autotagInbox: each.autotagInbox,
					}))}
					submit={{ done: "Saved" }}
					fields={{
						autotagMusicbrainz: { label: "MusicBrainz" },
						autotagMusicbrainzAgent: {
							label: "MusicBrainz user agent",
							description:
								"Who you are to MusicBrainz and Discogs, for example TrackVault/1.0 (you@example.com). They block anonymous agents.",
						},
						autotagAcoustid: { label: "AcoustID" },
						autotagAcoustidKey: {
							label: "AcoustID key",
							description:
								"A free application key (acoustid.org/new-application). Needs fpcalc on the hub to fingerprint files.",
						},
						autotagDiscogs: { label: "Discogs" },
						autotagDiscogsToken: {
							label: "Discogs token",
							description:
								"A personal access token (discogs.com/settings/developers).",
						},
						autotagBeatport: { label: "Beatport" },
						autotagBeatportToken: {
							label: "Beatport access token",
							description: "Genre, key and tempo for dance music.",
						},
						autotagDeezer: {
							label: "Deezer",
							description: "Needs no key: covers, ISRC and release dates.",
						},
						autotagPolicy: {
							label: "Policy",
							description:
								"Overwrite also replaces differing tags, except the title and artist the search used.",
							options: AUTOTAG_POLICIES.map((value) => ({
								value,
								label: AUTOTAG_POLICY_LABELS[value],
							})),
						},
						autotagMinConfidence: {
							label: "Least confidence",
							description: "Percent. A field below it is not proposed.",
						},
						autotagCacheDays: {
							label: "Remember answers for",
							description: "Days. 0 asks the providers every time.",
						},
						autotagInbox: {
							label: "Tag new files in the inbox",
							description:
								"The inbox pipeline fills tags with this policy before you approve a file.",
						},
					}}
				/>
			</Section>
			<Section
				title="Cover art and analysis"
				description="Covers are embedded in the files. Analysis measures BPM, key, energy and loudness in the background."
			>
				<Form
					act={orpc.autotag.updateSettings}
					commit="field"
					values={autotag.at((each) => ({
						artMinSide: each.artMinSide,
						analyseAuto: each.analyseAuto,
						analyseFillConfidence: each.analyseFillConfidence,
					}))}
					submit={{ done: "Saved" }}
					fields={{
						artMinSide: {
							label: "Smallest cover",
							description:
								"Pixels on the short side. A square cover under it is not embedded.",
						},
						analyseAuto: {
							label: "Analyse new tracks",
							description:
								"After a scan, tracks without BPM, key, energy or loudness are measured one at a time at low priority.",
						},
						analyseFillConfidence: {
							label: "Fill tags above",
							description:
								"Percent. An empty BPM, key or energy tag is filled when the measure is this sure. Tracks Rekordbox analysed are left alone.",
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
				title="Backups"
				description="The database is copied while the hub runs, checked, packed and kept by the policy below. Music files are not in it: they stay on disk and go offsite."
			>
				<Form
					act={orpc.backups.updateSettings}
					commit="field"
					values={backups.at((each) => ({
						backupEnabled: each.backupEnabled,
						backupDir: each.backupDir ?? "",
						backupHour: each.backupHour,
						backupKeepDaily: each.backupKeepDaily,
						backupKeepWeekly: each.backupKeepWeekly,
						backupKeepMonthly: each.backupKeepMonthly,
						backupCompression: each.backupCompression,
					}))}
					submit={{ done: "Saved" }}
					fields={{
						backupEnabled: {
							label: "Back up every day",
							description:
								"A hub that was off at the hour backs up when it starts.",
						},
						backupDir: {
							label: "Backup folder",
							description:
								"A full path, ideally on another disk than the database. Empty uses a backups folder beside it.",
						},
						backupHour: {
							label: "Hour of the day",
							description: "0 to 23, the hub's local time.",
						},
						backupKeepDaily: {
							label: "Keep daily",
							description: "The newest backup of each of this many days.",
						},
						backupKeepWeekly: {
							label: "Keep weekly",
							description: "The newest of each of this many weeks.",
						},
						backupKeepMonthly: {
							label: "Keep monthly",
							description: "The newest of each of this many months.",
						},
						backupCompression: {
							label: "Compression",
							options: COMPRESSIONS.map((value) => ({
								value,
								label: COMPRESSION_LABELS[value],
							})),
						},
					}}
				/>
				<Section
					items={[
						{
							key: "now",
							leading: { icon: "DatabaseBackup" },
							title: "Back up now",
							meta: [
								"Takes a backup and trims old ones, as the daily one does",
							],
							act: {
								icon: "Play",
								label: "Back up now",
								onAct: () => backupNow.mutateAsync(),
								done: "Backup started",
								to: "/backups",
							},
						},
					]}
				/>
			</Section>
			<Section
				title="Offsite storage"
				description="Any S3-compatible bucket: AWS S3, Cloudflare R2, Backblaze B2, MinIO. The keys need to read, write and delete in the bucket."
			>
				<Form
					act={orpc.backups.updateSettings}
					commit="field"
					values={backups.at((each) => ({
						offsiteEnabled: each.offsiteEnabled,
						offsiteEndpoint: each.offsiteEndpoint ?? "",
						offsiteBucket: each.offsiteBucket ?? "",
						offsiteRegion: each.offsiteRegion,
						offsiteAccessKey: each.offsiteAccessKey ?? "",
						offsiteSecretKey: each.offsiteSecretKey ?? "",
						offsitePrefix: each.offsitePrefix ?? "",
						offsiteVirtualHosted: each.offsiteVirtualHosted,
						offsiteDatabases: each.offsiteDatabases,
						offsiteLibrary: each.offsiteLibrary,
						offsitePrune: each.offsitePrune,
						offsiteEncrypt: each.offsiteEncrypt,
						offsiteBandwidthKbps: each.offsiteBandwidthKbps,
					}))}
					submit={{ done: "Saved" }}
					fields={{
						offsiteEnabled: {
							label: "Send backups offsite",
							description: "After each backup, new ones go to the bucket.",
						},
						offsiteEndpoint: {
							label: "Endpoint",
							description:
								"For R2 https://<account>.r2.cloudflarestorage.com, for B2 https://s3.<region>.backblazeb2.com, for MinIO http://host:9000. Empty is AWS S3.",
						},
						offsiteBucket: { label: "Bucket" },
						offsiteRegion: {
							label: "Region",
							description:
								"us-east-1 for most; auto for R2; the bucket's region for B2 and AWS.",
						},
						offsiteAccessKey: {
							label: "Access key id",
							description: "Type a new one to replace it; empty removes it.",
						},
						offsiteSecretKey: {
							label: "Secret access key",
							description: "Type a new one to replace it; empty removes it.",
						},
						offsitePrefix: {
							label: "Folder in the bucket",
							description: "Optional: keeps this hub's files under one name.",
						},
						offsiteVirtualHosted: {
							label: "Bucket in the host name",
							description:
								"Off puts the bucket in the path, which every provider takes.",
						},
						offsiteDatabases: { label: "Send database backups" },
						offsiteLibrary: {
							label: "Send the music files",
							description:
								"Every track as audio/<hash>.<ext>, once; only changed files travel again. The first run can take days on a large library.",
						},
						offsitePrune: {
							label: "Trim old database backups there",
							description:
								"Uses the keep policy above. Music files are never deleted from the bucket.",
						},
						offsiteEncrypt: {
							label: "Encrypt before sending",
							description:
								"AES-256-GCM with a key made here. Keep a copy of the key away from the hub: without it the bucket cannot be read.",
						},
						offsiteBandwidthKbps: {
							label: "Upload speed limit",
							description: "Kilobytes per second. 0 is unlimited.",
						},
					}}
				/>
				<Section
					items={[
						{
							key: "test",
							leading: { icon: "PlugZap" },
							title: "Test the connection",
							meta: ["Writes, reads and deletes a small object in the bucket"],
							act: {
								icon: "Play",
								label: "Test the connection",
								onAct: () => bucketTest.mutateAsync(),
								done: "Connected to the bucket",
							},
						},
						{
							key: "send",
							leading: { icon: "CloudUpload" },
							title: "Send everything now",
							meta: [
								"Database backups and the music files, as the switches above say",
							],
							act: {
								icon: "Play",
								label: "Send now",
								onAct: () => orpc.backups.uploadNow.call({ library: true }),
								done: "Upload started",
								to: "/backups",
							},
						},
						{
							key: "key",
							leading: { icon: "KeyRound" },
							title: "Encryption key",
							meta: [
								key
									? "Copy it somewhere other than the hub"
									: "Shown on request; it opens every encrypted file",
							],
							act: key
								? {
										icon: "EyeOff",
										label: "Hide the key",
										onAct: () => setKey(null),
									}
								: {
										icon: "Eye",
										label: "Show the key",
										onAct: async () => {
											const shown = await revealKey.mutateAsync();
											if (!shown.key)
												throw new Error(
													"There is no key yet: switch encryption on to make one",
												);
											setKey(shown.key);
										},
									},
							more: [
								{
									label: "Use a key I already have",
									sheet: sheetOf({
										title: "Use an existing key",
										description:
											"For a rebuilt hub that must read files an earlier one encrypted. The 64 characters of the key.",
										form: {
											act: orpc.backups.setKey,
											fields: { key: { label: "Encryption key" } },
											submit: { label: "Use this key", done: "Key set" },
										},
									}),
								},
							],
						},
						...(key
							? [
									{
										key: "key-value",
										label: "Key",
										title: { code: key, copy: true as const },
									},
								]
							: []),
					]}
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
