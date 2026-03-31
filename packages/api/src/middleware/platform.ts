import { ORPCError } from "@orpc/server";
import type { Platform } from "@repo/constants/platforms";
import { baseProcedure } from "#lib/orpc";

export function requirePlatform(...platforms: Platform[]) {
	return baseProcedure.middleware(({ context, next }) => {
		if (!platforms.includes(context.platform)) {
			throw new ORPCError("METHOD_NOT_ALLOWED", {
				message: `This procedure is only available on: ${platforms.join(", ")}`,
			});
		}
		return next({ context: {} });
	});
}
