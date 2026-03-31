import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { QueryBoundary } from "@repo/ui/components/query-boundary";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/solid-router";
import { FolderOpen } from "lucide-solid";
import { Show } from "solid-js";
import LibrarySidebar from "#components/library-sidebar";
import Shell from "#components/shell";
import { orpc } from "#lib/api";
import { useQuery } from "#lib/query";

export const Route = createFileRoute("/library")({
	component: LibraryLayout,
});

function LibraryLayout() {
	const settings = useQuery(() => orpc.settings.read.queryOptions({}));
	const navigate = useNavigate();

	return (
		<QueryBoundary query={settings} loadingText="loading...">
			{(data) => (
				<Show
					when={data()?.libraryPath}
					fallback={
						<Shell>
							<EmptyState
								icon={<FolderOpen />}
								title="Welcome to TrackVault"
								description="Configure your library path to get started."
							>
								<Button onClick={() => navigate({ to: "/settings" })}>
									Open Settings
								</Button>
							</EmptyState>
						</Shell>
					}
				>
					<Shell sidebar={<LibrarySidebar />}>
						<Outlet />
					</Shell>
				</Show>
			)}
		</QueryBoundary>
	);
}
