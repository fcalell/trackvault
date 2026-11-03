import { queryClient } from "./query";

/** After a write: every read is stale (see lib/query.ts for why not by entity). */
export const refresh = () => queryClient.invalidateQueries();
