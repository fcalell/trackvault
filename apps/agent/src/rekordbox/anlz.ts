import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anlzPathFor, type RbTrack } from "@trackvault/core/rekordbox";
import { ANLZ_KINDS, type AnlzRef } from "@trackvault/core/sync";
import type { Context } from "../context.ts";
import { HubError } from "../hub/client.ts";
import { errorMessage } from "../util.ts";

type Kind = (typeof ANLZ_KINDS)[number];

// The ANLZ files (.DAT/.EXT/.2EX) of the linked tracks as content-addressed refs. Hashing
// is cached by (path, size, mtime); only refs the hub has not been sent are returned.
export async function collectAnlz(
	ctx: Context,
	shareDir: string,
	tracks: readonly { track: RbTrack; trackId: string }[],
): Promise<{ refs: AnlzRef[]; paths: Map<string, string> }> {
	const { state } = ctx;
	const refs: AnlzRef[] = [];
	const paths = new Map<string, string>();
	const sent = new Set(
		(
			state.db.prepare("select trackId, kind, hash from anlz_sent").all() as {
				trackId: string;
				kind: string;
				hash: string;
			}[]
		).map((r) => `${r.trackId}:${r.kind}:${r.hash}`),
	);
	const get = state.db.prepare("select * from anlz_hashes where path = ?");
	const put = state.db.prepare(
		"insert into anlz_hashes(path, size, mtimeMs, hash) values(?, ?, ?, ?) on conflict(path) do update set size = excluded.size, mtimeMs = excluded.mtimeMs, hash = excluded.hash",
	);
	for (const { track, trackId } of tracks) {
		if (!track.analysisDataPath || !track.analysed) continue;
		for (const kind of ANLZ_KINDS) {
			const path = anlzPathFor(shareDir, track.analysisDataPath, kind);
			let info: Awaited<ReturnType<typeof stat>>;
			try {
				info = await stat(path);
			} catch {
				continue;
			}
			const mtimeMs = Math.floor(info.mtimeMs);
			const row = get.get(path) as
				| { size: number; mtimeMs: number; hash: string }
				| undefined;
			let hash: string;
			if (row && row.size === info.size && row.mtimeMs === mtimeMs)
				hash = row.hash;
			else {
				hash = createHash("sha256")
					.update(await readFile(path))
					.digest("hex");
				put.run(path, info.size, mtimeMs, hash);
			}
			if (sent.has(`${trackId}:${kind}:${hash}`)) continue;
			refs.push({ trackId, kind, hash, size: info.size });
			paths.set(hash, path);
		}
	}
	return { refs, paths };
}

export function markAnlzSent(ctx: Context, refs: readonly AnlzRef[]): void {
	const put = ctx.state.db.prepare(
		"insert into anlz_sent(trackId, kind, hash) values(?, ?, ?) on conflict(trackId, kind) do update set hash = excluded.hash",
	);
	ctx.state.tx(() => {
		for (const r of refs) put.run(r.trackId, r.kind, r.hash);
	});
}

// Uploads the blobs the hub asked for.
export async function uploadBlobs(
	ctx: Context,
	wanted: readonly string[],
	refs: readonly AnlzRef[],
	paths: ReadonlyMap<string, string>,
): Promise<number> {
	let sent = 0;
	for (const hash of new Set(wanted)) {
		const path = paths.get(hash);
		const ref = refs.find((r) => r.hash === hash);
		if (!path || !ref) continue;
		try {
			await ctx.hub.anlzPut(
				hash,
				await readFile(path),
				ref.trackId,
				ref.kind as Kind,
			);
			sent++;
		} catch (error) {
			ctx.log.warn(`anlz upload ${hash.slice(0, 12)}: ${errorMessage(error)}`);
		}
	}
	return sent;
}

// Downloads blobs into the agent's cache so they are on hand once copying ANLZ files
// between installs is verified (VERIFY.md). They are not written into Rekordbox yet.
export async function stageBlobs(
	ctx: Context,
	refs: readonly AnlzRef[],
): Promise<number> {
	let staged = 0;
	await mkdir(ctx.paths.anlzCache, { recursive: true });
	for (const ref of refs) {
		const target = join(ctx.paths.anlzCache, `${ref.hash}.${ref.kind}`);
		if (
			await stat(target).then(
				() => true,
				() => false,
			)
		)
			continue;
		try {
			const bytes = await ctx.hub.anlzGet(ref.hash);
			if (createHash("sha256").update(bytes).digest("hex") !== ref.hash) {
				ctx.log.warn(`anlz ${ref.hash.slice(0, 12)}: hash mismatch; dropped`);
				continue;
			}
			await writeFile(`${target}.tmp`, bytes);
			await rename(`${target}.tmp`, target);
			staged++;
		} catch (error) {
			if (!(error instanceof HubError && error.status === 404))
				ctx.log.warn(`anlz ${ref.hash.slice(0, 12)}: ${errorMessage(error)}`);
		}
	}
	return staged;
}
