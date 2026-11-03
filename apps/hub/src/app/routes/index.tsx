import { createFileRoute, redirect } from "@tanstack/react-router";

// The library place takes this route when it lands; until then the hub opens on its settings.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/settings" });
	},
});
