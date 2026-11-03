import { preload } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { createFileRoute } from "@tanstack/react-router";
import {
	ANALYSIS_WINDOW_LABELS,
	ANALYSIS_WINDOWS,
} from "../../../shared/intelligence.ts";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/settings/analysis")({
	loader: ({ context }) =>
		Promise.all([preload(context.queryClient, orpc.autotag.settings.read())]),
	component: AnalysisSettings,
});

function AnalysisSettings() {
	const autotag = orpc.autotag.settings.read();
	return (
		<Pane
			title="Cover art and analysis"
			back="/settings"
			cover
			record={{
				within: "Settings",
				description:
					"Covers are embedded in the files. Analysis measures BPM, key, energy and loudness in the background.",
			}}
		>
			<Form
				act={orpc.autotag.updateSettings}
				commit="field"
				values={autotag.at((each) => ({
					artMinSide: each.artMinSide,
					analyseAuto: each.analyseAuto,
					analyseFillConfidence: each.analyseFillConfidence,
					analyseWindow: each.analyseWindow,
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
					analyseWindow: {
						label: "Analysis window",
						description:
							"How much of each track is read for BPM, key and energy, from its middle. A longer window reads more of the track, so each one takes longer to analyse. A change applies to the next run and does not re-analyse tracks already measured.",
						options: ANALYSIS_WINDOWS.map((value) => ({
							value,
							label: ANALYSIS_WINDOW_LABELS[value],
						})),
					},
				}}
			/>
		</Pane>
	);
}
