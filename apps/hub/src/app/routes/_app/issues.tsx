import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Banner } from "@fcalell/plugin-react-ui/components/banner";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { ISSUE_LABELS, type IssueFilter } from "../../../shared/library.ts";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/issues")({
	component: Issues,
});

type Issue = AppRouter["health"]["summary"]["__output"]["issues"][number];

const count = new Intl.NumberFormat("en");

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

// The library's issues grouped, each with its count and a link into the library
// filtered by it, and the two health checks that need ffmpeg.
function Issues() {
	const run = useMutation(orpc.health.run.mutationOptions());
	const summary = orpc.health.summary.read();
	const toRow = (issue: Issue): Row => ({
		key: issue.value,
		leading: { tone: issue.count > 0 ? "attention" : "done" },
		title: ISSUE_LABELS[issue.value],
		line: WHY[issue.value],
		trailing: { count: issue.count },
		href: issue.count > 0 ? `/library?issue=${issue.value}` : undefined,
		dim: issue.count === 0,
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
				items={summary.at((each) => each.issues.map(toRow))}
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
							`${count.format(each.checked.integrity)} of ${count.format(each.total)} checked`,
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
							`${count.format(each.checked.bitrate)} of ${count.format(each.total)} checked`,
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
