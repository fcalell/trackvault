import { Shell } from "@fcalell/plugin-react-ui/components/shell";
import type { PlaceSpec } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { useJobEffects } from "../../lib/jobs-effects.ts";
import { useLibraryLive } from "../../lib/library-live.ts";
import { usePlaylistPlaces } from "../../lib/playlists.tsx";

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

// The plan's sidebar, group by group (the Playlists group joins from the data).
const PLACES: PlaceSpec[] = [
	{ label: "All tracks", icon: "Library", route: "/library", group: "Library" },
	{
		label: "Recently added",
		icon: "Clock",
		route: "/recent",
		group: "Library",
	},
	{ label: "Inbox", icon: "Inbox", route: "/inbox", group: "Library" },
	{
		label: "Set builder",
		icon: "ListOrdered",
		route: "/sets",
		group: "Library",
	},
	{ label: "Stats", icon: "ChartColumn", route: "/stats", group: "Library" },
	// The Playlists group stands here: `usePlaylistPlaces`.
	{ label: "Issues", icon: "TriangleAlert", route: "/issues", group: "Curate" },
	{ label: "Duplicates", icon: "Copy", route: "/duplicates", group: "Curate" },
	{
		label: "Organiser",
		icon: "FolderTree",
		route: "/organiser",
		group: "Curate",
	},
	{
		label: "Review",
		icon: "ClipboardCheck",
		route: "/review",
		group: "Curate",
	},
	{
		label: "Cleanup rules",
		icon: "WandSparkles",
		route: "/rules",
		group: "Curate",
	},
	{
		label: "Quarantine",
		icon: "Archive",
		route: "/quarantine",
		group: "Curate",
	},
	{ label: "Genres", icon: "Music", route: "/genres", group: "Tags" },
	{ label: "Custom tags", icon: "Tags", route: "/tags", group: "Tags" },
	{ label: "Aliases", icon: "Replace", route: "/aliases", group: "Tags" },
	{ label: "Search", icon: "Search", route: "/search", group: "Discover" },
	{ label: "Wishlist", icon: "Star", route: "/wishlist", group: "Discover" },
	{
		label: "Downloads",
		icon: "Download",
		route: "/downloads",
		group: "Discover",
	},
	{
		label: "Devices",
		icon: "MonitorSmartphone",
		route: "/devices",
		group: "System",
	},
	{ label: "History", icon: "History", route: "/history", group: "System" },
	{ label: "Jobs", icon: "ListChecks", route: "/jobs", group: "System" },
	{ label: "Settings", icon: "Settings", route: "/settings", group: "System" },
];

// Library first, then the playlists, then the rest, as the plan's sidebar reads.
function App() {
	useLibraryLive();
	useJobEffects();
	const playlists = usePlaylistPlaces();
	const places = [
		...PLACES.filter((place) => place.group === "Library"),
		...playlists,
		...PLACES.filter((place) => place.group !== "Library"),
	];
	return (
		<Shell places={places}>
			<Outlet />
		</Shell>
	);
}
