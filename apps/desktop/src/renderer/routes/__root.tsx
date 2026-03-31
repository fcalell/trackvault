import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import {
	createRootRoute,
	Outlet,
	redirect,
	useRouter,
} from "@tanstack/solid-router";
import { TriangleAlert } from "lucide-solid";
import Header from "#components/header";
import Player from "#components/player";

function RootErrorComponent() {
	const router = useRouter();
	return (
		<div class="flex h-screen items-center justify-center bg-background text-foreground">
			<EmptyState
				icon={<TriangleAlert />}
				title="Something went wrong"
				description="An unexpected error occurred"
			>
				<Button size="sm" onClick={() => router.invalidate()}>
					Retry
				</Button>
			</EmptyState>
		</div>
	);
}

export const Route = createRootRoute({
	errorComponent: RootErrorComponent,
	beforeLoad: ({ location }) => {
		if (location.pathname === "/") {
			throw redirect({ to: "/library" });
		}
	},
	component: () => (
		<div class="grid h-screen grid-rows-[48px_1fr_auto] bg-background text-foreground">
			<Header />
			<Outlet />
			<Player />
		</div>
	),
});
