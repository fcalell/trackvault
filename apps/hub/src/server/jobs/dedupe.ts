import { createHash } from "node:crypto";
import { and, eq, inArray, lt, sql } from "@fcalell/plugin-db/orm";
import {
	type DedupeTrack,
	fingerprintFromBytes,
	groupDuplicates,
	pickKeeper,
	type TrackFacts,
} from "@trackvault/core/dedupe";
import { ISSUE } from "@trackvault/core/issues";
import {
	dupeGroups,
	dupeMembers,
	files,
	fingerprints,
	tracks,
} from "../../schema/index.ts";
import { db } from "../lib/db.ts";
import { defineJob } from "../lib/job.ts";
import { eachTrack, type Selection, selectedIds } from "../lib/selection.ts";

export interface DedupePayload {
	// Only groups that hold one of these tracks ("find duplicates of these").
	tracks?: Selection;
}

export interface DedupeResult {
	groups: number;
	tracks: number;
	exact: number;
	acoustic: number;
	fuzzy: number;
	dismissed: number;
	fingerprints: number;
	note?: string;
}

const keyOf = (ids: readonly string[]): string =>
	createHash("sha1")
		.update([...ids].sort().join("\n"))
		.digest("hex");

// Finds duplicates in three tiers over the library (core/dedupe: audio hash, then
// Chromaprint with an index, then fuzzy artist and title blocks), picks each
// group's keeper and why, and stores the groups. A group the owner dismissed stays
// dismissed; the groups of an earlier run that no longer hold are dropped.
export default defineJob<DedupePayload, DedupeResult>({
	kind: "dedupe",
	concurrency: 1,
	async run({ payload, signal, progress }) {
		const database = db();
		const started = new Date();
		progress(0, 0, "Reading the library");
		const rows = database
			.select({
				id: tracks.id,
				audioHash: tracks.audioHash,
				durationMs: tracks.durationMs,
				title: tracks.title,
				artist: tracks.artist,
				album: tracks.album,
				year: tracks.year,
			})
			.from(tracks)
			.where(sql`(${tracks.issues} & ${ISSUE.quarantined}) = 0`)
			.orderBy(tracks.seq)
			.all();
		const prints = new Map<string, Int32Array>();
		for (const row of database
			.select({ trackId: fingerprints.trackId, data: fingerprints.data })
			.from(fingerprints)
			.all())
			prints.set(row.trackId, fingerprintFromBytes(row.data));
		signal.throwIfAborted();
		const input: DedupeTrack[] = rows.map((row) => ({
			...row,
			fingerprint: prints.get(row.id) ?? null,
		}));
		progress(0, 0, "Comparing tracks");
		const found = groupDuplicates(input, {
			exact: true,
			acoustic: prints.size > 1,
			fuzzy: true,
		});
		signal.throwIfAborted();

		const scope = payload.tracks
			? new Set(selectedIds(payload.tracks))
			: undefined;
		const groups = found.groups.filter(
			(group) =>
				!scope || group.trackIds.some((trackId) => scope.has(String(trackId))),
		);

		const result: DedupeResult = {
			groups: 0,
			tracks: 0,
			exact: 0,
			acoustic: 0,
			fuzzy: 0,
			dismissed: 0,
			fingerprints: prints.size,
		};
		if (prints.size < 2)
			result.note =
				"No acoustic tier: tracks have no fingerprints yet (needs fpcalc)";
		progress(0, groups.length, "Choosing keepers");

		for (let i = 0; i < groups.length; i += 200) {
			signal.throwIfAborted();
			const chunk = groups.slice(i, i + 200);
			const ids = [
				...new Set(chunk.flatMap((group) => group.trackIds.map(String))),
			];
			const rowsById = new Map<
				string,
				ReturnType<typeof eachTrack> extends Generator<infer R> ? R : never
			>();
			for (const row of eachTrack(ids)) rowsById.set(row.id, row);
			const pathsOf = new Map<string, string[]>();
			for (const file of database
				.select({ trackId: files.trackId, path: files.path })
				.from(files)
				.where(and(inArray(files.trackId, ids), eq(files.state, "ok")))
				.all())
				if (file.trackId)
					pathsOf.set(file.trackId, [
						...(pathsOf.get(file.trackId) ?? []),
						file.path,
					]);
			database.transaction((tx) => {
				for (const group of chunk) {
					const members = group.trackIds.map(String);
					const facts = new Map<string, TrackFacts>();
					for (const id of members) {
						const row = rowsById.get(id);
						if (!row) continue;
						facts.set(id, {
							id,
							format: row.format,
							bitrateKbps: row.bitrate ?? 0,
							sampleRate: row.sampleRate ?? undefined,
							tags: {
								title: row.title,
								artist: row.artist,
								albumArtist: row.albumArtist,
								album: row.album,
								genre: row.genre,
								year: row.year,
								label: row.label,
								bpm: row.bpm,
								key: row.key,
								isrc: row.isrc,
							},
							hasArt: row.hasArt,
							cueCount: 0,
							playlistIds: [],
							addedAt: row.addedAt.getTime(),
							files: pathsOf.get(id) ?? [],
						});
					}
					if (facts.size < 2) continue;
					const choice = pickKeeper({ trackIds: [...facts.keys()] }, facts);
					const key = keyOf(members);
					const existing = tx
						.select({ id: dupeGroups.id, state: dupeGroups.state })
						.from(dupeGroups)
						.where(eq(dupeGroups.key, key))
						.get();
					if (existing?.state === "dismissed") {
						result.dismissed++;
						tx.update(dupeGroups)
							.set({ updatedAt: new Date() })
							.where(eq(dupeGroups.id, existing.id))
							.run();
						continue;
					}
					const values = {
						key,
						reason: group.reason,
						confidence: group.confidence,
						keeperId: String(choice.keeperId),
						keeperReason: choice.reason,
						size: members.length,
						state: "open" as const,
						updatedAt: new Date(),
					};
					let groupId = existing?.id;
					if (groupId === undefined) {
						groupId = tx
							.insert(dupeGroups)
							.values(values)
							.returning({ id: dupeGroups.id })
							.get().id;
						for (const trackId of members)
							tx.insert(dupeMembers).values({ groupId, trackId }).run();
					} else {
						tx.update(dupeGroups)
							.set(values)
							.where(eq(dupeGroups.id, groupId))
							.run();
					}
					result.groups++;
					result.tracks += members.length;
					result[group.reason]++;
				}
			});
			progress(
				Math.min(i + 200, groups.length),
				groups.length,
				"Choosing keepers",
			);
		}

		// Groups an earlier full run found and this one did not are gone.
		if (!scope)
			database
				.delete(dupeGroups)
				.where(
					and(eq(dupeGroups.state, "open"), lt(dupeGroups.updatedAt, started)),
				)
				.run();
		progress(
			groups.length,
			groups.length,
			`${result.groups} groups of ${result.tracks} tracks`,
		);
		return result;
	},
});
