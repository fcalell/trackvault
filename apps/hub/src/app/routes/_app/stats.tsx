import { BarChart } from "@fcalell/plugin-react-ui/components/bar-chart";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { Stats } from "@fcalell/plugin-react-ui/components/stats";
import { createFileRoute } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";

export const Route = createFileRoute("/_app/stats")({
	component: LibraryStats,
});

type Played = {
	id: string;
	title: string | null;
	artist: string | null;
	playCount: number;
	lastPlayedAt: number | null;
};

const playedRow = (each: Played): Row => ({
	key: each.id,
	leading: { icon: "Music" },
	title: each.title ?? "Untitled",
	facts: [each.artist ?? "Unknown artist"],
	trailing: { count: each.playCount },
	href: `/library/${each.id}`,
});

// The library at a glance: each panel is one aggregate on the hub, kept by library
// version.
function LibraryStats() {
	const totals = orpc.stats.totals.read();
	const formats = orpc.stats.formats.read();
	const genres = orpc.stats.genres.read();
	const bpm = orpc.stats.bpm.read();
	const keys = orpc.stats.keys.read();
	const added = orpc.stats.added.read();
	const played = orpc.stats.played.read();
	const freshness = orpc.stats.freshness.read();
	return (
		<Pane title="Stats" back={false}>
			<Stats
				items={[
					{ label: "Tracks", value: totals.at((each) => each.tracks) },
					{
						label: "Playing time",
						value: totals.at((each) => Math.round(each.durationMs / 3_600_000)),
						unit: "hours",
					},
					{
						label: "On disk",
						value: totals.at((each) => Math.round(each.size / 1e9)),
						unit: "GB",
					},
					{ label: "Artists", value: totals.at((each) => each.artists) },
					{
						label: "Never played",
						value: totals.at((each) => each.neverPlayed),
						href: "/library?neverPlayed=true",
					},
				]}
			/>
			<Section title="Tempo">
				<BarChart
					label="Tracks by tempo, bins of 5 BPM"
					items={bpm}
					bar={{
						key: (row) => String(row.bin),
						value: (row) => row.count,
						at: (row) => `${row.bin} BPM`,
					}}
					unit={{ one: "track", other: "tracks" }}
				/>
			</Section>
			<Section title="Keys">
				<BarChart
					label="Tracks by Camelot key"
					items={keys}
					bar={{
						key: (row) => row.key,
						value: (row) => row.count,
						label: (row) => row.key,
					}}
					unit={{ one: "track", other: "tracks" }}
				/>
			</Section>
			<Section title="Added">
				<BarChart
					label="Tracks added per month"
					items={added}
					bar={{
						key: (row) => row.month,
						value: (row) => row.count,
						at: (row) => row.month,
					}}
					unit={{ one: "track", other: "tracks" }}
				/>
			</Section>
			<Section title="Last played">
				<BarChart
					label="Tracks by when they were last played"
					items={freshness}
					bar={{
						key: (row) => row.bucket,
						value: (row) => row.count,
						label: (row) => row.bucket,
					}}
					unit={{ one: "track", other: "tracks" }}
				/>
			</Section>
			<Section
				title="Genres"
				items={genres.at((each) => [
					...each.top.map(
						(row): Row => ({
							key: row.genre,
							leading: { icon: "Music" },
							title: row.genre,
							trailing: { count: row.count },
							href: `/library?genre=${encodeURIComponent(row.genre)}`,
						}),
					),
					...(each.untagged > 0
						? [
								{
									key: "untagged",
									leading: { icon: "TriangleAlert" },
									title: "No genre",
									trailing: { count: each.untagged },
									href: "/library?issue=noGenre",
								} satisfies Row,
							]
						: []),
				])}
				empty={{ sentence: "Genres show here once tracks carry them." }}
			/>
			<Section
				title="Formats"
				items={formats.at((rows) =>
					rows.map(
						(row): Row => ({
							key: `${row.format}-${row.codec}`,
							leading: { icon: "FileAudio" },
							title: row.format.toUpperCase(),
							facts: [row.codec],
							trailing: { count: row.count },
						}),
					),
				)}
				empty={{ sentence: "Formats show here once the library is scanned." }}
			/>
			<Section
				title="Most played"
				items={played.at((each) => each.most.map(playedRow))}
				empty={{ sentence: "Plays arrive from Rekordbox." }}
			/>
			<Section
				title="Least played"
				items={played.at((each) => each.least.map(playedRow))}
				empty={{ sentence: "Plays arrive from Rekordbox." }}
			/>
		</Pane>
	);
}
