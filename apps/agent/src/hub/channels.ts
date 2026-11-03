import { z } from "@fcalell/plugin-api/schema";
import { createWsClient } from "@fcalell/plugin-node/client";
import { defineChannel } from "@fcalell/plugin-node/ws";
import type { Logger } from "../log.ts";

// Mirrors the hub's `src/shared/channels.ts` `library` channel (same name, same
// messages). The agent only listens.
export const libraryChannel = defineChannel("library", {
	server: {
		snapshot: z.object({ version: z.number() }),
		changed: z.object({
			ids: z.array(z.string()),
			version: z.number(),
			all: z.boolean(),
		}),
	},
	client: {},
});

// The per-device channel the hub's sync service owns. The hub sends to the connection of
// the device key (`conn.session.session.id`) only:
//  - `snapshot` on subscribe: { deviceId }
//  - `wake`: do work now. scope "replica" (manifest changed), "rekordbox" (export
//    changes are waiting), "all".
//  - `conflict`: a Rekordbox merge conflict was recorded for this device.
export const devicesChannel = defineChannel("devices", {
	server: {
		snapshot: z.object({ deviceId: z.string() }),
		wake: z.object({
			scope: z.enum(["replica", "rekordbox", "all"]),
			reason: z.string().optional(),
		}),
		conflict: z.object({
			id: z.string(),
			entity: z.enum(["track", "playlist"]),
			refId: z.string(),
			field: z.string().nullable(),
			winner: z.enum(["device", "hub"]),
			at: z.string(),
		}),
	},
	client: {},
});

export interface LiveHandlers {
	onReplica(reason: string): void;
	onRekordbox(reason: string): void;
	onConflict(summary: string): void;
}

export interface Live {
	close(): void;
}

// One socket to the hub's `/ws`, with the device key on the upgrade. The client
// reconnects on its own and subscribes again.
export function connectLive(
	hubUrl: string,
	key: string,
	log: Logger,
	handlers: LiveHandlers,
): Live {
	const url = `${hubUrl.replace(/\/+$/, "").replace(/^http/, "ws")}/ws`;
	const ws = createWsClient({
		url,
		headers: { authorization: `Bearer ${key}` },
	});
	const status = (name: string) => (s: string) =>
		log.debug(`live ${name}: ${s}`);
	const library = ws.subscribe(libraryChannel, {
		onMessage: {
			snapshot: () => handlers.onReplica("library snapshot"),
			changed: (m) => handlers.onReplica(`library v${m.version}`),
		},
		onStatus: status("library"),
	});
	const devices = ws.subscribe(devicesChannel, {
		onMessage: {
			snapshot: () => {},
			wake: (m) => {
				if (m.scope === "replica" || m.scope === "all")
					handlers.onReplica(m.reason ?? "wake");
				if (m.scope === "rekordbox" || m.scope === "all")
					handlers.onRekordbox(m.reason ?? "wake");
			},
			conflict: (m) =>
				handlers.onConflict(
					`${m.entity} ${m.refId}${m.field ? `.${m.field}` : ""} won by ${m.winner}`,
				),
		},
		onStatus: status("devices"),
	});
	return {
		close() {
			library.unsubscribe();
			devices.unsubscribe();
			ws.close();
		},
	};
}
