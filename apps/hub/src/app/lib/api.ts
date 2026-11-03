import { createClient } from "@fcalell/plugin-api/client";
import { createApiQueryUtils } from "@fcalell/plugin-api/tanstack-query";
import type { AppRouter } from "../../../.stack/worker";

export const api = createClient<AppRouter>();
export const orpc = createApiQueryUtils(api);
