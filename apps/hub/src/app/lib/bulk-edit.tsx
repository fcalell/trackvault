import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { Input } from "@fcalell/plugin-react-ui/components/input";
import { Picker } from "@fcalell/plugin-react-ui/components/picker";
import { Section } from "@fcalell/plugin-react-ui/components/section";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { Picked } from "@fcalell/ui-core/descriptors";
import { skipToken } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { LibraryQuery } from "../../server/lib/library-query.ts";
import { orpc } from "./api.ts";
import { CHANGE_COLUMNS, CHANGE_ROW } from "./changes.ts";
import { useDebounced } from "./debounced.ts";

// What the sheet has typed: text per tag. Empty keeps the tag, "-" clears it.
export interface EditDraft {
	text: Record<string, string>;
	addTags: number[];
	removeTags: number[];
}

export const EMPTY_DRAFT: EditDraft = { text: {}, addTags: [], removeTags: [] };

const TEXT_FIELDS = [
	["artist", "Artist"],
	["albumArtist", "Album artist"],
	["album", "Album"],
	["genre", "Genre"],
	["label", "Label"],
	["year", "Year"],
	["key", "Key"],
	["energy", "Energy"],
	["rating", "Rating"],
	["comment", "Comment"],
] as const;

const NUMBERS = new Set(["year", "energy", "rating"]);

// The patch the typed text means: a number where the tag is one, null for "-".
export function patchOf(text: Record<string, string>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(text)) {
		const value = raw.trim();
		if (value === "") continue;
		if (value === "-") patch[key] = null;
		else if (NUMBERS.has(key)) {
			const n = Number(value);
			if (Number.isFinite(n)) patch[key] = Math.round(n);
		} else patch[key] = value;
	}
	return patch;
}

// The body of the Edit tags sheet: the tags to set, the custom tags to add or take
// off, and a live preview table of what that does to the first tracks chosen.
export function BulkEditFields({
	picked,
	draft,
}: {
	picked: Picked<LibraryQuery>;
	draft: { current: EditDraft };
}) {
	const [text, setText] = useState<Record<string, string>>({});
	const [addTags, setAddTags] = useState<string[]>([]);
	const [removeTags, setRemoveTags] = useState<string[]>([]);
	const everyTag = orpc.tags.list.read();
	const known = useRead(everyTag);
	const idOf = useMemo(
		() => new Map((known ?? []).map((row) => [row.name, row.id])),
		[known],
	);
	const added = addTags.flatMap((name) => idOf.get(name) ?? []);
	const removed = removeTags.flatMap((name) => idOf.get(name) ?? []);
	useEffect(() => {
		draft.current = { text, addTags: added, removeTags: removed };
	});

	const settled = useDebounced(
		JSON.stringify({ text, addTags: added, removeTags: removed }),
		250,
	);
	const input = useMemo(() => {
		const typed = JSON.parse(settled) as EditDraft;
		return {
			tracks: picked,
			patch: patchOf(typed.text),
			addTags: typed.addTags,
			removeTags: typed.removeTags,
		};
	}, [settled, picked]);
	const preview = orpc.bulk.preview.read(
		"ids" in picked && picked.ids.length === 0 ? skipToken : input,
	);

	return (
		<>
			{TEXT_FIELDS.map(([key, label]) => (
				<Input
					key={key}
					label={label}
					value={text[key] ?? ""}
					placeholder="Keep as is"
					onChange={(value) => setText((was) => ({ ...was, [key]: value }))}
				/>
			))}
			<Picker
				fit="list"
				label="Add tags"
				items={everyTag}
				option={{ value: (row) => row.name, label: (row) => row.name }}
				value={addTags}
				onChange={setAddTags}
			/>
			<Picker
				fit="list"
				label="Take off tags"
				items={everyTag}
				option={{ value: (row) => row.name, label: (row) => row.name }}
				value={removeTags}
				onChange={setRemoveTags}
			/>
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
					items={preview.at((each) =>
						each.changes.map((row) => ({ ...row, id: row.key })),
					)}
					columns={CHANGE_COLUMNS}
					row={CHANGE_ROW}
				/>
			</Section>
		</>
	);
}
