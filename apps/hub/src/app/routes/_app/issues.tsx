import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { ISSUE_LABELS, type IssueFilter } from "../../../shared/library.ts";
import { orpc } from "../../lib/api.ts";
import { count } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/issues")({
	component: Issues,
});

type Summary = AppRouter["health"]["summary"]["__output"];

// What each issue means, in a line.
const WHY: Record<IssueFilter, string> = {
	lowBitrate: "Under the bitrate threshold in Settings",
	noTitle: "The title tag is empty",
	noArtist: "The artist tag is empty",
	noGenre: "The genre tag is empty",
	noBpm: "No tempo in the tags",
	noKey: "No musical key in the tags",
	noArt: "No cover art embedded",
	undecodable: "The scan found no audio frames",
	missingFile: "No file of the track is on disk",
	corrupt: "ffmpeg could not decode the file to its end",
	fakeBitrate: "The audio ends where a lower bitrate's does",
};

// Where each issue is fixed: the library filtered by it, where the bulk acts are
// (or the place that finds better copies).
const FIX: Record<IssueFilter, { label: string; href: string }> = {
	lowBitrate: { label: "Find better copies", href: "/search" },
	noTitle: { label: "Edit the tags", href: "/library?issue=noTitle" },
	noArtist: { label: "Edit the tags", href: "/library?issue=noArtist" },
	noGenre: { label: "Edit the tags", href: "/library?issue=noGenre" },
	noBpm: { label: "Analyse the tracks", href: "/library?issue=noBpm" },
	noKey: { label: "Analyse the tracks", href: "/library?issue=noKey" },
	noArt: { label: "Find covers", href: "/library?issue=noArt" },
	undecodable: {
		label: "Review the files",
		href: "/library?issue=undecodable",
	},
	missingFile: {
		label: "Review the tracks",
		href: "/library?issue=missingFile",
	},
	corrupt: { label: "Review the files", href: "/library?issue=corrupt" },
	fakeBitrate: { label: "Find better copies", href: "/search" },
};

// The checks that read each file: an issue they find is only counted over the
// files they have been through.
const CHECKED: Partial<Record<IssueFilter, "integrity" | "bitrate">> = {
	corrupt: "integrity",
	fakeBitrate: "bitrate",
};

// The library's issues grouped, each with its count and a link into the library
// filtered by it, and the two health checks that need ffmpeg.
function Issues() {
	const run = useMutation(orpc.health.run.mutationOptions());
	const summary = orpc.health.summary.read();
	const toRow = (each: Summary): Row[] =>
		each.issues.map((issue) => {
			const check = CHECKED[issue.value];
			const unchecked = check ? each.total - each.checked[check] : 0;
			const open = issue.count > 0;
			return {
				key: issue.value,
				leading: {
					tone: open ? "attention" : unchecked > 0 ? "idle" : "done",
				},
				title: ISSUE_LABELS[issue.value],
				line: WHY[issue.value],
				facts:
					check && unchecked > 0
						? [`Checked ${count(each.checked[check])} of ${count(each.total)}`]
						: [],
				trailing: open ? { count: issue.count } : undefined,
				act: open ? { icon: "Wrench", ...FIX[issue.value] } : undefined,
				dim: !open,
			};
		});
	return (
		<Pane title="Issues" back={false} wide>
			<Banner
				tone="attention"
				sentence={summary.at((each) =>
					each.ffmpeg === false
						? "The corrupt and fake bitrate checks need ffmpeg on the hub's PATH."
						: undefined,
				)}
			/>
			<Section
				title="By issue"
				items={summary.at(toRow)}
				empty={{ sentence: "Nothing to fix." }}
			/>
			<Section
				title="Health checks"
				items={summary.at((each) => [
					{
						key: "integrity",
						leading: { icon: "ShieldCheck" as const },
						title: "Decode every file",
						facts: [
							`${count(each.checked.integrity)} of ${count(each.total)} checked`,
						],
						act: {
							icon: "Play" as const,
							label: "Check integrity",
							onAct: () => run.mutateAsync({ check: "integrity" }),
							done: "Checking files",
							to: "/jobs",
						},
					},
					{
						key: "bitrate",
						leading: { icon: "Gauge" as const },
						title: "Measure the spectrum",
						facts: [
							`${count(each.checked.bitrate)} of ${count(each.total)} checked`,
						],
						act: {
							icon: "Play" as const,
							label: "Check bitrates",
							onAct: () => run.mutateAsync({ check: "bitrate" }),
							done: "Measuring files",
							to: "/jobs",
						},
					},
				])}
			/>
		</Pane>
	);
}
