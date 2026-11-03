import { and, eq, gte } from "@fcalell/plugin-db/orm";
import { defineService } from "@fcalell/plugin-node/server";
import { jobs } from "../../schema/index.ts";
import backup from "../jobs/backup.ts";
import { lastDue } from "../lib/backup/schedule.ts";
import { db } from "../lib/db.ts";
import { readSettings } from "../lib/settings.ts";
import { enqueue } from "./jobs.ts";

const EVERY_MS = 60 * 1000;
// A moment after start, so a restart that missed the hour backs up promptly.
const FIRST_MS = 15 * 1000;

// Takes the daily backup: once a minute it asks whether the latest scheduled hour has
// passed without a backup job since (one that failed counts, so a broken setup does
// not retry every minute). A hub that was off at the hour backs up when it starts.
export default defineService({
	name: "backup",
	start({ log }) {
		const check = (): void => {
			try {
				const settings = readSettings();
				if (!settings.backupEnabled) return;
				const due = lastDue(new Date(), settings.backupHour);
				const attempted = db()
					.select({ id: jobs.id })
					.from(jobs)
					.where(and(eq(jobs.kind, "backup"), gte(jobs.createdAt, due)))
					.limit(1)
					.get();
				if (attempted) return;
				log.info("daily backup is due");
				enqueue(backup, { kind: "auto" }, { reuse: () => true });
			} catch (error) {
				log.error(`backup schedule: ${(error as Error).message}`);
			}
		};
		const first = setTimeout(check, FIRST_MS);
		const timer = setInterval(check, EVERY_MS);
		return () => {
			clearTimeout(first);
			clearInterval(timer);
		};
	},
});
