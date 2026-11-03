import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { TableColumn } from "@fcalell/ui-core/descriptors";
import type { AppRouter } from "../../../.stack/worker";
import { HAVE_LABELS, megabytes, nameOf } from "../ui/acquire.ts";
import { clock } from "../ui/track.ts";
import { orpc } from "./api.ts";

type Candidate = AppRouter["soulseek"]["results"]["__output"]["data"][number];

const kind = (c: Candidate): string => {
	const base = c.format.toUpperCase();
	if (c.bitDepth && c.sampleRate)
		return `${base} ${c.bitDepth} bit ${Math.round(c.sampleRate / 100) / 10} kHz`;
	return c.bitrate ? `${base} ${c.bitrate}` : base;
};

const COLUMNS: TableColumn<Candidate>[] = [
	{
		key: "name",
		label: "File",
		cell: (c) =>
			nameOf({
				artist: c.artist,
				title: c.mix ? `${c.title ?? c.name} (${c.mix})` : (c.title ?? c.name),
			}) ?? c.name,
	},
	{
		key: "score",
		label: "Score",
		kind: "number",
		cell: (c) => Math.round(c.score),
	},
	{ key: "quality", label: "Quality", cell: kind },
	{
		key: "library",
		label: "Library",
		kind: "chip",
		family: "green",
		cell: (c) => (c.have === "none" ? null : (HAVE_LABELS[c.have] ?? null)),
	},
	{
		key: "peer",
		label: "Peer",
		cell: (c) =>
			`${c.username} · ${c.freeSlot ? "free slot" : `queue ${c.queueLength}`}`,
	},
	{
		key: "why",
		label: "Why",
		wrap: true,
		cell: (c) => c.reasons.join(" · "),
	},
	{ key: "size", label: "Size", hidden: true, cell: (c) => megabytes(c.size) },
	{
		key: "time",
		label: "Time",
		kind: "number",
		hidden: true,
		cell: (c) => clock(c.lengthSec ? c.lengthSec * 1000 : null),
	},
	{ key: "folder", label: "Folder", hidden: true, cell: (c) => c.folder },
];

// The candidates of a search (or of a want's last search), best first: score, quality,
// what the library already has, the peer, and the ranking's reasons. Download asks the
// peer through slskd; the file lands in the inbox.
export function Candidates({
	searchId,
	wantId,
}: {
	searchId: string;
	wantId?: number;
}) {
	const download = useMutation(orpc.soulseek.download.mutationOptions());
	const ask = (c: Candidate) =>
		download.mutateAsync({
			resultId: c.id,
			...(wantId !== undefined ? { wantId } : {}),
		});
	return (
		<Table
			label="Candidates"
			items={orpc.soulseek.results.window({ searchId })}
			columns={COLUMNS}
			row={{
				id: (c) => String(c.id),
				act: (c) =>
					c.rejected
						? undefined
						: {
								icon: "Download",
								label: `Download ${c.name}`,
								onAct: () => ask(c),
								done: "Asked the peer",
								...(c.download &&
								c.download !== "failed" &&
								c.download !== "cancelled"
									? { blocked: "Already asked for" }
									: {}),
							},
				more: (c) => [
					...(c.rejected
						? [
								{
									label: "Download anyway",
									onAct: () => ask(c),
									done: "Asked the peer",
									confirm: {
										title: "Download a rejected file?",
										sentence: c.reasons.at(-1) ?? "The ranking turned it down.",
									},
								},
							]
						: []),
					...(c.haveTrackId
						? [
								{
									label: "Open in the library",
									href: `/library/${c.haveTrackId}`,
								},
							]
						: []),
				],
			}}
		/>
	);
}
