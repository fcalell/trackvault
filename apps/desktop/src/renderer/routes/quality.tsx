import { createFileRoute, Outlet } from "@tanstack/solid-router";
import QualitySidebar from "#components/quality-sidebar";
import Shell from "#components/shell";

export const Route = createFileRoute("/quality")({
	component: QualityLayout,
});

function QualityLayout() {
	return (
		<Shell sidebar={<QualitySidebar />}>
			<Outlet />
		</Shell>
	);
}
