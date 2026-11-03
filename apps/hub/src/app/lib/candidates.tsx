import { useMutation } from "@fcalell/plugin-api/tanstack-query";
import { Table } from "@fcalell/plugin-react-ui/components/table";
import type { StatusMark, TableColumn } from "@fcalell/ui-core/descriptors";
import type { AppRouter } from "../../../.stack/worker";
import { MATCH, TRANSFER_STATE } from "../ui/acquire.ts";
import { duration, size } from "../ui/figures.ts";
import { trackTitle } from "../ui/track.ts";
import { orpc } from "./api.ts";

type Candidate = AppRouter["soulseek"]["results"]["__output"]["data"][number];

const kind = (c: Candidate): string => {
	const base = c.format.toUpperCase();
	if (c.bitDepth && c.sampleRate)
		return `${base} ${c.bitDepth} bit ${Math.round(c.sampleRate / 100) / 10} kHz`;
	return c.bitrate ? `${base} ${c.bitrate}` : base;
};

// A candidate whose artist and title are known can be wanted whatever its file.
function wishEntry(
	c: Candidate,
	add: (want: { artist: string; title: string }) => Promise<unknown>,
) {
	const { artist, title } = c;
	if (!artist || !title) return [];
	return [
		{
			label: "Add to the wishlist",
			onAct: () => add({ artist, title }),
			done: "Added to the wishlist",
		},
	];
}

const asked = (c: Candidate): boolean =>
	c.download !== null && c.download !== "failed" && c.download !== "cancelled";

// Where the candidate stands: the download once asked for, else the ranking's call.
const standing = (c: Candidate): StatusMark | null =>
	c.download
		? (TRANSFER_STATE[c.download] ?? null)
		: c.rejected
			? { tone: "idle", label: "Rejected" }
			: c.recommended
				? { tone: "active", label: "Recommended" }
				: null;

const COLUMNS: TableColumn<Candidate>[] = [
	{
		key: "title",
		label: "Title",
		cell: (c) => trackTitle({ title: c.title ?? c.name }),
	},
	{ key: "artist", label: "Artist", cell: (c) => c.artist },
	{ key: "standing", label: "State", kind: "status", cell: standing },
	{
		key: "score",
		label: "Score",
		kind: "number",
		cell: (c) => Math.round(c.score),
	},
	{ key: "quality", label: "Quality", cell: kind },
	{
		key: "time",
		label: "Time",
		kind: "number",
		cell: (c) => duration(c.lengthSec ? c.lengthSec * 1000 : null),
	},
	{ key: "size", label: "Size", cell: (c) => size(c.size) },
	{
		key: "library",
		label: "Library",
		kind: "chip",
		family: "green",
		cell: (c) => (c.have === "none" ? null : MATCH[c.have]),
	},
	{ key: "peer", label: "Peer", cell: (c) => c.username },
	{
		key: "queue",
		label: "Queue",
		cell: (c) => (c.freeSlot ? "Free slot" : `${c.queueLength} ahead`),
	},
	{ key: "folder", label: "Folder", cell: (c) => c.folder },
	{
		key: "why",
		label: "Why",
		wrap: true,
		cell: (c) => c.reasons.join("; "),
	},
];

// The candidates of a search (or of a wishlist item's last search), best first: the ranking's
// call, quality, length and size, what the library already has, the peer, and the
// ranking's reasons. Download asks the peer through slskd; the file lands in the inbox.
export function Candidates({
	searchId,
	wantId,
}: {
	searchId: string;
	wantId?: number;
}) {
	const download = useMutation(orpc.soulseek.download.mutationOptions());
	const want = useMutation(orpc.wishlist.add.mutationOptions());
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
					asked(c)
						? {
								icon: "ArrowRight",
								label: `Open ${c.name} in Downloads`,
								href: "/downloads",
							}
						: c.rejected
							? undefined
							: {
									icon: "Download",
									label: `Download ${c.name}`,
									onAct: () => ask(c),
									done: "Asked the peer",
								},
				more: (c) => [
					...(c.rejected && !asked(c)
						? [
								{
									label: "Download anyway",
									onAct: () => ask(c),
									done: "Asked the peer",
									confirm: {
										title: "Download a rejected file?",
										sentence:
											c.reasons.find((why) => why.startsWith("rejected: ")) ??
											"The ranking turned it down.",
									},
								},
							]
						: []),
					...(wantId === undefined ? wishEntry(c, want.mutateAsync) : []),
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
