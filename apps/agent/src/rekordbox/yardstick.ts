import { writeFile } from "node:fs/promises";
import {
	findRekordboxInstall,
	openSnapshot,
	readCollection,
} from "@trackvault/core/rekordbox";
import type { State } from "../state.ts";

// BPM and key Rekordbox holds, for the tracks linked to hub tracks. It is a benchmark
// input for the hub's `bench-yardstick` script (Essentia against Rekordbox) and is never
// imported: TrackVault does not own these fields. Key notation is the install's setting.
export interface Yardstick {
	v: 1;
	at: string;
	tracks: Array<{ trackId: string; bpm: number | null; key: string | null }>;
}

export async function writeYardstick(
	state: State,
	out: string,
): Promise<{ linked: number; written: number }> {
	const install = await findRekordboxInstall();
	if (!install) throw new Error("Rekordbox is not installed on this machine");
	const open = await openSnapshot(install.dbPath);
	try {
		const links = new Map(state.links().map((l) => [l.contentId, l.trackId]));
		const tracks: Yardstick["tracks"] = [];
		for (const t of readCollection(open.db)) {
			const trackId = links.get(t.id);
			if (trackId && (t.bpm !== null || t.key !== null))
				tracks.push({ trackId, bpm: t.bpm, key: t.key });
		}
		const body: Yardstick = { v: 1, at: new Date().toISOString(), tracks };
		await writeFile(out, JSON.stringify(body));
		return { linked: links.size, written: tracks.length };
	} finally {
		await open.close();
	}
}
