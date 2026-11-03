import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { PreviewSection } from "../../lib/preview.tsx";

export const Route = createFileRoute("/_app/genres")({
	component: Genres,
});

type Genre = AppRouter["genres"]["list"]["__output"][number];
type Unknown = AppRouter["genres"]["unknown"]["__output"][number];

const count = new Intl.NumberFormat("en");

// The genre taxonomy: the names and their aliases, the values in the library it does
// not know yet (map them to a genre, in a click each), and the unify that rewrites
// every track to the canonical spelling after a preview.
function Genres() {
	const genres = orpc.genres.list.read();
	const unknown = orpc.genres.unknown.read();
	const mapOne = useMutation(orpc.genres.mapOne.mutationOptions());
	const remove = useMutation(orpc.genres.remove.mutationOptions());
	const removeAlias = useMutation(orpc.genres.removeAlias.mutationOptions());
	const apply = useMutation(orpc.unifyTags.apply.mutationOptions());

	const toGenre = (genre: Genre): Row => ({
		key: `genre-${genre.id}`,
		leading: { icon: "Music" },
		title: genre.name,
		facts: [`${count.format(genre.tracks)} tracks`],
		more: [
			{
				label: "Add an alias",
				sheet: sheetOf({
					title: `Add an alias to ${genre.name}`,
					description: "Another spelling of this genre that Unify rewrites.",
					form: {
						act: orpc.genres.addAlias,
						given: { genreId: genre.id },
						fields: { alias: { label: "Spelling" } },
						submit: { label: "Add", done: "Alias added" },
					},
				}),
			},
			{
				label: "Delete genre",
				onAct: () => remove.mutateAsync({ id: genre.id }),
				confirm: {
					title: `Delete ${genre.name}?`,
					sentence: "The genre and its aliases are removed. No track changes.",
				},
			},
		],
		children: genre.aliases.map((alias) => ({
			key: `alias-${alias.id}`,
			title: alias.alias,
			facts: ["Alias"],
			act: {
				icon: "X" as const,
				label: `Remove ${alias.alias}`,
				onAct: () => removeAlias.mutateAsync({ id: alias.id }),
			},
		})),
	});

	const toUnknown = (row: Unknown): Row => ({
		key: `unknown-${row.value}`,
		leading: { icon: "CircleHelp" },
		title: row.value,
		facts: [
			`${count.format(row.count)} tracks`,
			row.suggestions.length > 0
				? `Closest: ${row.suggestions.join(", ")}`
				: "No close genre",
		],
		pick:
			row.suggestions.length > 0
				? {
						label: `Map ${row.value} to a close genre`,
						options: row.suggestions.map((name) => ({
							value: name,
							label: name,
						})),
						value: undefined,
						onChange: (genre: string) =>
							mapOne.mutateAsync({ value: row.value, genre }),
					}
				: undefined,
		more: [
			{
				label: "Map to another genre",
				sheet: sheetOf({
					title: `Map ${row.value} to a genre`,
					form: {
						act: orpc.genres.mapOne,
						given: { value: row.value },
						fields: {
							genre: {
								label: "Genre",
								options: genres.at((known) =>
									known.map((each) => ({ value: each.name, label: each.name })),
								),
							},
						},
						submit: { label: "Map", done: "Mapped" },
					},
				}),
			},
		],
	});

	return (
		<Pane
			title="Genres"
			back={false}
			acts={[
				{
					icon: "Replace",
					label: "Preview unify on the library",
					onAct: () => orpc.unifyTags.preview.call({ fields: ["genre"] }),
					done: "Previewing the genres",
				},
			]}
		>
			<Section
				title="Not in the taxonomy"
				description="Genre values the library carries that no genre or alias names. Map one to a genre, then unify."
				items={unknown.at((rows) => rows.map(toUnknown))}
				empty={{ sentence: "Every genre in the library is known." }}
			/>
			<Section
				title="Taxonomy"
				items={genres.at((rows) => rows.map(toGenre))}
				act={{
					icon: "Plus",
					label: "New genre",
					sheet: sheetOf({
						title: "New genre",
						form: {
							act: orpc.genres.create,
							fields: { name: { label: "Name" } },
							submit: { label: "Add", done: "Genre added" },
						},
					}),
				}}
				empty={{ sentence: "No genres yet." }}
			/>
			<PreviewSection
				kind="unify"
				title="Unify preview"
				none="Preview the unify to see which genres would be rewritten."
				words={(result) =>
					`${count.format(result.tracks ?? 0)} tracks would change.`
				}
				changes={(result) => result.tracks ?? 0}
				apply={{
					label: "Unify the library",
					confirm: {
						title: "Unify the genres?",
						sentence:
							"Every change shown is written to the library and to the files. Undo the batch in History.",
					},
					onAct: () => apply.mutateAsync({ fields: ["genre"] }),
					done: "Unifying",
					to: "/jobs",
				}}
			/>
		</Pane>
	);
}
