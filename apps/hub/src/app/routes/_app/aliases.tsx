import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { PreviewFoot, PreviewSection } from "../../lib/preview.tsx";
import { count } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/aliases")({
	component: Aliases,
});

type Kind = "artist" | "label";
type Alias = AppRouter["aliases"]["list"]["__output"][number];
type Suggestion = AppRouter["aliases"]["suggest"]["__output"][number];

const NOUN: Record<Kind, string> = { artist: "artist", label: "label" };

// Artist and label aliases: spellings that differ by case, spacing or punctuation
// grouped for a one-click merge, the aliases kept, and the unify that applies them.
function Aliases() {
	const map = useMutation(orpc.aliases.map.mutationOptions());
	const remove = useMutation(orpc.aliases.remove.mutationOptions());
	const apply = useMutation(orpc.unifyTags.apply.mutationOptions());

	const toSuggestion =
		(kind: Kind) =>
		(row: Suggestion): Row => ({
			key: `${kind}-${row.canonical}`,
			leading: { icon: "Merge" },
			title: row.canonical,
			facts: row.variants.map(
				(variant) => `${variant.value} (${count(variant.count)})`,
			),
			act: {
				icon: "Check",
				label: `Merge into ${row.canonical}`,
				onAct: () =>
					map.mutateAsync({
						kind,
						items: row.variants.map((variant) => ({
							alias: variant.value,
							canonical: row.canonical,
						})),
					}),
				done: "Spellings mapped",
			},
		});

	const toAlias =
		(kind: Kind) =>
		(row: Alias): Row => ({
			key: `${kind}-alias-${row.id}`,
			leading: { icon: "ArrowRight" },
			title: row.alias,
			facts: [`is ${row.canonical}`],
			act: {
				icon: "X",
				label: `Remove ${row.alias}`,
				onAct: () => remove.mutateAsync({ kind, id: row.id }),
			},
		});

	const artistSuggestions = orpc.aliases.suggest.read({ kind: "artist" });
	const labelSuggestions = orpc.aliases.suggest.read({ kind: "label" });
	const artistAliases = orpc.aliases.list.read({ kind: "artist" });
	const labelAliases = orpc.aliases.list.read({ kind: "label" });

	const add = (kind: Kind) => ({
		icon: "Plus" as const,
		label: `Add a ${NOUN[kind]} alias`,
		sheet: sheetOf({
			title: `Add a ${NOUN[kind]} alias`,
			form: {
				act: orpc.aliases.add,
				given: { kind },
				fields: {
					alias: { label: "Spelling" },
					canonical: { label: `Name to use` },
				},
				submit: { label: "Add", done: "Alias added" },
			},
		}),
	});

	return (
		<Pane
			title="Aliases"
			back={false}
			wide
			acts={[
				{
					icon: "Replace",
					label: "Preview tidying the spellings",
					onAct: () =>
						orpc.unifyTags.preview.call({ fields: ["artist", "label"] }),
					done: "Previewing the aliases",
				},
			]}
			foot={
				<PreviewFoot
					kind="unify"
					fields={["artist", "label"]}
					changes={(result) => result.tracks ?? 0}
					apply={{
						label: "Tidy the spellings",
						confirm: {
							title: "Tidy artist and label spellings?",
							sentence:
								"The artist and label of every track in the preview are rewritten to their canonical spelling, in the library and in each file's tags. Genres are not touched. Undo the batch in History.",
						},
						onAct: () => apply.mutateAsync({ fields: ["artist", "label"] }),
						done: "Tidying the spellings",
						to: "/jobs",
					}}
				/>
			}
		>
			<Section
				title="Artist spellings to merge"
				items={artistSuggestions.at((rows) => rows.map(toSuggestion("artist")))}
				empty={{ sentence: "No artist is spelled two ways." }}
			/>
			<Section
				title="Artist aliases"
				items={artistAliases.at((rows) => rows.map(toAlias("artist")))}
				act={add("artist")}
				empty={{ sentence: "No artist aliases yet." }}
			/>
			<Section
				title="Label spellings to merge"
				items={labelSuggestions.at((rows) => rows.map(toSuggestion("label")))}
				empty={{ sentence: "No label is spelled two ways." }}
			/>
			<Section
				title="Label aliases"
				items={labelAliases.at((rows) => rows.map(toAlias("label")))}
				act={add("label")}
				empty={{ sentence: "No label aliases yet." }}
			/>
			<PreviewSection
				kind="unify"
				fields={["artist", "label"]}
				title="Spelling preview"
				none="Preview tidying the spellings to see which tracks would change."
				words={(result) => `${count(result.tracks ?? 0)} tracks would change.`}
			/>
		</Pane>
	);
}
