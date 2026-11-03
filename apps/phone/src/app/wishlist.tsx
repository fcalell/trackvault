import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import type { StatusMark } from "@fcalell/ui-core/descriptors";
import { orpc } from "../lib/api";
import type { WantRow } from "../lib/types";
import { wishAct } from "../lib/wish";

const STATUS: Record<WantRow["status"], StatusMark> = {
	wanted: { tone: "waiting", label: "Wanted" },
	searching: { tone: "running", label: "Searching" },
	found: { tone: "active", label: "Found" },
	downloading: { tone: "running", label: "Downloading" },
	downloaded: { tone: "done", label: "Downloaded" },
	"in-library": { tone: "done", label: "In library" },
	"gave-up": { tone: "idle", label: "Gave up" },
	ignored: { tone: "idle", label: "Ignored" },
};

export default function Wishlist() {
	const wants = orpc.wishlist.list.window({ limit: 50 });
	return (
		<Pane title="Wishlist" back="/more" acts={[wishAct]}>
			<Section
				items={wants.at((rows) =>
					rows.map((w) => ({
						key: String(w.id),
						title: `${w.artist} · ${w.title}${w.mixName ? ` (${w.mixName})` : ""}`,
						facts: [STATUS[w.status]],
						trailing: { age: w.createdAt.toISOString() },
					})),
				)}
				empty={{ sentence: "Nothing on the wishlist yet." }}
			/>
		</Pane>
	);
}
