export type IpcRequest = {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
};

export type IpcResponse = {
	status: number;
	headers: Record<string, string>;
	body: string;
};

export interface IElectronAPI {
	fetch: (req: IpcRequest) => Promise<IpcResponse>;
}

declare global {
	interface Window {
		appApi: IElectronAPI;
	}
}
