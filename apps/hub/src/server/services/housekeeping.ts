import { defineService } from "@fcalell/plugin-node/server";
import purge from "../jobs/purge.ts";
import { purgeProviderCache } from "../lib/autotag.ts";
import { purgeOldPreviews } from "../lib/previews.ts";
import { ensureRules } from "../lib/rules.ts";
import { readSettings } from "../lib/settings.ts";
import { ensureGenres } from "../lib/taxonomy.ts";
import { enqueue } from "./jobs.ts";

const EVERY_MS = 6 * 3600 * 1000;

// Seeds what a library starts with (the genre taxonomy, the built-in cleanup rules),
// and on a timer deletes what has sat in the quarantine past its days and drops old
// previews.
export default defineService({
	name: "housekeeping",
	start() {
		ensureGenres();
		ensureRules();
		const tidy = (): void => {
			purgeOldPreviews();
			purgeProviderCache();
			const days = readSettings().quarantineDays;
			if (days > 0)
				enqueue(purge, { olderThanDays: days }, { reuse: () => true });
		};
		tidy();
		const timer = setInterval(tidy, EVERY_MS);
		return () => clearInterval(timer);
	},
});
