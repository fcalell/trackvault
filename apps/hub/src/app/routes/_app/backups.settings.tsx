import { preload, useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { COMPRESSION_LABELS, COMPRESSIONS } from "../../../shared/backups.ts";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/backups/settings")({
	loader: ({ context }) =>
		preload(context.queryClient, orpc.backups.settings.read()),
	component: BackupSettings,
});

function BackupSettings() {
	const backups = orpc.backups.settings.read();
	const bucketTest = useMutation(orpc.backups.test.mutationOptions());
	const revealKey = useMutation(orpc.backups.revealKey.mutationOptions());
	// The encryption key, shown on request and until it is hidden again.
	const [key, setKey] = useState<string | null>(null);
	return (
		<Pane title="Backup settings" back="/backups" cover>
			<Section
				title="Daily backup"
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
						offsiteAccessKey: each.offsiteAccessKey ?? undefined,
						offsiteSecretKey: each.offsiteSecretKey ?? undefined,
						offsiteRegion: each.offsiteRegion,
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
							control: "secret",
							description: "The bucket's access key.",
						},
						offsiteSecretKey: {
							label: "Secret access key",
							control: "secret",
							description: "The bucket's secret key.",
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
							line: "Writes, reads and deletes a small object in the bucket",
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
							line: "Database backups and the music files, as the switches above say",
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
							line: key
								? "Copy it somewhere other than the hub"
								: "Shown on request; it opens every encrypted file",
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
											fields: {
												key: { label: "Encryption key", control: "secret" },
											},
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
		</Pane>
	);
}
