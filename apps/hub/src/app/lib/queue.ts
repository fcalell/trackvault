import type { ListRow } from "../../shared/library.ts";

// The rows the library list has loaded, in the list's order: what the player walks
// with Next and Previous when a track plays from the record opened from that list.
let loaded: readonly ListRow[] = [];

export function setQueueSource(rows: readonly ListRow[]): void {
	loaded = rows;
}

const QUEUE_LENGTH = 200;

// The track and those after it in the list, or the track alone when the list does
// not hold it (a link opened directly).
export function queueFrom(id: string): ListRow[] {
	const at = loaded.findIndex((row) => row.id === id);
	return at < 0 ? [] : loaded.slice(at, at + QUEUE_LENGTH);
}
