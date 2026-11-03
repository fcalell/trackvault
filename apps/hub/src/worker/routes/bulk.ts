import { procedure } from "virtual:stack-procedure";
import { ApiError } from "@fcalell/plugin-api/error";
import { selectionWhere } from "@fcalell/plugin-api/lib/selection";
import { selector, z } from "@fcalell/plugin-api/schema";
import { count, inArray } from "@fcalell/plugin-db/orm";
import { binaryAvailable } from "@trackvault/core/exec";
import { tags, tracks, trackTags } from "../../schema/index.ts";
import analyse from "../../server/jobs/analyse.ts";
import art from "../../server/jobs/art.ts";
import autotag from "../../server/jobs/autotag.ts";
import dedupe from "../../server/jobs/dedupe.ts";
import edit from "../../server/jobs/edit.ts";
import fingerprint from "../../server/jobs/fingerprint.ts";
import organise from "../../server/jobs/organise.ts";
import quarantine from "../../server/jobs/quarantine.ts";
import rules from "../../server/jobs/rules.ts";
import { clean } from "../../server/lib/changes.ts";
import { db } from "../../server/lib/db.ts";
import {
	libraryQuery,
	libraryWhere,
	prepareQuery,
} from "../../server/lib/library-query.ts";
import { readSettings } from "../../server/lib/settings.ts";
import { TAG_KEYS } from "../../server/lib/track-fields.ts";
import { enqueue } from "../../server/services/jobs.ts";
import { jobViewSchema } from "../../shared/channels.ts";
import { editFields, patchOf, tagPatch } from "../../shared/patch.ts";

const tracksInput = selector(libraryQuery);

// How many tracks the preview reads: the first of the selection, in title order.
const SAMPLE = 40;

// The Edit tags form's input, read as the patch, the tag ids and the job's payload.
const editInput = z.object({ tracks: tracksInput, ...editFields });

function editOf(input: z.infer<typeof editInput>) {
	const parsed = tagPatch.safeParse(patchOf(input));
	if (!parsed.success)
		throw new ApiError("BAD_REQUEST", {
			message: parsed.error.issues[0]?.message ?? "Check the values",
		});
	const ids = new Map(
		db()
			.select()
			.from(tags)
			.all()
			.map((row) => [row.name, row.id]),
	);
	const idsOf = (names: readonly string[] | undefined): number[] =>
		(names ?? []).flatMap((name) => ids.get(name) ?? []);
	return {
		patch: parsed.data,
		addTags: idsOf(input.addTags),
		removeTags: idsOf(input.removeTags),
	};
}

const word = (value: unknown): string | null =>
	value === null || value === undefined || value === "" ? null : String(value);

