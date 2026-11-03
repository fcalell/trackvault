import type { Tone } from "@fcalell/ui-core/tokens";
import type { AppRouter } from "../../../.stack/worker";
import { noun } from "./devices.ts";

export type Attention = AppRouter["attention"]["counts"]["__output"];

export const NOTHING_WAITING: Attention = {
	inbox: 0,
	review: 0,
	conflicts: 0,
	duplicates: 0,
	failedJobs: 0,
	backupFailed: false,
};

// What the owner is asked to look at, worst first; each with the sentence it adds and
// the place that settles it.
const ASKS = (each: Attention) => [
	{
		on: each.backupFailed,
		says: "The last backup failed.",
		act: { label: "Open Backups", href: "/backups" },
	},
	{
		on: each.failedJobs > 0,
		says: `${noun(each.failedJobs, "job")} failed.`,
		act: { label: "Open Jobs", href: "/jobs" },
	},
	{
		on: each.inbox > 0,
		says: `${noun(each.inbox, "inbox item")} waiting.`,
		act: { label: "Open the inbox", href: "/inbox" },
	},
	{
		on: each.conflicts > 0,
		says: `${noun(each.conflicts, "conflict")} to review.`,
		act: { label: "Review conflicts", href: "/devices/conflicts" },
	},
];

// The library's Banner, from the same counts as the sidebar's badges. Nothing
// waiting: no Banner.
export function attentionBanner(
	each: Attention,
):
	| { tone: Tone; sentence: string; act: { label: string; href: string } }
	| undefined {
	const asks = ASKS(each).filter((ask) => ask.on);
	const first = asks[0];
	if (!first) return undefined;
	return {
		tone: each.backupFailed || each.failedJobs > 0 ? "failed" : "attention",
		sentence: asks.map((ask) => ask.says).join(" "),
		act: first.act,
	};
}
