// A tiny stand-in for slskd, to run the Soulseek flow (search, rank, download, inbox)
// on a machine with no slskd and no network.
//
//   node scripts/fake-slskd.ts [port] [downloadsDir]      (defaults 5030, ./data/fake-slskd-downloads)
//
// Then in Settings: slskd address http://localhost:<port>, API key `fake-key`. A search
// answers with canned peers whose files are named after the query; a download takes
// about four seconds (queued, in progress, completed) and writes a small valid MP3 into
// the downloads folder, as slskd does.

import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";

const port = Number(process.argv[2] ?? 5030);
const downloadsDir = resolve(process.argv[3] ?? "./data/fake-slskd-downloads");
const API_KEY = "fake-key";
mkdirSync(downloadsDir, { recursive: true });

interface Search {
	id: string;
	searchText: string;
	startedAt: number;
}
interface Transfer {
	id: string;
	username: string;
	filename: string;
	size: number;
	startedAt: number;
	written: boolean;
	removed: boolean;
}
const searches = new Map<string, Search>();
const transfers: Transfer[] = [];

// 128 kbps, 44.1 kHz MPEG-1 Layer III frames of silence: about 5.2 seconds.
function mp3Bytes(): Buffer {
	const frame = Buffer.alloc(417);
	frame.writeUInt32BE(0xfffb9000, 0);
	return Buffer.concat(Array.from({ length: 200 }, () => frame));
}
const MP3 = mp3Bytes();

const words = (query: string): string[] =>
	query
		.replace(/-\S+/g, " ")
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);

const title = (w: string[]): string =>
	w.map((x) => x[0]?.toUpperCase() + x.slice(1)).join(" ");

function responsesFor(query: string) {
	const w = words(query);
	// "Artist Title ..." -> the first word the artist, the rest the title.
	const artist = title(w.slice(0, 1));
	const name = title(w.slice(1)) || "Untitled";
	const file = (
		folder: string,
		base: string,
		ext: string,
		bitRate: number,
		size: number,
		extra = {},
	) => ({
		filename: `\\\\@@share\\Music\\${folder}\\${base}.${ext}`,
		size,
		bitRate,
		length: 372,
		extension: ext,
		...extra,
	});
	return [
		{
			username: "dj_wax",
			hasFreeUploadSlot: true,
			uploadSpeed: 1_500_000,
			queueLength: 0,
			fileCount: 2,
			files: [
				file(
					`${artist}\\${name} EP`,
					`${artist} - ${name}`,
					"mp3",
					320,
					14_880_000,
				),
				file(
					`${artist}\\${name} EP`,
					`${artist} - ${name} (Radio Edit)`,
					"mp3",
					320,
					9_000_000,
				),
			],
		},
		{
			username: "bassline",
			hasFreeUploadSlot: false,
			uploadSpeed: 400_000,
			queueLength: 12,
			fileCount: 1,
			files: [
				file(
					`${artist} - ${name}`,
					`01 ${artist} - ${name}`,
					"flac",
					980,
					38_000_000,
					{ bitDepth: 16, sampleRate: 44_100 },
				),
			],
		},
		{
			username: "slowpeer",
			hasFreeUploadSlot: false,
			uploadSpeed: 20_000,
			queueLength: 90,
			fileCount: 1,
			files: [file("mixes", `${artist} ${name} remix`, "mp3", 128, 4_000_000)],
		},
	];
}

function transferView(t: Transfer) {
	const age = Date.now() - t.startedAt;
	const state =
		age < 1000
			? "Queued, Remotely"
			: age < 3500
				? "InProgress"
				: "Completed, Succeeded";
	const done = state.startsWith("Completed");
	if (done && !t.written) {
		const folder =
			t.filename.split("\\").filter(Boolean).slice(-2, -1)[0] ?? "";
		const name = t.filename.split("\\").filter(Boolean).pop() ?? "file.mp3";
		mkdirSync(join(downloadsDir, folder), { recursive: true });
		writeFileSync(join(downloadsDir, folder, name), MP3);
		t.written = true;
	}
	const fraction = state === "InProgress" ? (age - 1000) / 2500 : done ? 1 : 0;
	return {
		id: t.id,
		username: t.username,
		direction: "Download",
		filename: t.filename,
		size: MP3.length,
		state,
		bytesTransferred: Math.round(MP3.length * fraction),
		averageSpeed: state === "InProgress" ? 300_000 : 0,
		percentComplete: fraction * 100,
	};
}

