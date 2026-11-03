import { defineService } from "@fcalell/plugin-node/server";
import {
	DeviceHello,
	ExportAck,
	ExportRequest,
	ImportBatch,
	InboxCheckRequest,
	ManifestRequest,
	PROTOCOL_HEADER,
	PROTOCOL_VERSION,
	StateReport,
	UploadComplete,
	UploadInit,
} from "@trackvault/core/sync";
import { devicesChannel } from "../../shared/channels.ts";
import { assertHash, hasBlob, putBlob, readBlob } from "../lib/sync/anlz.ts";
import {
	recordState,
	registerDevice,
	touchDevice,
} from "../lib/sync/devices.ts";
import { serveFile } from "../lib/sync/files.ts";
import { body, failure, json, ok, SyncError } from "../lib/sync/http.ts";
import { manifestPage } from "../lib/sync/manifest.ts";
import { ackExport, exportPage } from "../lib/sync/rb-export.ts";
import { importPart } from "../lib/sync/rb-import.ts";
import {
	abortUpload,
	completeUpload,
	inboxCheck,
	purgeStaleUploads,
	receiveChunk,
	startUpload,
	uploadStatus,
} from "../lib/sync/uploads.ts";
import { bindDevicesChannel, trackConnection } from "../lib/sync/wake.ts";

// The hub's surface for the device agent (`packages/core/src/sync`, protocol v1):
//   POST /sync/hello                    register / heartbeat
//   POST /sync/manifest                 tracks changed since a cursor, paged
//   GET  /sync/files/:trackId           the file, Range and If-Range
//   POST /sync/state                    file states and device status
//   POST /sync/inbox/check              which audio the hub already has
//   POST /sync/inbox/uploads            start or resume an upload
//   GET|PUT|DELETE /sync/inbox/uploads/:id, POST …/complete
//   POST /sync/rekordbox/import         one part of a Rekordbox import (idempotent)
//   POST /sync/rekordbox/export         the changes the device has not applied
//   POST /sync/rekordbox/ack            what the device applied
//   HEAD|GET|PUT /sync/anlz/:hash       analysis files by content
// and the `devices` channel on /ws: snapshot, wake, conflict.
// Every request carries a device key (`Authorization: Bearer stk_…`).

type SessionOf = (
	request: Request,
) => Promise<{ session: { id: string } } | null>;

async function route(request: Request, deviceId: string): Promise<Response> {
	const path = new URL(request.url).pathname.replace(/^\/sync/, "") || "/";
	const method = request.method;
	const match = (pattern: RegExp) => pattern.exec(path);

	if (method === "POST" && path === "/hello") {
		const hello = await body(request, DeviceHello);
		return json(registerDevice(deviceId, hello));
	}
	if (method === "POST" && path === "/manifest") {
		const req = await body(request, ManifestRequest);
		touchDevice(deviceId);
		return json(manifestPage(req.cursor, req.limit));
	}
	let m = match(/^\/files\/([^/]+)$/);
	if (m && (method === "GET" || method === "HEAD"))
		return serveFile(request, decodeURIComponent(m[1] as string));
	if (method === "POST" && path === "/state") {
		recordState(deviceId, await body(request, StateReport));
		return ok();
	}
	if (method === "POST" && path === "/inbox/check")
		return json(inboxCheck((await body(request, InboxCheckRequest)).items));
	if (method === "POST" && path === "/inbox/uploads")
		return json(await startUpload(deviceId, await body(request, UploadInit)));
	m = match(/^\/inbox\/uploads\/([^/]+)\/complete$/);
	if (m && method === "POST")
		return json(
			await completeUpload(
				deviceId,
				decodeURIComponent(m[1] as string),
				await body(request, UploadComplete),
			),
		);
	m = match(/^\/inbox\/uploads\/([^/]+)$/);
	if (m) {
		const id = decodeURIComponent(m[1] as string);
		if (method === "GET") return json(uploadStatus(deviceId, id));
		if (method === "PUT") {
			const offset = Number(new URL(request.url).searchParams.get("offset"));
			return json(await receiveChunk(deviceId, id, offset, request));
		}
		if (method === "DELETE") {
			await abortUpload(deviceId, id);
			return ok();
		}
	}
	if (method === "POST" && path === "/rekordbox/import") {
		const part = await body(request, ImportBatch);
		touchDevice(deviceId);
		return json(importPart(deviceId, part));
	}
	if (method === "POST" && path === "/rekordbox/export") {
		const req = await body(request, ExportRequest);
		touchDevice(deviceId);
		return json(exportPage(deviceId, req));
	}
	if (method === "POST" && path === "/rekordbox/ack") {
		ackExport(deviceId, await body(request, ExportAck));
		return ok();
	}
	m = match(/^\/anlz\/([^/]+)$/);
	if (m) {
		const hash = decodeURIComponent(m[1] as string);
		assertHash(hash);
		if (method === "HEAD")
			return new Response(null, { status: (await hasBlob(hash)) ? 200 : 404 });
		if (method === "GET")
			return new Response(await readBlob(hash), {
				headers: {
					"content-type": "application/octet-stream",
					"cache-control": "private, max-age=31536000, immutable",
				},
			});
		if (method === "PUT") {
			const url = new URL(request.url);
			await putBlob(
				deviceId,
				hash,
				url.searchParams.get("trackId"),
				url.searchParams.get("kind"),
				request,
			);
			return ok();
		}
	}
	throw new SyncError("not-found", "No such route");
}

async function handle(request: Request, session: SessionOf): Promise<Response> {
	try {
		// Only a device key: a browser's cookie is no agent.
		if (!/^bearer\s+stk_/i.test(request.headers.get("authorization") ?? ""))
			throw new SyncError("unauthorized", "A device key is required");
		const found = await session(request);
		if (!found)
			throw new SyncError("unauthorized", "The device key was refused");
		if (request.headers.get(PROTOCOL_HEADER) !== String(PROTOCOL_VERSION))
			throw new SyncError(
				"protocol-unsupported",
				`This hub speaks protocol ${PROTOCOL_VERSION}`,
			);
		return await route(request, found.session.id);
	} catch (error) {
		return failure(error);
	}
}

export default defineService({
	name: "sync",
	start({ http, ws, log }) {
		const channel = ws.channel(devicesChannel, {
			onSubscribe(conn) {
				const id = (conn.session as { session?: { id?: string } } | null)
					?.session?.id;
				if (typeof id !== "string") return;
				trackConnection(id, conn as never, true);
				conn.send("snapshot", { deviceId: id });
			},
			onUnsubscribe(conn) {
				const id = (conn.session as { session?: { id?: string } } | null)
					?.session?.id;
				if (typeof id === "string") trackConnection(id, conn as never, false);
			},
		});
		bindDevicesChannel(channel);
		http.mount("/sync", (request) =>
			handle(request, http.session as SessionOf),
		);
		const tidy = setInterval(() => {
			purgeStaleUploads().catch((error) =>
				log.error(
					`sync: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
		}, 3600_000);
		return () => {
			clearInterval(tidy);
			bindDevicesChannel(null);
		};
	},
});
