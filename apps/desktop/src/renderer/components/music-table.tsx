import { LOW_BITRATE_THRESHOLD } from "@repo/constants/audio";
import type { TrackWithFile } from "@repo/schema/library";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/toast";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import {
	type ColumnDef,
	createSolidTable,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	type VisibilityState,
} from "@tanstack/solid-table";
import { ArrowUpDown, Check, Columns3, Play } from "lucide-solid";
import { type Accessor, createSignal, For, Show } from "solid-js";
import EditableCell, { type EditingCell } from "#components/editable-cell";
import { orpc } from "#lib/api";
import { playerStore } from "#lib/player";
import { useMutation, useQueryClient } from "#lib/query";

function GenreBadges(props: { genre: string }) {
	return (
		<div class="flex flex-wrap gap-1">
			<For each={props.genre.split(",")}>
				{(g) => <Badge variant="secondary">{g.trim()}</Badge>}
			</For>
		</div>
	);
}

function formatDuration(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function SortableHeader(props: {
	label: string;
	column: {
		toggleSorting: (desc: boolean) => void;
		getIsSorted: () => false | "asc" | "desc";
	};
}) {
	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={() =>
				props.column.toggleSorting(props.column.getIsSorted() === "asc")
			}
		>
			{props.label}
			<ArrowUpDown />
		</Button>
	);
}

function createColumns(
	editingCell: Accessor<EditingCell>,
	setEditingCell: (cell: EditingCell) => void,
	onCellSave: (trackId: string, field: string, value: string) => void,
): ColumnDef<TrackWithFile>[] {
	return [
		{
			id: "select",
			header: ({ table }) => (
				<Checkbox
					checked={table.getIsAllPageRowsSelected()}
					indeterminate={table.getIsSomePageRowsSelected()}
					onChange={(checked) => table.toggleAllPageRowsSelected(!!checked)}
					aria-label="Select all"
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					checked={row.getIsSelected()}
					onChange={(checked) => row.toggleSelected(!!checked)}
					aria-label="Select row"
				/>
			),
			enableSorting: false,
			enableHiding: false,
			size: 40,
		},
		{
			accessorKey: "title",
			header: ({ column }) => <SortableHeader label="Title" column={column} />,
			cell: (info) => (
				<EditableCell
					value={info.getValue() as string | null}
					rowId={info.row.id}
					colId="title"
					editingCell={editingCell}
					setEditingCell={setEditingCell}
					onSave={(v) => onCellSave(info.row.original.id, "title", v)}
				/>
			),
		},
		{
			accessorKey: "artist",
			header: ({ column }) => <SortableHeader label="Artist" column={column} />,
			cell: (info) => (
				<EditableCell
					value={info.getValue() as string | null}
					rowId={info.row.id}
					colId="artist"
					editingCell={editingCell}
					setEditingCell={setEditingCell}
					onSave={(v) => onCellSave(info.row.original.id, "artist", v)}
				/>
			),
		},
		{
			accessorKey: "album",
			header: ({ column }) => <SortableHeader label="Album" column={column} />,
			cell: (info) => (
				<EditableCell
					value={info.getValue() as string | null}
					rowId={info.row.id}
					colId="album"
					editingCell={editingCell}
					setEditingCell={setEditingCell}
					onSave={(v) => onCellSave(info.row.original.id, "album", v)}
				/>
			),
		},
		{
			accessorKey: "genre",
			header: "Genre",
			cell: (info) => {
				const genre = info.getValue() as string | null;
				const isEditingGenre = () =>
					editingCell()?.rowId === info.row.id &&
					editingCell()?.colId === "genre";
				return (
					<Show
						when={isEditingGenre()}
						fallback={
							<button
								type="button"
								class="block max-w-[200px] cursor-text border-none bg-transparent p-0 text-left text-inherit"
								onDblClick={() =>
									setEditingCell({
										rowId: info.row.id,
										colId: "genre",
									})
								}
								onKeyDown={(e) => {
									if (e.key === "Enter")
										setEditingCell({
											rowId: info.row.id,
											colId: "genre",
										});
								}}
							>
								<Show
									when={genre}
									fallback={
										<span class="italic text-muted-foreground">--</span>
									}
								>
									{(g) => <GenreBadges genre={g()} />}
								</Show>
							</button>
						}
					>
						<EditableCell
							value={genre}
							rowId={info.row.id}
							colId="genre"
							editingCell={editingCell}
							setEditingCell={setEditingCell}
							onSave={(v) => onCellSave(info.row.original.id, "genre", v)}
						/>
					</Show>
				);
			},
		},
		{
			accessorKey: "year",
			header: ({ column }) => <SortableHeader label="Year" column={column} />,
			cell: (info) => (
				<EditableCell
					value={info.getValue() as number | null}
					type="number"
					rowId={info.row.id}
					colId="year"
					editingCell={editingCell}
					setEditingCell={setEditingCell}
					onSave={(v) => onCellSave(info.row.original.id, "year", v)}
				/>
			),
		},
		{
			accessorKey: "duration",
			header: "Duration",
			cell: (info) => {
				const d = info.getValue() as number | null;
				return (
					<Show
						when={d}
						fallback={<span class="italic text-muted-foreground">--</span>}
					>
						{(v) => <span>{formatDuration(v())}</span>}
					</Show>
				);
			},
			enableHiding: true,
		},
		{
			accessorKey: "bitrate",
			header: ({ column }) => (
				<SortableHeader label="Bitrate" column={column} />
			),
			cell: (info) => {
				const b = info.getValue() as number | null;
				return (
					<Show
						when={b}
						fallback={<span class="italic text-muted-foreground">--</span>}
					>
						{(v) => (
							<span
								class={v() < LOW_BITRATE_THRESHOLD ? "text-destructive" : ""}
							>
								{v()} kbps
							</span>
						)}
					</Show>
				);
			},
			enableHiding: true,
		},
		{
			accessorKey: "filename",
			header: "Filename",
			cell: (info) => (
				<Tooltip>
					<TooltipTrigger as="div" class="max-w-[200px] truncate">
						{(info.getValue() as string) ?? ""}
					</TooltipTrigger>
					<TooltipContent>{(info.getValue() as string) ?? ""}</TooltipContent>
				</Tooltip>
			),
			enableHiding: true,
		},
		{
			accessorKey: "comment",
			header: "Comment",
			cell: (info) => (
				<EditableCell
					value={info.getValue() as string | null}
					rowId={info.row.id}
					colId="comment"
					editingCell={editingCell}
					setEditingCell={setEditingCell}
					onSave={(v) => onCellSave(info.row.original.id, "comment", v)}
				/>
			),
			enableHiding: true,
		},
		{
			id: "actions",
			cell: (info) => {
				const file = info.row.original;
				return (
					<div class="flex gap-1">
						<Button
							variant="ghost"
							size="icon"
							onClick={(e: MouseEvent) => {
								e.stopPropagation();
								playerStore.play({
									title: file.title ?? "",
									artist: file.artist ?? "",
									audioSrc: file.filepath ?? "",
								});
							}}
							aria-label={`Play ${file.title ?? file.filename}`}
						>
							<Play />
						</Button>
					</div>
				);
			},
			enableHiding: false,
		},
	];
}

