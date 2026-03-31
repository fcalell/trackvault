import { Input } from "@repo/ui/components/input";
import type { Accessor } from "solid-js";
import { createEffect, createSignal, Show } from "solid-js";

export type EditingCell = { rowId: string; colId: string } | null;

export default function EditableCell(props: {
	value: string | number | null;
	onSave: (newValue: string) => void;
	type?: "text" | "number";
	placeholder?: string;
	rowId: string;
	colId: string;
	editingCell: Accessor<EditingCell>;
	setEditingCell: (cell: EditingCell) => void;
}) {
	const [localValue, setLocalValue] = createSignal("");
	let inputRef!: HTMLInputElement;

	const isEditing = () => {
		const cell = props.editingCell();
		return cell?.rowId === props.rowId && cell?.colId === props.colId;
	};

	createEffect(() => {
		if (isEditing()) {
			setLocalValue(props.value != null ? String(props.value) : "");
			queueMicrotask(() => {
				inputRef?.focus();
				inputRef?.select();
			});
		}
	});

	function startEditing() {
		props.setEditingCell({ rowId: props.rowId, colId: props.colId });
	}

	function save() {
		const newVal = localValue().trim();
		const oldVal = props.value != null ? String(props.value) : "";
		if (newVal !== oldVal) {
			props.onSave(newVal);
		}
		props.setEditingCell(null);
	}

	function cancel() {
		props.setEditingCell(null);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			save();
		} else if (e.key === "Escape") {
			e.preventDefault();
			cancel();
		}
	}

	return (
		<Show
			when={isEditing()}
			fallback={
				<button
					type="button"
					class="block max-w-[200px] cursor-text truncate border-none bg-transparent p-0 text-left text-inherit"
					onDblClick={startEditing}
					onKeyDown={(e) => {
						if (e.key === "Enter") startEditing();
					}}
				>
					<Show
						when={props.value != null && String(props.value) !== ""}
						fallback={
							<span class="italic text-muted-foreground">
								{props.placeholder ?? "--"}
							</span>
						}
					>
						{String(props.value)}
					</Show>
				</button>
			}
		>
			<Input
				ref={inputRef}
				type={props.type ?? "text"}
				value={localValue()}
				onInput={(e) => setLocalValue(e.currentTarget.value)}
				onKeyDown={handleKeyDown}
				onBlur={save}
				class="h-7 w-full min-w-[100px] px-1 py-0 text-sm"
			/>
		</Show>
	);
}
