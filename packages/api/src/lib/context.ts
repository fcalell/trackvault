import { ORPCError } from "@orpc/server";
import type { BaseOrpcContext } from "#lib/orpc";

export function requireDesktopDb(context: BaseOrpcContext) {
	if (!context.desktopDb) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Desktop database not available",
		});
	}
	return context.desktopDb;
}

export async function getLibraryPath(
	desktopDb: NonNullable<BaseOrpcContext["desktopDb"]>,
) {
	const config = await desktopDb.query.settings.findFirst();
	if (!config?.libraryPath) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Library path not configured",
		});
	}
	return config.libraryPath;
}
