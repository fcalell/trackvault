import { createFileRoute, redirect } from "@tanstack/solid-router";

export const Route = createFileRoute("/quality/")({
	beforeLoad: () => {
		throw redirect({ to: "/quality/duplicates" });
	},
});
