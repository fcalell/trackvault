import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import type { RowItem } from "@fcalell/plugin-native-ui/components/section";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { orpc } from "../lib/api";
import type { TreeRow } from "../lib/types";

// The hub answers the tree flat; the phone nests it by `parentId`.
function nest(rows: readonly TreeRow[], parent: string | null): RowItem[] {
	return rows
		.filter((r) => r.parentId === parent)
		.map((r) => {
			const children = r.kind === "folder" ? nest(rows, r.id) : undefined;
			return {
				key: r.id,
				title: r.name,
				leading: {
					icon:
						r.kind === "folder" ? ("Folder" as const) : ("ListMusic" as const),
				},
				trailing: r.kind === "folder" ? undefined : { count: r.tracks },
				meta: r.kind === "smart" ? ["Smart"] : undefined,
				href: r.kind === "folder" ? undefined : (`/playlist/${r.id}` as const),
				children,
			};
		});
}

export default function Playlists() {
	const tree = orpc.playlists.tree.read();
	return (
		<Pane title="Playlists" back={false}>
			<Section
				items={tree.at((rows) => nest(rows, null))}
				empty={{ sentence: "No playlist yet. Make one in the hub." }}
			/>
		</Pane>
	);
}
