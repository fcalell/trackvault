import { Toaster } from "@repo/ui/components/toast";
import {
	MutationCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/solid-query";
import { createRouter, RouterProvider } from "@tanstack/solid-router";
import { Suspense } from "solid-js";
import { render } from "solid-js/web";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: Infinity,
			retry: false,
			refetchOnMount: false,
			refetchOnReconnect: false,
			refetchOnWindowFocus: false,
		},
	},
	mutationCache: new MutationCache({
		onSuccess: (_data, _variables, _context, mutation) => {
			const mutationKey = mutation.options.mutationKey;
			if (!mutationKey) return;

			const path = mutationKey[0];
			if (!Array.isArray(path) || path.length === 0) return;

			const rootNamespace = path[0] as string;
			queryClient.invalidateQueries({ queryKey: [[rootNamespace]] });
		},
	}),
});

const router = createRouter({ routeTree });

declare module "@tanstack/solid-router" {
	interface Register {
		router: typeof router;
	}
}

function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<Suspense
				fallback={
					<div class="flex min-h-screen items-center justify-center bg-background">
						<p class="text-muted-foreground">Loading...</p>
					</div>
				}
			>
				<RouterProvider router={router} />
			</Suspense>
			<Toaster />
		</QueryClientProvider>
	);
}

const root = document.getElementById("root");
if (root) {
	render(() => <App />, root);
}