const HIDEABLE_COLUMNS = [
	{ id: "title", label: "Title" },
	{ id: "artist", label: "Artist" },
	{ id: "album", label: "Album" },
	{ id: "genre", label: "Genre" },
	{ id: "year", label: "Year" },
	{ id: "duration", label: "Duration" },
	{ id: "bitrate", label: "Bitrate" },
	{ id: "filename", label: "Filename" },
	{ id: "comment", label: "Comment" },
];

export default function MusicTable(props: {
	data: TrackWithFile[];
	searchable?: boolean;
	onRowClick?: (track: TrackWithFile) => void;
	selectedRowIds?: Accessor<RowSelectionState>;
	onRowSelectionChange?: (state: RowSelectionState) => void;
}) {
	const queryClient = useQueryClient();
	const [sorting, setSorting] = createSignal<SortingState>([]);
	const [globalFilter, setGlobalFilter] = createSignal("");
	const [columnVisibility, setColumnVisibility] = createSignal<VisibilityState>(
		{
			year: false,
			filename: false,
			comment: false,
			duration: false,
		},
	);
	const [editingCell, setEditingCell] = createSignal<EditingCell>(null);

	const [internalRowSelection, setInternalRowSelection] =
		createSignal<RowSelectionState>({});
	const rowSelection = () =>
		props.selectedRowIds ? props.selectedRowIds() : internalRowSelection();
	const setRowSelection = (
		updater:
			| RowSelectionState
			| ((old: RowSelectionState) => RowSelectionState),
	) => {
		const newState =
			typeof updater === "function" ? updater(rowSelection()) : updater;
		if (props.onRowSelectionChange) {
			props.onRowSelectionChange(newState);
		} else {
			setInternalRowSelection(newState);
		}
	};

	const updateMutation = useMutation(() =>
		orpc.library.update.mutationOptions(),
	);

	function handleCellSave(trackId: string, field: string, value: string) {
		const fieldValue: Record<string, unknown> = {};
		if (field === "year") {
			const num = Number.parseInt(value, 10);
			fieldValue[field] = Number.isNaN(num) ? undefined : num;
		} else {
			fieldValue[field] = value;
		}

		queryClient.setQueryData(
			orpc.library.scan.queryOptions({}).queryKey,
			(old: { fileList: TrackWithFile[] } | undefined) => {
				if (!old) return old;
				return {
					...old,
					fileList: old.fileList.map((t) =>
						t.id === trackId
							? {
									...t,
									[field]:
										field === "year" ? (fieldValue[field] ?? null) : value,
								}
							: t,
					),
				};
			},
		);

		updateMutation.mutate(
			{ id: trackId, ...fieldValue },
			{
				onSuccess: () => toast.success("Updated"),
				onError: () => {
					toast.error("Failed to update");
					queryClient.invalidateQueries({
						queryKey: orpc.library.scan.queryOptions({}).queryKey,
					});
				},
			},
		);
	}

	const columns = createColumns(editingCell, setEditingCell, handleCellSave);

	const table = createSolidTable({
		get data() {
			return props.data;
		},
		columns,
		getRowId: (row) => row.id,
		state: {
			get sorting() {
				return sorting();
			},
			get globalFilter() {
				return globalFilter();
			},
			get columnVisibility() {
				return columnVisibility();
			},
			get rowSelection() {
				return rowSelection();
			},
		},
		enableRowSelection: true,
		onSortingChange: setSorting,
		onGlobalFilterChange: setGlobalFilter,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection as never,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
	});

	let debounceTimer: ReturnType<typeof setTimeout>;
	function handleSearch(value: string) {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => setGlobalFilter(value), 300);
	}

	function isCurrentlyPlaying(track: TrackWithFile) {
		const current = playerStore.currentTrack();
		return current?.audioSrc === track.filepath;
	}

	return (
		<div class="flex h-full flex-col gap-4">
			<div class="flex items-center justify-between">
				<Show when={props.searchable}>
					<Input
						placeholder="Search..."
						onInput={(e) => handleSearch(e.currentTarget.value)}
						class="max-w-sm"
					/>
				</Show>
				<div class="ml-auto flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger
							as={(triggerProps: Record<string, unknown>) => (
								<Button variant="outline" size="sm" {...triggerProps}>
									<Columns3 />
									Columns
								</Button>
							)}
						/>
						<DropdownMenuContent>
							<For each={HIDEABLE_COLUMNS}>
								{(col) => {
									const column = () => table.getColumn(col.id);
									return (
										<Show when={column()}>
											{(c) => (
												<DropdownMenuItem
													onSelect={() =>
														c().toggleVisibility(!c().getIsVisible())
													}
													closeOnSelect={false}
												>
													<Show when={c().getIsVisible()}>
														<Check class="size-4" />
													</Show>
													<Show when={!c().getIsVisible()}>
														<div class="size-4" />
													</Show>
													{col.label}
												</DropdownMenuItem>
											)}
										</Show>
									);
								}}
							</For>
						</DropdownMenuContent>
					</DropdownMenu>
					<span class="text-xs text-muted-foreground">
						{table.getFilteredRowModel().rows.length} tracks
					</span>
				</div>
			</div>

			<div class="min-h-0 flex-1 overflow-auto">
				<Table class="min-w-max">
					<TableHeader>
						<For each={table.getHeaderGroups()}>
							{(headerGroup) => (
								<TableRow>
									<For each={headerGroup.headers}>
										{(header) => (
											<TableHead>
												<Show when={!header.isPlaceholder}>
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
												</Show>
											</TableHead>
										)}
									</For>
								</TableRow>
							)}
						</For>
					</TableHeader>
					<TableBody>
						<For each={table.getRowModel().rows}>
							{(row) => {
								const isPlaying = () => isCurrentlyPlaying(row.original);
								const isSelected = () => row.getIsSelected();

								return (
									<TableRow
										class={
											isSelected()
												? "bg-[oklch(0.18_0.05_260)] shadow-[inset_2px_0_0_var(--color-primary)]"
												: isPlaying()
													? "bg-[oklch(0.17_0.03_260)]"
													: ""
										}
										onClick={() => props.onRowClick?.(row.original)}
										style={{
											cursor: props.onRowClick ? "pointer" : undefined,
										}}
									>
										<For each={row.getVisibleCells()}>
											{(cell) => (
												<TableCell
													onClick={
														cell.column.id === "select"
															? (e: MouseEvent) => e.stopPropagation()
															: undefined
													}
												>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</TableCell>
											)}
										</For>
									</TableRow>
								);
							}}
						</For>
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
