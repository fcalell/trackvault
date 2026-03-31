import type { IElectronAPI, IpcRequest, IpcResponse } from "@repo/schema/ipc";
import { contextBridge, ipcRenderer } from "electron";

const appApi: IElectronAPI = {
	fetch: (req: IpcRequest): Promise<IpcResponse> =>
		ipcRenderer.invoke("fetch", req),
};

contextBridge.exposeInMainWorld("appApi", appApi);
