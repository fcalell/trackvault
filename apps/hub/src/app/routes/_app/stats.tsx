import { BarChart } from "@fcalell/plugin-react-ui/components/bar-chart";
import { Pane } from "@fcalell/plugin-react-ui/components/pane";
import { type Row, Section } from "@fcalell/plugin-react-ui/components/section";
import { Stats } from "@fcalell/plugin-react-ui/components/stats";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouter } from "../../../../.stack/worker";
import { orpc } from "../../lib/api.ts";
import { count } from "../../ui/figures.ts";
import { trackRow } from "../../ui/track.ts";

export const Route = createFileRoute("/_app/stats")({
	component: LibraryStats,
});

type Played = AppRouter["stats"]["played"]["__output"]["most"][number];

const MINOR = "Minor (A)";
const MAJOR = "Major (B)";

// The wheel's 24 keys as its 12 numbers, each with its minor and major track counts.
const camelotBuckets = (rows: { key: string; count: number }[]) => {
	const counts = new Map(rows.map((row) => [row.key, row.count]));
	return Array.from({ length: 12 }, (_, at) => ({
		number: at + 1,
		minor: counts.get(`${at + 1}A`) ?? 0,
		major: counts.get(`${at + 1}B`) ?? 0,
	}));
};

const playedRow = (each: Played): Row =>
	trackRow(each, {
		key: each.id,
		leading: { icon: "Music" },
		trailing: { value: count(each.playCount) },
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
					label="Tracks by tempo in BPM, bins of 5"
					items={bpm}
					bar={{
						key: (row) => String(row.bin),
						value: (row) => row.count,
						label: (row) => String(row.bin),
					}}
					unit={{ one: "track", other: "tracks" }}
				/>
			</Section>
			<Section title="Keys">
				<BarChart
					label="Tracks by Camelot key, minor (A) and major (B)"
					items={keys.at(camelotBuckets)}
					keys={[MINOR, MAJOR]}
					bar={{
						key: (row) => String(row.number),
						value: (row) => row.minor + row.major,
						parts: (row) => ({ [MINOR]: row.minor, [MAJOR]: row.major }),
						label: (row) => String(row.number),
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
							trailing: { value: count(row.count) },
							href: `/library?genre=${encodeURIComponent(row.genre)}`,
						}),
					),
					...(each.untagged > 0
						? [
								{
									key: "untagged",
									leading: { icon: "TriangleAlert" },
									title: "No genre",
									trailing: { value: count(each.untagged) },
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
							trailing: { value: count(row.count) },
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
