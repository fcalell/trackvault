import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { Toolbar } from "@fcalell/plugin-native-ui/components/toolbar";
import { useState } from "react";
import { orpc } from "../lib/api";
import { duration, trackMeta } from "../lib/format";
import { WishSheet } from "../lib/wish";

// The library is a window read: the phone pages it in with "Show more" and the
// hub's index answers each page in a few milliseconds even at 50k tracks.
export default function Library() {
	const [q, setQ] = useState("");
	const tracks = orpc.tracks.list.window({
		q: q.trim() || undefined,
		limit: 50,
	});
	const [wishing, setWishing] = useState(false);
	return (
		<Pane
			title="Library"
			back={false}
			actions={[
				{
					icon: "Plus",
					label: "Heard in a club",
					onAct: () => setWishing(true),
				},
			]}
		>
			<Toolbar
				search={{ value: q, onChange: setQ, placeholder: "Artist, title, tag" }}
			/>
			<Section
				items={tracks.at((rows) =>
					rows.map((t) => ({
						key: t.id,
						title: t.title ?? "Untitled",
						meta: trackMeta(t),
						trailing: { value: duration(t.durationMs) },
						href: `/track/${t.id}` as const,
					})),
				)}
				empty={{ sentence: "No track matches." }}
			/>
			<WishSheet open={wishing} onClose={() => setWishing(false)} />
		</Pane>
	);
}
