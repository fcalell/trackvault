import { createQueryClient } from "@fcalell/plugin-api/tanstack-query";

// The TanStack Query client the generated entry wraps the app in. A mutation here
// invalidates every read: the phone's generated schema is its own (empty) router's, so
// the entity-based invalidation of the hub's `reads`/`writes` does not know the hub.
export const queryClient = createQueryClient();
