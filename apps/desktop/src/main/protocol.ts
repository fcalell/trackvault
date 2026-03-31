import * as path from "node:path";
import { net, protocol } from "electron";

export function registerFileProtocol() {
	protocol.handle("local-file", (request) => {
		const filePath = decodeURIComponent(
			request.url.replace("local-file://", ""),
		);

		const resolved = path.resolve(filePath);
		if (
			resolved.includes("\0") ||
			resolved !== filePath.replace(/\//g, path.sep)
		) {
			return new Response("Forbidden", { status: 403 });
		}

		return net.fetch(`file://${resolved}`);
	});
}
