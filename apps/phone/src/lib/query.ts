import { createQueryClient } from "@fcalell/plugin-api/tanstack-query";

// The TanStack Query client the generated entry wraps the app in. A write invalidates the
// reads that name its entities: the schema `stack generate` copies from the hub says which.
export const queryClient = createQueryClient();
