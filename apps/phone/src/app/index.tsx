import { Pane } from "@fcalell/plugin-native-ui/components/pane";
import { Section } from "@fcalell/plugin-native-ui/components/section";
import { Toolbar } from "@fcalell/plugin-native-ui/components/toolbar";
import { usePlayer } from "@fcalell/plugin-native-ui/lib/player";
import { useState } from "react";
import { orpc } from "../lib/api";
import { trackItems } from "../lib/rows";
import { wishAct } from "../lib/wish";

// The library is a window read: the phone pages it in with "Show more" and the
// hub's index answers each page in a few milliseconds even at 50k tracks.
export default function Library() {
	const [q, setQ] = useState("");
	const tracks = orpc.tracks.list.window({
		q: q.trim() || undefined,
		limit: 50,
	});
	const playing = usePlayer().track?.key;
	return (
		<Pane title="Library" back={false} acts={[wishAct]}>
			<Toolbar
				search={{ value: q, onChange: setQ, placeholder: "Artist, title, tag" }}
			/>
			<Section
				items={tracks.at((rows) => trackItems(tracks, rows, playing))}
				empty={{ sentence: "No track matches." }}
			/>
		</Pane>
	);
}
