import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { BaseOrpcContext } from "#lib/orpc";
import { appRouter } from "#router";

export type AppEnv = {
	Variables: {
		appContext: BaseOrpcContext;
	};
};

const app = new Hono<AppEnv>();

app.use("*", logger());

const handler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error("oRPC error:", error);
		}),
	],
});

app.use("/rpc/*", async (c, next) => {
	const appContext = c.get("appContext");

	const { matched, response } = await handler.handle(c.req.raw, {
		prefix: "/rpc",
		context: appContext,
	});

	if (matched) {
		return c.newResponse(response.body, response);
	}

	await next();
});

export default app;
export type { BaseOrpcContext } from "#lib/orpc";
