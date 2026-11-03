import { Shell } from "@fcalell/plugin-react-ui/components/shell";
import type { PlaceSpec } from "@fcalell/ui-core/descriptors";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { orpc } from "../../lib/api.ts";
import { useLibraryLive } from "../../lib/library-live.ts";

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

// Only the places that are built stand here; the rest of the plan's sidebar
// (Inbox, Playlists, Curate, Tags, Discover, Devices) join as they land.
const PLACES: PlaceSpec[] = [
	{ label: "All tracks", icon: "Library", route: "/library", group: "Library" },
	{
		label: "Recently added",
		icon: "Clock",
		route: "/recent",
		group: "Library",
	},
	{ label: "Jobs", icon: "ListChecks", route: "/jobs", group: "System" },
	{ label: "Settings", icon: "Settings", route: "/settings", group: "System" },
];

function App() {
	useLibraryLive();
	return (
		<Shell places={PLACES}>
			<Outlet />
		</Shell>
	);
}
