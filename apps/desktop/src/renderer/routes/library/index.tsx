import { LOW_BITRATE_THRESHOLD } from "@repo/constants/audio";
import type { TrackWithFile } from "@repo/schema/library";
import { QueryBoundary } from "@repo/ui/components/query-boundary";
import { createFileRoute } from "@tanstack/solid-router";
import type { RowSelectionState } from "@tanstack/solid-table";
import { createMemo, createSignal } from "solid-js";
import BulkEditDialog from "#components/bulk-edit-dialog";
import FloatingActionBar from "#components/floating-action-bar";
import MusicTable from "#components/music-table";
import TrackDetailPanel from "#components/track-detail-panel";
import { orpc } from "#lib/api";
import { useQuery } from "#lib/query";

type LibrarySearch = {
	facet?: string;
	value?: string;
	issue?: string;
};

export const Route = createFileRoute("/library/")({
	component: LibraryPage,
	validateSearch: (search: Record<string, unknown>): LibrarySearch => ({
		facet: typeof search.facet === "string" ? search.facet : undefined,
		value: typeof search.value === "string" ? search.value : undefined,
		issue: typeof search.issue === "string" ? search.issue : undefined,
	}),
});

function applyFilter(
	tracks: TrackWithFile[],
	facet: string | null,
	value: string | null,
	issue: string | null,
): TrackWithFile[] {
	if (facet && value) {
		return tracks.filter((t) => {
			const field = t[facet as keyof TrackWithFile];
			if (typeof field === "string") {
				return field.toLowerCase() === value.toLowerCase();
			}
			return false;
		});
	}
	if (issue) {
		switch (issue) {
			case "noArtist":
				return tracks.filter((t) => !t.artist);
			case "noGenre":
				return tracks.filter((t) => !t.genre);
			case "noAlbum":
				return tracks.filter((t) => !t.album);
			case "noYear":
				return tracks.filter((t) => !t.year);
			case "lowBitrate":
				return tracks.filter(
					(t) => t.bitrate != null && t.bitrate < LOW_BITRATE_THRESHOLD,
				);
			default:
				return tracks;
		}
	}
	return tracks;
}

function LibraryPage() {
	const library = useQuery(() => orpc.library.list.queryOptions({}));
	const search = Route.useSearch();

	const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});
	const [detailTrack, setDetailTrack] = createSignal<TrackWithFile | null>(
		null,
	);
	const [bulkEditOpen, setBulkEditOpen] = createSignal(false);

	const selectedIds = () => Object.keys(rowSelection());

	const filteredData = createMemo(() => {
		const data = library.data;
		if (!data) return [];
		return applyFilter(
			data,
			search().facet ?? null,
			search().value ?? null,
			search().issue ?? null,
		);
	});

	function handleDeselect() {
		setRowSelection({});
	}

	function handleRowClick(track: TrackWithFile) {
		setDetailTrack(track);
	}

	function handleBulkEditSuccess() {
		handleDeselect();
	}

	return (
		<QueryBoundary query={library} loadingText="loading library...">
			{() => (
				<div class="relative flex h-full">
					<div class="flex-1 overflow-hidden p-4">
						<MusicTable
							data={filteredData()}
							searchable
							onRowClick={handleRowClick}
							selectedRowIds={rowSelection}
							onRowSelectionChange={setRowSelection}
						/>
					</div>

					<TrackDetailPanel
						track={detailTrack()}
						onClose={() => setDetailTrack(null)}
					/>

					<FloatingActionBar
						selectedIds={selectedIds()}
						onDeselect={handleDeselect}
						onBulkEditOpen={() => setBulkEditOpen(true)}
					/>

					<BulkEditDialog
						open={bulkEditOpen()}
						onOpenChange={setBulkEditOpen}
						selectedIds={selectedIds()}
						onSuccess={handleBulkEditSuccess}
					/>
				</div>
			)}
		</QueryBoundary>
	);
}
