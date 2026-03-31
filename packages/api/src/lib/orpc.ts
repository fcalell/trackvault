import { os } from "@orpc/server";
import type { Platform } from "@repo/constants/platforms";
import type { DbClient } from "@repo/db/client";
import type { DesktopDbClient } from "@repo/db-desktop/client";

export interface BaseOrpcContext {
	db: DbClient;
	platform: Platform;
	desktopDb?: DesktopDbClient;
	electronApi?: {
		showOpenDialog: () => Promise<string[] | undefined>;
	};
}

export const baseProcedure = os.$context<BaseOrpcContext>();
