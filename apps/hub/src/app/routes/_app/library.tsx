import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LibraryPane } from "../../lib/library.tsx";

export const Route = createFileRoute("/_app/library")({
	component: Library,
});

// Every track, searched, filtered and sorted on the hub; a record opens beside it.
function Library() {
	return (
		<>
			<LibraryPane title="All tracks" base="/library" />
			<Outlet />
		</>
	);
}
