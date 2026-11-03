import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { sheetOf } from "@fcalell/plugin-react-ui/lib/act";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { PreviewFoot, PreviewSection } from "../../lib/preview.tsx";
import { queuedBatch } from "../../ui/batch.ts";
import { count } from "../../ui/figures.ts";

export const Route = createFileRoute("/_app/rules")({
	component: Rules,
});

type Rule = AppRouter["cleanup"]["list"]["__output"][number];

// The form of a rule: which fields matter depends on the action, as each label says.
const RULE_FIELDS = {
	name: { label: "Name" },
	action: {
		label: "Action",
		options: [
			{ value: "whitespace", label: "Trim and collapse spaces" },
			{ value: "stripJunk", label: "Strip URLs and promo tags" },
			{ value: "case", label: "Change case" },
			{ value: "normalizeSeparators", label: "Normalise artist separators" },
			{ value: "replace", label: "Find and replace" },
			{ value: "set", label: "Set a tag" },
		],
	},
	fields: {
		label: "Tags it touches",
		description: "None means every text tag. Not used by Set a tag.",
	},
	caseMode: {
		label: "Case",
		description: "Used by Change case.",
		options: [
			{ value: "title", label: "Title Case" },
			{ value: "lower", label: "lower case" },
			{ value: "upper", label: "UPPER CASE" },
			{ value: "sentence", label: "Sentence case" },
		],
	},
	pattern: { label: "Find", description: "Used by Find and replace." },
	replacement: { label: "Replace with" },
	literal: {
		label: "Find it as written",
		description: "Off reads Find as a regular expression.",
	},
	setField: { label: "Tag to set", description: "Used by Set a tag." },
	setValue: { label: "Value" },
	onlyIfEmpty: {
		label: "Only when the tag is empty",
		description: "Used by Set a tag.",
	},
} as const;

// Rules: the list to switch and edit, then the preview of what the enabled
// ones would change across the library and the job that applies them.
function Rules() {
	const toggle = useMutation(orpc.cleanup.toggle.mutationOptions());
	const remove = useMutation(orpc.cleanup.remove.mutationOptions());
	const apply = useMutation(orpc.cleanup.apply.mutationOptions());

	const toRow = (rule: Rule): Row => ({
		key: rule.id,
		leading: { icon: rule.builtin ? "Sparkles" : "WandSparkles" },
		title: rule.name,
		line: rule.summary,
		switch: {
			checked: rule.enabled,
			onChange: (checked) =>
				toggle.mutateAsync({ id: rule.id, enabled: checked }),
		},
		more: [
			...(rule.form
				? [
						{
							label: "Edit",
							sheet: sheetOf({
								title: "Edit rule",
								form: {
									act: orpc.cleanup.save,
									given: { id: rule.id },
									values: { name: rule.name, ...rule.form },
									fields: RULE_FIELDS,
									submit: { label: "Save", done: "Rule saved" },
								},
							}),
						},
					]
				: []),
			...(rule.builtin
				? []
				: [
						{
							label: "Delete",
							onAct: () => remove.mutateAsync({ id: rule.id }),
							confirm: {
								title: `Delete ${rule.name}?`,
								sentence:
									"The rule is removed. Changes it made stay in History.",
							},
						},
					]),
		],
	});

	const rules = orpc.cleanup.list.read();
	const addRule = {
		icon: "Plus" as const,
		label: "Add a rule",
		sheet: sheetOf({
			title: "Add a rule",
			form: {
				act: orpc.cleanup.save,
				fields: RULE_FIELDS,
				submit: { label: "Add", done: "Rule added" },
			},
		}),
	};
	return (
		<Pane
			title="Rules"
			back={false}
			wide
			acts={[
				{
					icon: "Eye",
					label: "Preview on the library",
					onAct: () => orpc.cleanup.preview.call(),
					done: "Previewing the rules",
				},
			]}
			foot={
				<PreviewFoot
					kind="rules"
					changes={(result) => result.tracks ?? 0}
					apply={{
						label: "Apply to the library",
						confirm: {
							title: "Apply the rules?",
							sentence:
								"The tags in the preview are rewritten in the library and in each file. Undo the batch in History.",
						},
						onAct: () => queuedBatch(apply.mutateAsync(), "Applying the rules"),
					}}
				/>
			}
		>
			<Section
				title="Rules"
				description="Switched-on rules run in this order, on demand here or over chosen tracks in the library."
				items={rules.at((rows) => rows.map(toRow))}
				act={addRule}
				empty={{
					sentence:
						"No rules yet. A rule rewrites tags the same way every time.",
					act: addRule,
				}}
			/>
			<PreviewSection
				kind="rules"
				title="Preview"
				none="Preview the rules to see what they would change in the library."
				words={(result) =>
					result.rules === 0
						? "No rule is switched on."
						: result.tracks === 0
							? `The rules change nothing in ${count(result.scanned ?? 0)} tracks.`
							: `${count(result.tracks ?? 0)} tracks would change, ${count(result.fields ?? 0)} tags in all.`
				}
				changes={(result) => result.tracks ?? 0}
			/>
		</Pane>
	);
}
