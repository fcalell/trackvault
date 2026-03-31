import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, protocol } from "electron";
import { setupIpcBridge } from "./ipc-bridge";
import { registerFileProtocol } from "./protocol";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Enable CDP for MCP chrome-devtools connection in dev
if (!app.isPackaged) {
	app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
		},
	});

	if (process.env.VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(path.join(app.getAppPath(), "dist/index.html"));
	}

	if (!app.isPackaged) {
		mainWindow.webContents.openDevTools();
	}
}

protocol.registerSchemesAsPrivileged([
	{
		scheme: "local-file",
		privileges: { bypassCSP: true, stream: true },
	},
]);

app.whenReady().then(() => {
	registerFileProtocol();
	setupIpcBridge();
	createWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
