import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Picked } from "@fcalell/ui-core/descriptors";
import { skipToken } from "@tanstack/react-query";
import { useMemo } from "react";
import type { LibraryQuery } from "../../server/lib/library-query.ts";
import { EDIT_LABELS } from "../../shared/patch.ts";
import { orpc } from "./api.ts";
import { STORED_CHANGE_COLUMNS, STORED_CHANGE_ROW } from "./changes.ts";
import { useDebounced } from "./debounced.ts";

// What the Edit tags form has made: its own input, as the form's `onChange` hears it.
export type EditInput = Partial<Parameters<typeof orpc.bulk.edit.call>[0]>;

// The form's fields: a line per tag (empty keeps it, a dash clears it) and the custom
// tags to add or take off, picked from the ones there are.
export function useEditFields() {
	const everyTag = orpc.tags.list.read();
	const names = everyTag.at((rows) =>
		rows.map((row) => ({ value: row.name, label: row.name })),
	);
	const line = (key: keyof typeof EDIT_LABELS) => ({
		label: EDIT_LABELS[key],
		description: "Keep as is when empty.",
	});
	return {
		artist: line("artist"),
		albumArtist: line("albumArtist"),
		album: line("album"),
		genre: line("genre"),
		label: line("label"),
		year: line("year"),
		key: line("key"),
		energy: line("energy"),
		rating: line("rating"),
		comment: line("comment"),
		addTags: { label: EDIT_LABELS.addTags, options: names },
		removeTags: { label: EDIT_LABELS.removeTags, options: names },
	};
}

// What the form would do to the first tracks chosen, as rows of before and after: read
// from the form's own input once the typing pauses. Nothing is written.
export function EditPreview({
	picked,
	edit,
}: {
	picked: Picked<LibraryQuery>;
	edit: EditInput | undefined;
}) {
	const settled = useDebounced(JSON.stringify(edit ?? null), 250);
	const input = useMemo(
		() => (JSON.parse(settled) as EditInput | null) ?? undefined,
		[settled],
	);
	const preview = orpc.bulk.preview.read(
		!input || ("ids" in picked && picked.ids.length === 0)
			? skipToken
			: { ...input, tracks: picked },
	);
	return (
		<Section
			title="What changes"
			description={preview.at(
				(each) =>
					`${each.touched} of the first ${each.sampled} tracks change; ${each.total} chosen.`,
			)}
			read={preview}
		>
			<Table
				label="Changes"
				items={preview.at((each) => each.changes)}
				columns={STORED_CHANGE_COLUMNS}
				row={STORED_CHANGE_ROW}
				empty={{
					sentence: "The edit changes none of the first tracks chosen.",
				}}
			/>
		</Section>
	);
}
