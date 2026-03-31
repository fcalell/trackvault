import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { BaseOrpcContext } from "@repo/api";
import { appRouter } from "@repo/api/orpc";
import type { IpcRequest, IpcResponse } from "@repo/schema/ipc";
import { dialog, ipcMain } from "electron";
import { db, desktopDb } from "./context";

const electronApi: BaseOrpcContext["electronApi"] = {
	showOpenDialog: async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory"],
		});
		return result.canceled ? undefined : result.filePaths;
	},
};

const appContext: BaseOrpcContext = {
	db,
	desktopDb,
	platform: "electron",
	electronApi,
};

const handler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error("oRPC error:", error);
		}),
	],
});

export function setupIpcBridge() {
	ipcMain.handle(
		"fetch",
		async (_event, ipcReq: IpcRequest): Promise<IpcResponse> => {
			const request = new Request(`https://electron.local${ipcReq.url}`, {
				method: ipcReq.method,
				headers: ipcReq.headers,
				body: ipcReq.body,
			});

			const { matched, response } = await handler.handle(request, {
				prefix: "/rpc",
				context: appContext,
			});

			if (matched && response) {
				return {
					status: response.status,
					headers: Object.fromEntries(response.headers),
					body: await response.text(),
				};
			}

			return {
				status: 404,
				headers: {},
				body: JSON.stringify({ error: "Not found" }),
			};
		},
	);
}
