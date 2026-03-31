import { ORPCError, os } from "@orpc/server";
import type { Platform } from "@repo/constants/platforms";
import type { BaseOrpcContext } from "#lib/orpc";

export function requirePlatform(...platforms: Platform[]) {
	return os.$context<BaseOrpcContext>().middleware(({ context, next }) => {
		if (!platforms.includes(context.platform)) {
			throw new ORPCError("METHOD_NOT_ALLOWED", {
				message: `This procedure is only available on: ${platforms.join(", ")}`,
			});
		}
		return next({ context: {} });
	});
}