const json = (
	res: import("node:http").ServerResponse,
	body: unknown,
	status = 200,
) => {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
};

createServer((req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${port}`);
	if (req.headers["x-api-key"] !== API_KEY)
		return json(res, { error: "unauthorized" }, 401);
	const path = url.pathname.replace(/^\/api\/v0/, "");
	const chunks: Buffer[] = [];
	req.on("data", (c: Buffer) => chunks.push(c));
	req.on("end", () => {
		const body =
			chunks.length > 0
				? JSON.parse(Buffer.concat(chunks).toString())
				: undefined;
		const match = (re: RegExp): RegExpExecArray | null => re.exec(path);
		if (req.method === "GET" && path === "/application")
			return json(res, { version: { current: "0.0.0-fake" } });
		if (req.method === "GET" && path === "/server")
			return json(res, {
				isConnected: true,
				isLoggedIn: true,
				state: "Connected, LoggedIn",
				username: "fake-user",
			});
		if (req.method === "GET" && path === "/options")
			return json(res, { directories: { downloads: downloadsDir } });
		if (req.method === "POST" && path === "/searches") {
			searches.set(body.id, {
				id: body.id,
				searchText: body.searchText,
				startedAt: Date.now(),
			});
			return json(res, {
				id: body.id,
				searchText: body.searchText,
				state: "Requested, InProgress",
				isComplete: false,
				responseCount: 0,
				fileCount: 0,
			});
		}
		const responses = match(/^\/searches\/([^/]+)\/responses$/);
		if (responses && req.method === "GET") {
			const s = searches.get(responses[1] as string);
			return json(res, s ? responsesFor(s.searchText) : []);
		}
		const m = match(/^\/searches\/([^/]+)$/);
		if (m) {
			const s = searches.get(m[1] as string);
			if (req.method === "GET") {
				if (!s) return json(res, { error: "not found" }, 404);
				return json(res, {
					id: s.id,
					searchText: s.searchText,
					state: "Completed, ResponseLimitReached",
					isComplete: true,
					responseCount: 3,
					fileCount: 4,
				});
			}
			if (req.method === "DELETE") searches.delete(m[1] as string);
			res.writeHead(204);
			return res.end();
		}
		const enqueue = match(/^\/transfers\/downloads\/([^/]+)$/);
		if (enqueue && req.method === "POST") {
			for (const f of body as Array<{ filename: string; size: number }>)
				transfers.push({
					id: `t${transfers.length + 1}`,
					username: decodeURIComponent(enqueue[1] as string),
					filename: f.filename,
					size: f.size,
					startedAt: Date.now(),
					written: false,
					removed: false,
				});
			return json(res, { enqueued: body, failed: [] });
		}
		if (req.method === "GET" && path === "/transfers/downloads") {
			const byUser = new Map<string, Transfer[]>();
			for (const t of transfers)
				if (!t.removed)
					byUser.set(t.username, [...(byUser.get(t.username) ?? []), t]);
			return json(
				res,
				[...byUser].map(([username, list]) => ({
					username,
					directories: [
						{
							directory: "Music",
							fileCount: list.length,
							files: list.map(transferView),
						},
					],
				})),
			);
		}
		const one = match(/^\/transfers\/downloads\/([^/]+)\/([^/]+)$/);
		if (one && req.method === "DELETE") {
			const t = transfers.find(
				(x) => x.id === decodeURIComponent(one[2] as string),
			);
			if (t) t.removed = true;
			res.writeHead(204);
			return res.end();
		}
		return json(res, { error: `no route ${req.method} ${path}` }, 404);
	});
}).listen(port, () =>
	console.log(
		`fake slskd on :${port}, downloads in ${downloadsDir}, api key ${API_KEY}`,
	),
);
