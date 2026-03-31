import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/toast";
import { createDialog } from "@repo/ui/lib/create-dialog";
import { useNavigate } from "@tanstack/solid-router";
import { FolderSync, Pencil, Trash2, XCircle } from "lucide-solid";
import { Show } from "solid-js";
import { orpc } from "#lib/api";
import { useMutation, useQueryClient } from "#lib/query";

function DeleteConfirmContent(
	props: { count: number },
	close: (result?: boolean) => void,
) {
	return (
		<div class="flex flex-col gap-4 border border-border bg-card p-6">
			<h3 class="text-sm font-bold uppercase tracking-widest">
				Delete {props.count} track{props.count > 1 ? "s" : ""}?
			</h3>
			<p class="text-sm text-muted-foreground">
				This will permanently delete the selected files from disk and remove
				them from the library. This action cannot be undone.
			</p>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onClick={() => close(undefined)}>
					Cancel
				</Button>
				<Button variant="destructive" onClick={() => close(true)}>
					Delete
				</Button>
			</div>
		</div>
	);
}

export default function FloatingActionBar(props: {
	selectedIds: string[];
	onDeselect: () => void;
	onBulkEditOpen: () => void;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const batchDelete = useMutation(() =>
		orpc.library.batchDelete.mutationOptions(),
	);

	const confirmDelete = createDialog<{ count: number }, boolean>(
		(dialogProps, close) => DeleteConfirmContent(dialogProps, close),
	);

	async function handleDelete() {
		const confirmed = await confirmDelete.open({
			count: props.selectedIds.length,
		});
		if (!confirmed) return;

		try {
			const result = await batchDelete.mutateAsync({ ids: props.selectedIds });
			await queryClient.invalidateQueries({
				queryKey: orpc.library.scan.queryOptions({}).queryKey,
			});
			toast.success(`Deleted ${result.deleted} tracks`);
			if (result.errors.length > 0) {
				toast.error(`${result.errors.length} tracks failed to delete`);
			}
			props.onDeselect();
		} catch {
			toast.error("Failed to delete tracks");
		}
	}

	return (
		<>
			<confirmDelete.Component />
			<Show when={props.selectedIds.length > 0}>
				<div class="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 border-2 border-border bg-card px-4 py-2.5 shadow-[0_8px_32px_oklch(0_0_0/0.6)]">
					<span class="text-sm font-bold text-primary">
						{props.selectedIds.length} selected
					</span>

					<div class="mx-1 h-5 w-px bg-border" />

					<Button variant="ghost" size="sm" onClick={props.onBulkEditOpen}>
						<Pencil />
						Edit Tags
					</Button>
					<Button variant="ghost" size="sm" onClick={handleDelete}>
						<Trash2 />
						Delete
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => navigate({ to: "/quality/file-organizer" })}
					>
						<FolderSync />
						Organize
					</Button>

					<div class="mx-1 h-5 w-px bg-border" />

					<Button variant="ghost" size="sm" onClick={props.onDeselect}>
						<XCircle />
						Deselect
					</Button>
				</div>
			</Show>
		</>
	);
}
