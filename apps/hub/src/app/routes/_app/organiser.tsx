import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Form } from "@fcalell/plugin-react-ui/components/form";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { Section } from "@fcalell/plugin-react-ui/components/section";

import { createFileRoute } from "@tanstack/react-router";
import { ORGANISER_PRESETS } from "../../../shared/organiser.ts";
import { orpc } from "../../lib/api.ts";
import { PreviewSection } from "../../lib/preview.tsx";

export const Route = createFileRoute("/_app/organiser")({
	component: Organiser,
});

const count = new Intl.NumberFormat("en");

// The organiser: a folder and file template, a preview of where every file would
// go (moves, name collisions, files already in place), and the job that moves them.
function Organiser() {
	const organiser = orpc.organiser.get.read();
	const save = useMutation(orpc.organiser.save.mutationOptions());
	return (
		<Pane title="Organiser" back={false} wide>
			<Section
				title="Template"
				description="Where each file lives under the library folder."
			>
				<Form
					act={orpc.organiser.preview}
					values={organiser.at((each) => ({ template: each.template }))}
					submit={{ label: "Preview", done: "Planning the moves" }}
					fields={{
						template: {
							label: "Template",
							description:
								"{artist}, {title}, {mix}, {genre}, {key}, {bpm}, {label}, {album}, {year}. {genre|Unknown} gives a fallback, [ ({mix})] is dropped when empty, / starts a folder.",
						},
					}}
				/>
			</Section>
			<Section
				title="Presets"
				items={ORGANISER_PRESETS.map((preset) => ({
					key: preset.label,
					leading: { icon: "FolderTree" as const },
					title: preset.label,
					facts: [{ code: preset.template }],
					act: {
						icon: "Check" as const,
						label: `Use ${preset.label}`,
						onAct: () => save.mutateAsync({ template: preset.template }),
						done: "Template set",
					},
				}))}
			/>
			<PreviewSection
				kind="organise"
				title="Preview"
				none="Preview the template to see where the files would go."
				words={(result) =>
					`${count.format(result.moves ?? 0)} files would move, ${count.format(result.collisions ?? 0)} take a numbered name, ${count.format(result.unchanged ?? 0)} are already in place.`
				}
				changes={(result) => result.moves ?? 0}
				apply={{
					label: "Move the files",
					confirm: {
						title: "Move the files?",
						sentence:
							"Every file shown moves to its new place on the hub's disk. Undo the batch in History to move them back.",
					},
					onAct: async () => {
						const { template } = await orpc.organiser.get.call();
						return orpc.organiser.apply.call({ template });
					},
					done: "Moving files",
					to: "/jobs",
				}}
			/>
		</Pane>
	);
}
