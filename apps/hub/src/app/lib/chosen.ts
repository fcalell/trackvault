import { useWindow } from "@fcalell/plugin-api/tanstack-query";
import type { ChosenCount, Picked } from "@fcalell/ui-core/descriptors";

type WindowRead = Parameters<typeof useWindow>[0];

/**
 * The selection bar of a Table that chooses over a window read: the `chosen`
 * count for the Pane foot's ActionBar (the ticked ids, or the query's rows less
 * those unticked, out of every row the query matches) and the reason its acts
 * are blocked while nothing is chosen.
 */
export function useChosen<Q>(
	read: WindowRead,
	picked: Picked<Q>,
	onPick: (picked: Picked<Q>) => void,
	query: Q,
	noun: string,
): { chosen: ChosenCount; blocked: string | undefined } {
	const total = useWindow(read)?.total ?? 0;
	const count =
		"ids" in picked
			? picked.ids.length
			: Math.max(0, total - picked.except.length);
	return {
		chosen: {
			count,
			of: total,
			noun,
			onAll: (all) => onPick(all ? { query, except: [] } : { ids: [] }),
		},
		blocked: count === 0 ? `Choose ${noun} first.` : undefined,
	};
}
