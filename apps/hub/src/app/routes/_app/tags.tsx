import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/tags")({
	component: Tags,
});

type Tag = AppRouter["tags"]["list"]["__output"][number];

const count = new Intl.NumberFormat("en");

// Custom tags (vibe, set position, venue): made here, put on tracks from the record or
// by the library's Edit tags act, and a filter of the library.
function Tags() {
	const remove = useMutation(orpc.tags.remove.mutationOptions());
	const tags = orpc.tags.list.read();
	const toRow = (tag: Tag): Row => ({
		key: String(tag.id),
		leading: { icon: "Tag" },
		title: tag.name,
		facts: [
			tag.tracks === 1 ? "1 track" : `${count.format(tag.tracks)} tracks`,
		],
		act: {
			icon: "Library",
			label: `Show ${tag.name} in the library`,
			href: `/library?tag=${tag.id}`,
		},
		more: [
			{
				label: "Rename",
				sheet: sheetOf({
					title: `Rename ${tag.name}`,
					form: {
						act: orpc.tags.rename,
						given: { id: tag.id },
						values: { name: tag.name },
						fields: { name: { label: "Name" } },
						submit: { label: "Rename", done: "Tag renamed" },
					},
				}),
			},
			{
				label: "Delete",
				onAct: () => remove.mutateAsync({ id: tag.id }),
				confirm: {
					title: `Delete ${tag.name}?`,
					sentence: "It comes off every track that carries it.",
				},
			},
		],
	});
	return (
		<Pane
			title="Custom tags"
			back={false}
			acts={[
				{
					icon: "Plus",
					label: "New tag",
					sheet: sheetOf({
						title: "New tag",
						form: {
							act: orpc.tags.create,
							fields: { name: { label: "Name" } },
							submit: { label: "Add", done: "Tag added" },
						},
					}),
				},
			]}
		>
			<Section
				items={tags.at((rows) => rows.map(toRow))}
				empty={{
					sentence: "No custom tags yet. Make one, then put it on tracks.",
				}}
			/>
		</Pane>
	);
}
