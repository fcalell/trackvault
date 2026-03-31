import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouter, RouterClient } from "@repo/api/orpc";
import type { IpcRequest } from "@repo/schema/ipc";

const electronFetch: typeof fetch = async (input, init) => {
	// oRPC may pass a Request object as `input` with body/headers on it
	const req =
		input instanceof Request
			? input
			: new Request(
					typeof input === "string" ? input : input.toString(),
					init ?? {},
				);

	const url = new URL(req.url).pathname;
	const body = req.body ? await req.text() : null;

	const ipcReq: IpcRequest = {
		url,
		method: req.method,
		headers: Object.fromEntries(req.headers),
		body,
	};

	const ipcRes = await window.appApi.fetch(ipcReq);

	return new Response(ipcRes.body, {
		status: ipcRes.status,
		headers: ipcRes.headers,
	});
};

const client: RouterClient<AppRouter> = createORPCClient(
	new RPCLink({
		url: "https://electron.local/rpc",
		fetch: electronFetch,
	}),
);

export const orpc = createTanstackQueryUtils(client);
export type OrpcClient = typeof orpc;
