import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

// The query client every route's loader reads from `context`.
export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	component: Outlet,
});
