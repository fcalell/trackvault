import { defineService } from "@fcalell/plugin-node/server";
import wishlist from "../jobs/wishlist.ts";
import { slskdConfigured } from "../lib/slskd.ts";
import { dueWants } from "../lib/wishlist.ts";
import { enqueue } from "./jobs.ts";

const EVERY_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

// Once a minute: when Soulseek is set up and a want is due, queue a wishlist run (core's
// retry schedule decides what is due; a run already queued or running is reused).
export default defineService({
	name: "wishlist",
	start() {
		timer = setInterval(() => {
			if (slskdConfigured() && dueWants(1).length > 0)
				enqueue(wishlist, {}, { reuse: (existing) => !existing.wantIds });
		}, EVERY_MS);
		return () => {
			if (timer) clearInterval(timer);
			timer = null;
		};
	},
});
