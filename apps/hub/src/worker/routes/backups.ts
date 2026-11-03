import { mkdirSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { z } from "@fcalell/plugin-api/schema";
import { desc, eq } from "@fcalell/plugin-db/orm";
import { isKey, newKey } from "@trackvault/core/backup";
import {
	jobs as jobsTable,
	settings as settingsTable,
} from "../../schema/index.ts";
import backupJob from "../../server/jobs/backup.ts";
import backupVerify from "../../server/jobs/backup-verify.ts";
import offsiteJob from "../../server/jobs/offsite.ts";
import { listLocal, removeBackup } from "../../server/lib/backup/files.ts";
import { backupDirOf } from "../../server/lib/backup/make.ts";
import {
	connect,
	listRemoteBackups,
	offsiteConfigured,
	offsiteTotals,
} from "../../server/lib/backup/offsite.ts";
import { nextDue } from "../../server/lib/backup/schedule.ts";
import { db } from "../../server/lib/db.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { enqueue, toView } from "../../server/services/jobs.ts";
import { COMPRESSIONS } from "../../shared/backups.ts";
import { jobViewSchema } from "../../shared/channels.ts";

type Row = ReturnType<typeof readSettings>;

// A secret is never sent whole: the form draws its last four characters ("Saved, ends in …") and leaves it out of a save it was not touched in.
const mask = (value: string | null): string | null =>
	value
		? `${"•".repeat(Math.max(4, Math.min(value.length - 4, 12)))}${value.slice(-4)}`
		: null;

const settingsView = z.object({
	backupEnabled: z.boolean(),
	// The folder the owner set; null means the default beside the database.
	backupDir: z.string().nullable(),
	backupDirEffective: z.string(),
	backupHour: z.number(),
	backupKeepDaily: z.number(),
	backupKeepWeekly: z.number(),
	backupKeepMonthly: z.number(),
	backupCompression: z.enum(COMPRESSIONS),
	offsiteEnabled: z.boolean(),
	offsiteEndpoint: z.string().nullable(),
	offsiteBucket: z.string().nullable(),
	offsiteRegion: z.string(),
	offsiteAccessKey: z.string().nullable(),
	offsiteSecretKey: z.string().nullable(),
	offsitePrefix: z.string().nullable(),
	offsiteVirtualHosted: z.boolean(),
	offsiteDatabases: z.boolean(),
	offsiteLibrary: z.boolean(),
	offsitePrune: z.boolean(),
	offsiteEncrypt: z.boolean(),
	hasKey: z.boolean(),
	offsiteBandwidthKbps: z.number(),
	configured: z.boolean(),
});

function settingsOf(s: Row) {
	return {
		backupEnabled: s.backupEnabled,
		backupDir: s.backupDir,
		backupDirEffective: backupDirOf(s),
		backupHour: s.backupHour,
		backupKeepDaily: s.backupKeepDaily,
		backupKeepWeekly: s.backupKeepWeekly,
		backupKeepMonthly: s.backupKeepMonthly,
		backupCompression: s.backupCompression,
		offsiteEnabled: s.offsiteEnabled,
		offsiteEndpoint: s.offsiteEndpoint,
		offsiteBucket: s.offsiteBucket,
		offsiteRegion: s.offsiteRegion,
		offsiteAccessKey: mask(s.offsiteAccessKey),
		offsiteSecretKey: mask(s.offsiteSecretKey),
		offsitePrefix: s.offsitePrefix,
		offsiteVirtualHosted: s.offsiteVirtualHosted,
		offsiteDatabases: s.offsiteDatabases,
		offsiteLibrary: s.offsiteLibrary,
		offsitePrune: s.offsitePrune,
		offsiteEncrypt: s.offsiteEncrypt,
		hasKey: Boolean(s.offsiteKey),
		offsiteBandwidthKbps: s.offsiteBandwidthKbps,
		configured: offsiteConfigured(s),
	};
}

const whole = (min: number, max: number) =>
	z
		.number("Enter a number")
		.int("Enter a whole number")
		.min(min, `Enter ${min} or more`)
		.max(max, `Enter ${max} or less`);

const orNull = (value: string): string | null => (value === "" ? null : value);

const localView = z.object({
	name: z.string(),
	takenAt: z.date(),
	size: z.number(),
	rawSize: z.number().nullable(),
	compression: z.enum(COMPRESSIONS),
	kind: z.enum(["auto", "manual", "unknown"]),
	// verified: opened and checked; unverified: no check recorded; failed: a check failed.
	state: z.enum(["verified", "unverified", "failed"]),
	verifiedAt: z.date().nullable(),
	tracks: z.number().nullable(),
	files: z.number().nullable(),
	offsite: z
		.object({ uploadedAt: z.date(), encrypted: z.boolean() })
		.nullable(),
});

const remoteView = z.object({
	configured: z.boolean(),
	error: z.string().nullable(),
	items: z.array(
		z.object({
			key: z.string(),
			name: z.string(),
			takenAt: z.date(),
			size: z.number(),
			encrypted: z.boolean(),
		}),
	),
});

const latest = (kind: string) => {
	const row = db()
		.select()
		.from(jobsTable)
		.where(eq(jobsTable.kind, kind))
		.orderBy(desc(jobsTable.createdAt))
		.limit(1)
		.get();
	return row ? toView(row) : null;
};

export const backups = {
	settings: procedure({ auth: true, reads: ["settings"] })
		.output(settingsView)
		.query(() => settingsOf(readSettings())),

	updateSettings: procedure({ auth: true, writes: ["settings"] })
		.input(
			z.object({
				backupEnabled: z.boolean().optional(),
				backupDir: z.string().trim().optional(),
				backupHour: whole(0, 23).optional(),
				backupKeepDaily: whole(0, 3650).optional(),
				backupKeepWeekly: whole(0, 520).optional(),
				backupKeepMonthly: whole(0, 120).optional(),
				backupCompression: z.enum(COMPRESSIONS).optional(),
				offsiteEnabled: z.boolean().optional(),
				offsiteEndpoint: z
					.string()
					.trim()
					.refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), {
						message:
							"Enter an address like https://<account>.r2.cloudflarestorage.com",
					})
					.optional(),
				offsiteBucket: z.string().trim().optional(),
				offsiteRegion: z.string().trim().min(1, "Enter a region").optional(),
				offsiteAccessKey: z.string().trim().nullable().optional(),
				offsiteSecretKey: z.string().trim().nullable().optional(),
				offsitePrefix: z.string().trim().optional(),
				offsiteVirtualHosted: z.boolean().optional(),
				offsiteDatabases: z.boolean().optional(),
				offsiteLibrary: z.boolean().optional(),
				offsitePrune: z.boolean().optional(),
				offsiteEncrypt: z.boolean().optional(),
				offsiteBandwidthKbps: whole(0, 10_000_000).optional(),
			}),
		)
		.output(settingsView)
		.mutation(({ input }) => {
			const before = readSettings();
			let dir: string | null | undefined;
			if (input.backupDir !== undefined) {
				if (input.backupDir === "") dir = null;
				else {
					dir = normalize(input.backupDir).replace(/(.)\/+$/, "$1");
					if (!isAbsolute(dir))
						throw new ApiError("BAD_REQUEST", {
							message: "Enter the folder's full path, starting with /",
						});
					// It must be somewhere the hub can write.
					try {
						mkdirSync(dir, { recursive: true });
						const probe = join(dir, `.write-test-${process.pid}`);
						writeFileSync(probe, "");
						rmSync(probe);
					} catch {
						throw new ApiError("BAD_REQUEST", {
							message: "The hub cannot write to that folder",
						});
					}
				}
			}
			// An encryption key is made the first time encryption is switched on.
			const key =
				input.offsiteEncrypt && !before.offsiteKey ? newKey() : undefined;
			db()
				.update(settingsTable)
				.set({
					...(input.backupEnabled !== undefined && {
						backupEnabled: input.backupEnabled,
					}),
					...(dir !== undefined && { backupDir: dir }),
					...(input.backupHour !== undefined && {
						backupHour: input.backupHour,
					}),
					...(input.backupKeepDaily !== undefined && {
						backupKeepDaily: input.backupKeepDaily,
					}),
					...(input.backupKeepWeekly !== undefined && {
						backupKeepWeekly: input.backupKeepWeekly,
					}),
					...(input.backupKeepMonthly !== undefined && {
						backupKeepMonthly: input.backupKeepMonthly,
					}),
					...(input.backupCompression !== undefined && {
						backupCompression: input.backupCompression,
					}),
					...(input.offsiteEnabled !== undefined && {
						offsiteEnabled: input.offsiteEnabled,
					}),
					...(input.offsiteEndpoint !== undefined && {
						offsiteEndpoint: orNull(input.offsiteEndpoint),
					}),
					...(input.offsiteBucket !== undefined && {
						offsiteBucket: orNull(input.offsiteBucket),
					}),
					...(input.offsiteRegion !== undefined && {
						offsiteRegion: input.offsiteRegion,
					}),
					...(input.offsiteAccessKey !== undefined && {
						offsiteAccessKey: orNull(input.offsiteAccessKey ?? ""),
					}),
					...(input.offsiteSecretKey !== undefined && {
						offsiteSecretKey: orNull(input.offsiteSecretKey ?? ""),
					}),
					...(input.offsitePrefix !== undefined && {
						offsitePrefix: orNull(
							input.offsitePrefix.replace(/^\/+|\/+$/g, ""),
						),
					}),
					...(input.offsiteVirtualHosted !== undefined && {
						offsiteVirtualHosted: input.offsiteVirtualHosted,
					}),
					...(input.offsiteDatabases !== undefined && {
						offsiteDatabases: input.offsiteDatabases,
					}),
					...(input.offsiteLibrary !== undefined && {
						offsiteLibrary: input.offsiteLibrary,
					}),
					...(input.offsitePrune !== undefined && {
						offsitePrune: input.offsitePrune,
					}),
					...(input.offsiteEncrypt !== undefined && {
						offsiteEncrypt: input.offsiteEncrypt,
					}),
					...(key && { offsiteKey: key }),
					...(input.offsiteBandwidthKbps !== undefined && {
						offsiteBandwidthKbps: input.offsiteBandwidthKbps,
					}),
					updatedAt: new Date(),
				})
				.where(eq(settingsTable.id, 1))
				.run();
			return settingsOf(readSettings());
		}),

	// The key that opens encrypted offsite files, to be kept somewhere other than the hub.
	revealKey: procedure({ auth: true })
		.output(z.object({ key: z.string().nullable() }))
		.mutation(() => ({ key: readSettings().offsiteKey })),

	// Sets the key to one the owner already has (a rebuilt hub reading old files).
	setKey: procedure({ auth: true, writes: ["settings"] })
		.input(
			z.object({
				key: z
					.string()
					.trim()
					.refine(isKey, { message: "Enter the 64 characters of the key" }),
			}),
		)
		.output(settingsView)
		.mutation(({ input }) => {
			readSettings();
			db()
				.update(settingsTable)
				.set({ offsiteKey: input.key.toLowerCase(), updatedAt: new Date() })
				.where(eq(settingsTable.id, 1))
				.run();
			return settingsOf(readSettings());
		}),

	// The local backups, newest first.
	list: procedure({ auth: true, reads: ["settings"] })
		.output(z.array(localView))
		.query(() =>
			listLocal(backupDirOf(readSettings())).map((item) => {
				const meta = item.meta;
				return {
					name: item.name,
					takenAt: item.at,
					size: item.size,
					rawSize: meta?.rawSize ?? null,
					compression: item.compression,
					kind: meta?.kind ?? ("unknown" as const),
					state: !meta
						? ("unverified" as const)
						: meta.verified
							? ("verified" as const)
							: meta.verifiedAt
								? ("failed" as const)
								: ("unverified" as const),
					verifiedAt: meta?.verifiedAt ? new Date(meta.verifiedAt) : null,
					tracks: meta?.rows.tracks ?? null,
					files: meta?.rows.files ?? null,
					offsite: meta?.offsite
						? {
								uploadedAt: new Date(meta.offsite.uploadedAt),
								encrypted: meta.offsite.encrypted,
							}
						: null,
				};
			}),
		),

	// The database backups in the bucket (a request to the storage).
	remote: procedure({ auth: true, reads: ["settings"] })
		.output(remoteView)
		.query(async () => {
			const s = readSettings();
			if (!offsiteConfigured(s))
				return { configured: false, error: null, items: [] };
			try {
				const items = await listRemoteBackups(connect(s));
				return {
					configured: true,
					error: null,
					items: items.map((item) => ({
						key: item.key,
						name: item.name,
						takenAt: item.at,
						size: item.size,
						encrypted: item.encrypted,
					})),
				};
			} catch (error) {
				return {
					configured: true,
					error: (error as Error).message,
					items: [],
				};
			}
		}),

	status: procedure({ auth: true, reads: ["settings", "jobs"] })
		.output(
			z.object({
				enabled: z.boolean(),
				dir: z.string(),
				freeBytes: z.number().nullable(),
				nextAt: z.date().nullable(),
				// The newest backup on this hub that opened and checked clean.
				lastGood: z.date().nullable(),
				lastBackup: jobViewSchema.nullable(),
				lastVerify: jobViewSchema.nullable(),
				lastOffsite: jobViewSchema.nullable(),
				offsite: z.object({
					enabled: z.boolean(),
					configured: z.boolean(),
					files: z.number(),
					bytes: z.number(),
				}),
			}),
		)
		.query(() => {
			const s = readSettings();
			const dir = backupDirOf(s);
			let free: number | null = null;
			try {
				const stat = statfsSync(dir);
				free = stat.bavail * stat.bsize;
			} catch {}
			const totals = offsiteTotals();
			return {
				enabled: s.backupEnabled,
				dir,
				freeBytes: free,
				nextAt: s.backupEnabled ? nextDue(new Date(), s.backupHour) : null,
				lastGood:
					listLocal(dir).find((item) => item.meta?.verified)?.at ?? null,
				lastBackup: latest("backup"),
				lastVerify: latest("backup-verify"),
				lastOffsite: latest("offsite"),
				offsite: {
					enabled: s.offsiteEnabled,
					configured: offsiteConfigured(s),
					files: totals.files,
					bytes: totals.bytes,
				},
			};
		}),

	backupNow: procedure({ auth: true, writes: ["jobs"] })
		.output(jobViewSchema)
		.mutation(() =>
			enqueue(backupJob, { kind: "manual" }, { reuse: () => true }),
		),

	verify: procedure({ auth: true, writes: ["jobs"] })
		.input(z.object({ name: z.string() }))
		.output(jobViewSchema)
		.mutation(({ input }) => enqueue(backupVerify, { name: input.name })),

	remove: procedure({ auth: true })
		.input(z.object({ name: z.string() }))
		.mutation(({ input }) => {
			const found = listLocal(backupDirOf(readSettings())).find(
				(item) => item.name === input.name,
			);
			if (!found) throw new ApiError("NOT_FOUND");
			removeBackup(found.path);
		}),

	// Sends database backups (and, when asked, the library) to the bucket now.
	uploadNow: procedure({ auth: true, writes: ["jobs"] })
		.input(
			z
				.object({ library: z.boolean().default(false) })
				.default({ library: false }),
		)
		.output(jobViewSchema)
		.mutation(({ input }) => {
			const s = readSettings();
			if (!offsiteConfigured(s))
				throw new ApiError("BAD_REQUEST", {
					message: "Set up offsite storage first: the bucket and both keys",
				});
			return enqueue(
				offsiteJob,
				{
					database: s.offsiteDatabases,
					library: input.library || s.offsiteLibrary,
				},
				{ reuse: () => true },
			);
		}),

	// Writes, reads and deletes a small object to prove the settings work.
	test: procedure({ auth: true })
		.output(z.object({ message: z.string() }))
		.mutation(async () => {
			try {
				const remote = connect(readSettings());
				const { ms } = await remote.client.test();
				return {
					message: `Connected to ${remote.client.config.bucket} (${ms} ms)`,
				};
			} catch (error) {
				throw new ApiError("BAD_REQUEST", {
					message: (error as Error).message,
				});
			}
		}),
};