export const bulk = {
	// What an edit would do to the first tracks of the selection, as rows of
	// before and after, and how many tracks it names. Nothing is written.
	preview: procedure({ auth: true, reads: ["tracks", "tags"] })
		.input(editInput)
		.query(({ input: given }) => {
			const database = db();
			const { patch, addTags, removeTags } = editOf(given);
			const input = { tracks: given.tracks, patch, addTags, removeTags };
			const version = readSettings().libraryVersion;
			const selection =
				"query" in input.tracks
					? {
							...input.tracks,
							query: prepareQuery(database, input.tracks.query, version),
						}
					: input.tracks;
			const where = selectionWhere(selection, {
				id: tracks.id,
				where: libraryWhere,
			});
			const total =
				"ids" in selection
					? selection.ids.length
					: (database.select({ n: count() }).from(tracks).where(where).get()
							?.n ?? 0);
			const rows = database
				.select()
				.from(tracks)
				.where(where)
				.orderBy(tracks.title, tracks.id)
				.limit(SAMPLE)
				.all();
			const names = new Map(
				database
					.select()
					.from(tags)
					.all()
					.map((row) => [row.id, row.name]),
			);
			const tagsOf = new Map<string, string[]>();
			if (input.addTags.length + input.removeTags.length > 0) {
				for (const row of database
					.select({ trackId: trackTags.trackId, tagId: trackTags.tagId })
					.from(trackTags)
					.where(
						inArray(
							trackTags.trackId,
							rows.map((row) => row.id),
						),
					)
					.all())
					tagsOf.set(row.trackId, [
						...(tagsOf.get(row.trackId) ?? []),
						names.get(row.tagId) ?? "",
					]);
			}
			const changes: Array<{
				id: string;
				entity: string;
				entityId: string;
				title: string | null;
				artist: string | null;
				field: string;
				before: string | null;
				after: string | null;
			}> = [];
			const onTrack = (row: (typeof rows)[number], key: string) => ({
				id: `${row.id}:${key}`,
				entity: "track",
				entityId: row.id,
				title: row.title,
				artist: row.artist,
				field: key,
			});
			let touched = 0;
			for (const row of rows) {
				let any = false;
				for (const key of TAG_KEYS) {
					if (!(key in input.patch)) continue;
					const next = clean(
						key,
						(input.patch as Record<string, unknown>)[key],
					);
					const was = row[key] ?? null;
					if (next === was) continue;
					any = true;
					changes.push({
						...onTrack(row, key),
						before: word(was),
						after: word(next),
					});
				}
				if (input.addTags.length + input.removeTags.length > 0) {
					const was = new Set(tagsOf.get(row.id) ?? []);
					const next = new Set(was);
					for (const id of input.addTags)
						if (names.has(id)) next.add(names.get(id) as string);
					for (const id of input.removeTags) next.delete(names.get(id) ?? "");
					if (next.size !== was.size || [...next].some((n) => !was.has(n))) {
						any = true;
						changes.push({
							...onTrack(row, "tags"),
							before: [...was].sort().join(", ") || null,
							after: [...next].sort().join(", ") || null,
						});
					}
				}
				if (any) touched++;
			}
			return { total, sampled: rows.length, touched, changes };
		}),

	// Edit tags over a selection: a job that writes the database in chunks, logs
	// each field, then writes the files.
	edit: procedure({ auth: true, writes: ["tracks", "jobs"] })
		.input(editInput)
		.output(jobViewSchema)
		.mutation(({ input }) => {
			const { patch, addTags, removeTags } = editOf(input);
			if (
				Object.keys(patch).length === 0 &&
				addTags.length + removeTags.length === 0
			)
				throw new ApiError("BAD_REQUEST", {
					message: "Enter a value to change.",
				});
			return enqueue(edit, {
				tracks: input.tracks,
				patch,
				addTags,
				removeTags,
			});
		}),

	// The enabled cleanup rules over a selection.
	rules: procedure({ auth: true, writes: ["tracks", "jobs"] })
		.input(z.object({ tracks: tracksInput }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(rules, { mode: "apply", tracks: input.tracks }),
		),

	// The organiser's saved template over a selection.
	organise: procedure({ auth: true, writes: ["tracks", "files", "jobs"] })
		.input(z.object({ tracks: tracksInput }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(organise, {
				mode: "apply",
				template: readSettings().organiseTemplate,
				tracks: input.tracks,
			}),
		),

	// The selection's files go to the quarantine.
	quarantine: procedure({ auth: true, writes: ["tracks", "files", "jobs"] })
		.input(z.object({ tracks: tracksInput }))
		.output(jobViewSchema)
		.mutation(({ input }) => enqueue(quarantine, { tracks: input.tracks })),

	// Duplicates of the selection: fingerprints first when fpcalc is there, then the
	// search over the library, keeping the groups that hold one of these tracks.
	dedupe: procedure({ auth: true, writes: ["dupeGroups", "jobs"] })
		.input(z.object({ tracks: tracksInput }))
		.output(jobViewSchema)
		.mutation(async ({ input }) =>
			(await binaryAvailable("fpcalc", "-version"))
				? enqueue(fingerprint, { afterwards: { tracks: input.tracks } })
				: enqueue(dedupe, { tracks: input.tracks }),
		),

	// Asks the auto-tag providers about the selection; the results wait in Auto-tag review.
	autotag: procedure({ auth: true, writes: ["proposals", "jobs"] })
		.input(z.object({ tracks: tracksInput }))
		.output(jobViewSchema)
		.mutation(({ input }) => enqueue(autotag, { tracks: input.tracks })),

	// Cover art for the selection: found, embedded, the "No artwork" flag cleared.
	art: procedure({ auth: true, writes: ["tracks", "jobs"] })
		.input(z.object({ tracks: tracksInput, force: z.boolean().default(false) }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(art, { tracks: input.tracks, force: input.force }),
		),

	// BPM, key, energy and loudness measured from the audio.
	analyse: procedure({ auth: true, writes: ["tracks", "jobs"] })
		.input(z.object({ tracks: tracksInput, force: z.boolean().default(false) }))
		.output(jobViewSchema)
		.mutation(({ input }) =>
			enqueue(analyse, { tracks: input.tracks, force: input.force }),
		),
};
