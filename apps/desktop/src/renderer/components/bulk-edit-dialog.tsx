import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/toast";
import { createSignal, Show } from "solid-js";
import { orpc } from "#lib/api";
import { useMutation, useQueryClient } from "#lib/query";

const FIELDS = [
	{ key: "artist", label: "Artist", type: "text" },
	{ key: "album", label: "Album", type: "text" },
	{ key: "genre", label: "Genre", type: "text" },
	{ key: "year", label: "Year", type: "number" },
	{ key: "comment", label: "Comment", type: "text" },
] as const;

export default function BulkEditDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedIds: string[];
	onSuccess: () => void;
}) {
	const queryClient = useQueryClient();

	const [enabled, setEnabled] = createSignal<Record<string, boolean>>({});
	const [values, setValues] = createSignal<Record<string, string>>({});

	const batchUpdate = useMutation(() =>
		orpc.library.batchUpdate.mutationOptions(),
	);

	function toggleField(key: string, checked: boolean) {
		setEnabled((prev) => ({ ...prev, [key]: checked }));
	}

	function setValue(key: string, value: string) {
		setValues((prev) => ({ ...prev, [key]: value }));
	}

	function resetForm() {
		setEnabled({});
		setValues({});
	}

	async function handleApply() {
		const fields: Record<string, unknown> = {};
		const en = enabled();
		const vals = values();

		for (const f of FIELDS) {
			if (en[f.key]) {
				if (f.type === "number") {
					const num = Number.parseInt(vals[f.key] ?? "", 10);
					if (!Number.isNaN(num)) fields[f.key] = num;
				} else {
					fields[f.key] = vals[f.key] ?? "";
				}
			}
		}

		if (Object.keys(fields).length === 0) {
			toast.error("No fields selected");
			return;
		}

		try {
			await batchUpdate.mutateAsync({ ids: props.selectedIds, fields });
			await queryClient.invalidateQueries({
				queryKey: orpc.library.scan.queryOptions({}).queryKey,
			});
			toast.success(`Updated ${props.selectedIds.length} tracks`);
			resetForm();
			props.onSuccess();
			props.onOpenChange(false);
		} catch {
			toast.error("Failed to update tracks");
		}
	}

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="max-w-md">
				<DialogHeader>
					<DialogTitle>
						Edit Tags &mdash; {props.selectedIds.length} tracks selected
					</DialogTitle>
					<DialogDescription>
						Title is not bulk-editable. Check the fields you want to update.
					</DialogDescription>
				</DialogHeader>

				<div class="flex flex-col gap-4 py-2">
					{FIELDS.map((f) => (
						<div class="flex items-center gap-3">
							<Checkbox
								checked={enabled()[f.key] ?? false}
								onChange={(checked) => toggleField(f.key, checked)}
								class="shrink-0"
							/>
							<div class="flex flex-1 flex-col gap-1">
								<Label>{f.label}</Label>
								<Input
									type={f.type}
									value={values()[f.key] ?? ""}
									onInput={(e) => setValue(f.key, e.currentTarget.value)}
									disabled={!enabled()[f.key]}
									placeholder={f.label}
								/>
							</div>
						</div>
					))}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => props.onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleApply} disabled={batchUpdate.isPending}>
						<Show
							when={batchUpdate.isPending}
							fallback={`Apply to ${props.selectedIds.length}`}
						>
							Applying...
						</Show>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
