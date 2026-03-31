import { electronRouter } from "#procedures/electron";
import { libraryRouter } from "#procedures/library";
import { qualityRouter } from "#procedures/quality";
import { settingsRouter } from "#procedures/settings";

export const appRouter = {
	library: libraryRouter,
	quality: qualityRouter,
	settings: settingsRouter,
	electron: electronRouter,
};

export type AppRouter = typeof appRouter;
export type { RouterClient } from "@orpc/server";
