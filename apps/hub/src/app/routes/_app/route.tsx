import { useRead } from "@fcalell/plugin-api/tanstack-query";
import { Dock } from "@fcalell/plugin-react-ui/components/dock";
import { Shell } from "@fcalell/plugin-react-ui/components/shell";
import {
	audioOutput,
	connectOutput,
} from "@fcalell/plugin-react-ui/lib/player";
import type { PlaceSpec } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { useJobEffects } from "../../lib/jobs-effects.ts";
import { useLibraryLive } from "../../lib/library-live.ts";
import { usePlaylistPlaces } from "../../lib/playlists.tsx";
import { NOTHING_WAITING } from "../../ui/attention.ts";

connectOutput(audioOutput());

// A session younger than this is not asked for again on the next navigation.
const SESSION_FRESH_MS = 10_000;

export const Route = createFileRoute("/_app")({
	beforeLoad: async ({ context }) => {
		const { queryClient } = context;
		const session = await queryClient.fetchQuery({
			...orpc.auth.session.queryOptions(),
			staleTime: SESSION_FRESH_MS,
		});
		if (!session) throw redirect({ to: "/sign-in" });
		// The owner's one personal organization, made on the first sign-in. The shell
		// does not wait on it: a failure here leaves the pages drawn, and the next
		// navigation tries again.
		try {
			const organizations = await queryClient.fetchQuery(
				orpc.auth.organization.list.queryOptions(),
			);
			if (organizations.length === 0)
				await orpc.auth.organization.create.call({ name: "TrackVault" });
		} catch {}
	},
	component: App,
});

// The sidebar, group by job. The Playlists group joins from the data, and Set builder
// stands at its end; the places with work waiting carry a count.
const place = (
	label: string,
	icon: PlaceSpec["icon"],
	route: string,
	group: string,
	waiting = 0,
): PlaceSpec => ({
	label,
	icon,
	route,
	group,
	...(waiting > 0 ? { count: waiting } : {}),
});

function App() {
	useLibraryLive();
	useJobEffects();
	const playlists = usePlaylistPlaces();
	const waiting =
		useRead(orpc.attention.counts.read().or(NOTHING_WAITING)) ??
		NOTHING_WAITING;
	const places = [
		place("All tracks", "Library", "/library", "Library"),
		place("Inbox", "Inbox", "/inbox", "Library", waiting.inbox),
		place("Stats", "ChartColumn", "/stats", "Library"),
		...playlists,
		place("Set builder", "ListOrdered", "/sets", "Playlists"),
		place("Soulseek", "Search", "/soulseek", "Get music"),
		place("Wishlist", "Star", "/wishlist", "Get music"),
		place("Downloads", "Download", "/downloads", "Get music"),
		place("Issues", "TriangleAlert", "/issues", "Clean up"),
		place("Duplicates", "Copy", "/duplicates", "Clean up", waiting.duplicates),
		place("Organiser", "FolderTree", "/organiser", "Clean up"),
		place("Rules", "WandSparkles", "/rules", "Clean up"),
		place(
			"Auto-tag review",
			"ClipboardCheck",
			"/auto-tag-review",
			"Clean up",
			waiting.review,
		),
		place("Genres", "Music", "/genres", "Tags"),
		place("Aliases", "Replace", "/aliases", "Tags"),
		place("Tags", "Tags", "/tags", "Tags"),
		place(
			"Devices",
			"MonitorSmartphone",
			"/devices",
			"System",
			waiting.conflicts,
		),
		place("Jobs", "ListChecks", "/jobs", "System"),
		place("History", "History", "/history", "System"),
		place("Quarantine", "Archive", "/quarantine", "System"),
		place("Backups", "DatabaseBackup", "/backups", "System"),
		place("Settings", "Settings", "/settings", "System"),
	];
	return (
		<Shell places={places} foot={<Dock />}>
			<Outlet />
		</Shell>
	);
}
