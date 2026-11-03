import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LibraryPane } from "../../lib/library.tsx";

export const Route = createFileRoute("/_app/recent")({
	component: Recent,
});

// The library newest first: what the last scans found.
function Recent() {
	return (
		<>
			<LibraryPane title="Recently added" base="/recent" recent />
			<Outlet />
		</>
	);
}
