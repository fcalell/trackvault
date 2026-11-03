import { createFileRoute, redirect } from "@tanstack/react-router";

// The hub opens on the library.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/library" });
	},
});
