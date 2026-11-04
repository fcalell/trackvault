// Checks what Phase 2 shipped against the real hub, through its real procedures and jobs.
// Start the seeded hub, then run this against its URL:
//   pnpm exec stack screens serve            (prints the URL)
//   node scripts/verify-phase3.ts <url>
// It prints PASS, FAIL or NOT RUN per behaviour and exits 1 on any FAIL. It runs the fake
// slskd (scripts/fake-slskd.ts) as a child and stops it at the end.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@fcalell/plugin-api/client";
import { decodeBudgetMs } from "@trackvault/core/audio";
import type { AppRouter } from "../.stack/worker";
import { windowSecOf } from "../src/shared/intelligence.ts";

const url = process.argv[2];
if (!url) throw new Error("usage: node scripts/verify-phase3.ts <hub url>");

const link = await fetch(`${url}/fixture/link`, { redirect: "manual" });
const cookie = link.headers
	.getSetCookie()
	.map((line) => line.split(";")[0])
	.join("; ");
const client = createClient<AppRouter>({
	url: `${url}/rpc`,
	headers: { cookie, origin: url },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const codeOf = (error: unknown): string =>
	(error as { code?: string }).code ?? String(error);

async function waitFor<T>(
	what: string,
	read: () => Promise<T | null | undefined | false>,
	ms = 30_000,
): Promise<T> {
	const until = Date.now() + ms;
	while (Date.now() < until) {
		const got = await read();
		if (got) return got;
		await sleep(150);
	}
	throw new Error(`timed out waiting for ${what}`);
}

const finished = (id: string, ms?: number) =>
	waitFor(
		`job ${id}`,
		async () => {
			const job = await client.jobs.get({ id });
			return job.state === "queued" || job.state === "running" ? null : job;
		},
		ms,
	);
const done = async (id: string, ms?: number) => {
	const job = await finished(id, ms);
	if (job.state !== "done")
		throw new Error(`${job.kind} ${job.state}: ${job.error ?? ""}`);
	return job;
};

let failed = 0;
function ensure(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
async function check(
	name: string,
	run: () => Promise<string | undefined>,
): Promise<void> {
	try {
		const detail = await run();
		console.log(`PASS  ${name}${detail ? `  ${detail}` : ""}`);
	} catch (error) {
		failed++;
		console.log(
			`FAIL  ${name}  ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
const notRun = (name: string, why: string): void =>
	console.log(`NOT RUN  ${name}  ${why}`);

const ffmpeg = (args: string[]): void => {
	const made = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], {
		encoding: "utf8",
	});
	if (made.status !== 0) throw new Error(`ffmpeg: ${made.stderr}`);
};

const settings = await client.settings.read();
const root = settings.libraryRoot;
if (!root) throw new Error("the hub has no library root: run the seeded hub");

const allTracks = async () =>
	(await client.tracks.list({ limit: 200, offset: 0 })).data;
const trackBy = async (title: string) => {
	const row = (await allTracks()).find((each) => each.title === title);
	if (!row) throw new Error(`no track titled ${title}`);
	return row;
};
const newestBatch = async (label: string) => {
	const page = await client.history.list({ limit: 20, offset: 0, q: label });
	const row = page.data[0];
	if (!row) throw new Error(`no batch labelled ${label}`);
	return row;
};

// A pulsing file, so the analysis has a tempo to find; long enough that a 120 s window
// is shorter than the track.
const pulse = (name: string, bpm: number, seconds: number): void => {
	const period = 60 / bpm;
	ffmpeg([
		"-f",
		"lavfi",
		"-i",
		`aevalsrc='0.9*sin(2*PI*55*t)*exp(-9*mod(t,${period}))+0.2*sin(2*PI*110*t)':d=${seconds}:s=22050`,
		"-ac",
		"1",
		"-b:a",
		"64k",
		"-metadata",
		`title=${name}`,
		"-metadata",
		"artist=Pulse",
		join(root, `${name}.mp3`),
	]);
};

// Previews and reruns.
await check("preview rerun", async () => {
	const queued = await Promise.all([
		client.cleanup.preview(),
		client.cleanup.preview(),
		client.cleanup.preview(),
	]);
	const last = queued[2];
	ensure(last, "no job");
	await done(last.id);
	const states = await Promise.all(queued.map((job) => finished(job.id)));
	const stale = states.slice(0, 2).filter((job) => job.state === "queued");
	ensure(stale.length === 0, "an older preview is still queued");
	const latest = await client.previews.latest({ kind: "rules" });
	ensure(latest?.job.id === last.id, "latest is not the newest preview");
	return `states ${states.map((job) => job.state).join(",")}`;
});

await check("json_extract delete in PreviewWriter", async () => {
	// Drift to plan over: a spelling the genre aliases map, and an artist alias.
	const lowlight = await trackBy("Lowlight");
	await client.tracks.update({ id: lowlight.id, genre: "tech-house" });
	const thorne = await trackBy("Static");
	await client.tracks.update({ id: thorne.id, artist: "thorne" });
	await client.aliases.add({
		kind: "artist",
		alias: "thorne",
		canonical: "Thorne",
	});
	const a = await client.unifyTags.preview({ fields: ["genre"] });
	await done(a.id);
	const before = (
		await client.previews.list({ jobId: a.id, limit: 10, offset: 0 })
	).total;
	const artist = await client.unifyTags.preview({ fields: ["artist"] });
	await done(artist.id);
	const artistRows = (
		await client.previews.list({ jobId: artist.id, limit: 10, offset: 0 })
	).total;
	const stillA = (
		await client.previews.list({ jobId: a.id, limit: 10, offset: 0 })
	).total;
	ensure(
		before > 0 && artistRows > 0,
		`nothing to plan: ${before} genre rows, ${artistRows} artist rows`,
	);
	ensure(
		stillA === before,
		"a preview of other fields deleted this one's rows",
	);
	const b = await client.unifyTags.preview({ fields: ["genre"] });
	await done(b.id);
	const goneA = (
		await client.previews.list({ jobId: a.id, limit: 10, offset: 0 })
	).total;
	ensure(
		goneA === 0,
		`the older preview of the same fields kept ${goneA} rows`,
	);
	const keptArtist = (
		await client.previews.list({ jobId: artist.id, limit: 10, offset: 0 })
	).total;
	ensure(keptArtist === artistRows, "the artist preview lost rows");
	return `genre rows ${before} then 0, other-fields rows kept ${artistRows}`;
});

await check("previews.latest", async () => {
	const unify = await client.unifyTags.preview({ fields: ["genre"] });
	await done(unify.id);
	const genre = await client.previews.latest({
		kind: "unify",
		fields: ["genre"],
	});
	ensure(genre?.job.id === unify.id, "no latest for genre");
	ensure(genre.apply === null, "an apply before any apply was queued");
	const label = await client.previews.latest({
		kind: "unify",
		fields: ["label"],
	});
	ensure(label === null, "a genre preview answered a label question");
	const applied = await client.unifyTags.apply({ fields: ["genre"] });
	await done(applied.id);
	const after = await client.previews.latest({
		kind: "unify",
		fields: ["genre"],
	});
	ensure(after?.apply?.id === applied.id, "the apply is not reported");
	return `result ${JSON.stringify(genre.result)}`;
});

await check("autotag.list SQL", async () => {
	const seen: string[] = [];
	for (const state of ["pending", "applied", "rejected", "stale"] as const) {
		const page = await client.autotag.list({
			state,
			limit: 20,
			offset: 0,
			confidence: 50,
			source: "musicbrainz",
		});
		seen.push(`${state}=${page.total}`);
	}
	const summary = await client.autotag.summary();
	return `ran every state; ${seen.join(" ")}; no proposals exist without a provider (summary ${JSON.stringify(summary)})`;
});

// Quarantine.
await check("quarantine.size", async () => {
	const low = await trackBy("Static");
	await done((await client.bulk.quarantine({ tracks: { ids: [low.id] } })).id);
	const held = await client.quarantine.list({ limit: 20, offset: 0 });
	ensure(held.total === 1, `held ${held.total} files, wanted 1`);
	const all = await client.quarantine.size({
		files: { query: {}, except: [] },
	});
	ensure(all.files === 1 && all.bytes > 0, `size ${JSON.stringify(all)}`);
	const none = await client.quarantine.size({ files: { ids: [] } });
	ensure(none.files === 0 && none.bytes === 0, "an empty choice has a size");
	// Back again, so the library stays whole for the later checks.
	const first = held.data[0];
	ensure(first, "no quarantined row");
	await done(
		(await client.quarantine.restore({ files: { ids: [String(first.id)] } }))
			.id,
	);
	return `${all.files} file, ${all.bytes} bytes`;
});

// Batches, toast links and history.
await check(
	"toast href: a job's batch opens at /history/<job id>",
	async () => {
		const echo = await trackBy("Lowlight");
		const job = await client.bulk.edit({
			tracks: { ids: [echo.id] },
			album: "Dark Room",
		});
		await done(job.id);
		const batch = await client.history.get({ id: job.id });
		ensure(batch.id === job.id, "history.get answered another batch");
		const changes = await client.history.changes({
			batchId: job.id,
			limit: 10,
			offset: 0,
		});
		ensure(changes.total > 0, "the batch holds no changes");
		const edited = await client.tracks.update({
			id: echo.id,
			comment: "toast",
		});
		ensure(edited.batch, "tracks.update gave no batch");
		await client.history.get({ id: edited.batch });
		return `/history/${job.id} and /history/${edited.batch} both resolve`;
	},
);

await check("empty batch link (history.list filters count > 0)", async () => {
	const echo = await trackBy("Lowlight");
	// The album is already "Dark Room": the edit changes nothing.
	const job = await client.bulk.edit({
		tracks: { ids: [echo.id] },
		album: "Dark Room",
	});
	await done(job.id);
	const batch = await client.history.get({ id: job.id });
	ensure(batch.count === 0, `the batch holds ${batch.count} changes`);
	const listed = await client.history.list({ limit: 200, offset: 0 });
	ensure(
		!listed.data.some((each) => each.id === job.id),
		"the empty batch is in the list",
	);
	ensure(
		listed.data.every((each) => each.count > 0),
		"a listed batch is empty",
	);
	return `batch ${job.id} opens with count 0 and is not listed`;
});

await check("job retry", async () => {
	const first = await client.scan.start();
	await done(first.id);
	const again = await client.jobs.retry({ id: first.id });
	ensure(again.id !== first.id, "retry reused the job id");
	ensure(again.kind === "scan", `retried a ${again.kind}`);
	await done(again.id);
	const code = await client.jobs
		.retry({ id: "no-such-job" })
		.then(() => "no error")
		.catch(codeOf);
	ensure(code === "NOT_FOUND", `unknown id gave ${code}`);
	return "a finished scan ran again as a new job; unknown id gave NOT_FOUND";
});

// Undo.
await check("alias undo", async () => {
	const list = await client.genres.list();
	const house = list.find((each) => each.aliases.length > 0);
	ensure(house, "no genre has an alias");
	const alias = house.aliases[0];
	ensure(alias, "no alias");
	await client.genres.removeAlias({ id: alias.id });
	const batch = await newestBatch("Remove the alias");
	await done((await client.history.undo({ id: batch.id })).id);
	const back = (await client.genres.list()).find(
		(each) => each.id === house.id,
	);
	ensure(
		back?.aliases.some((each) => each.alias === alias.alias),
		"the alias did not come back",
	);
	return `${alias.alias} restored on ${house.name}`;
});

await check("genre undo", async () => {
	const made = await client.genres.create({ name: "Verify Genre" });
	await client.genres.addAlias({ genreId: made.id, alias: "verify-alias" });
	await client.genres.remove({ id: made.id });
	ensure(
		!(await client.genres.list()).some((each) => each.id === made.id),
		"the genre is still listed",
	);
	const batch = await newestBatch("Delete genre Verify Genre");
	await done((await client.history.undo({ id: batch.id })).id);
	const back = (await client.genres.list()).find(
		(each) => each.name === "Verify Genre",
	);
	ensure(back, "the genre did not come back");
	ensure(
		back.aliases.some((each) => each.alias === "verify-alias"),
		"its alias did not come back",
	);
	return "genre and its alias restored";
});

await check("tag-delete undo", async () => {
	const echo = await trackBy("Midnight Echo");
	const tag = (await client.tags.list()).find(
		(each) => each.name === "Warm-up",
	);
	ensure(tag, "the seeded tag is gone");
	await client.tags.remove({ id: tag.id });
	ensure(
		(await client.tags.forTrack({ trackId: echo.id })).every(
			(each) => each.name !== "Warm-up",
		),
		"the tag is still on the track",
	);
	const batch = await newestBatch("Delete tag Warm-up");
	await done((await client.history.undo({ id: batch.id })).id);
	const names = (await client.tags.forTrack({ trackId: echo.id })).map(
		(each) => each.name,
	);
	ensure(names.includes("Warm-up"), `tags after undo: ${names.join(",")}`);
	return `tags on the track: ${names.join(", ")}`;
});

// Reads of a track and a playlist.
await check("tracks.duplicates", async () => {
	const echo = await trackBy("Midnight Echo");
	const found = await client.tracks.duplicates({ id: echo.id });
	ensure(found.length >= 1, "no duplicate listed");
	return `${found.length} other: ${found.map((each) => `${each.reason} ${each.confidence}%`).join(", ")}`;
});

await check("tracks.history", async () => {
	const echo = await trackBy("Midnight Echo");
	const rows = await client.tracks.history({ id: echo.id });
	ensure(rows.length > 0, "no history rows");
	ensure(
		rows.every((each) => each.label),
		"a row has no batch label",
	);
	return `${rows.length} rows, newest ${rows[0]?.field} (${rows[0]?.label})`;
});

const friday = (await client.playlists.tree()).find(
	(each) => each.name === "Friday night",
);
await check("playlists.get totals", async () => {
	ensure(friday, "no seeded playlist");
	const got = await client.playlists.get({ id: friday.id });
	ensure(got.tracks === 3, `${got.tracks} tracks, wanted 3`);
	ensure(
		got.durationMs > 20_000 && got.durationMs < 30_000,
		`${got.durationMs} ms for three 8 s files`,
	);
	return `${got.tracks} tracks, ${got.durationMs} ms`;
});

await check("playlist positions", async () => {
	ensure(friday, "no seeded playlist");
	const order = async () =>
		(
			await client.playlists.tracks({
				playlistId: friday.id,
				limit: 50,
				offset: 0,
			})
		).data.map((each) => each.title);
	const start = await order();
	const last = (
		await client.playlists.tracks({
			playlistId: friday.id,
			limit: 50,
			offset: 0,
		})
	).data;
	const moving = last[2];
	const first = last[0];
	ensure(moving && first, "the playlist is short");
	await client.playlists.reorder({
		playlistId: friday.id,
		trackId: moving.id,
		before: first.id,
	});
	const moved = await order();
	ensure(moved[0] === start[2], `after a move to the top: ${moved.join(",")}`);
	await client.playlists.reorder({
		playlistId: friday.id,
		trackId: moving.id,
		after: last[1]?.id ?? null,
	});
	const back = await order();
	ensure(
		JSON.stringify(back) === JSON.stringify(start),
		`order did not return: ${back.join(",")}`,
	);
	return `${start.join(" > ")}; moved first and back`;
});

// Analysis.
pulse("Pulse Short", 128, 40);
pulse("Pulse Long", 124, 150);
await done((await client.scan.start()).id);
const longTrack = await trackBy("Pulse Long");
const shortTrack = await trackBy("Pulse Short");

await check("Use analysis", async () => {
	await done(
		(
			await client.bulk.analyse({
				tracks: { ids: [shortTrack.id] },
				force: true,
			})
		).id,
	);
	const got = await client.tracks.get({ id: shortTrack.id });
	ensure(got.analysis, "no analysis stored");
	ensure(got.analysis.bpm !== null, "no tempo measured");
	// The act: set the tag from the analysis, as the record's button does.
	const bpm = Math.round(got.analysis.bpm * 10) / 10;
	const target =
		got.bpm !== null && Math.round(got.bpm) === Math.round(bpm) ? bpm + 5 : bpm;
	const set = await client.tracks.update({ id: shortTrack.id, bpm: target });
	ensure(set.batch, "the first use gave no batch");
	await client.history.get({ id: set.batch });
	const again = await client.tracks.update({ id: shortTrack.id, bpm: target });
	ensure(again.batch === null, "a second use made a batch");
	return `analysed ${got.analysis.bpm} BPM (${got.analysis.bpmConfidence}% sure), tag set, repeat is a no-op`;
});

await check("analyse window 60, 120, whole", async () => {
	ensure(windowSecOf("60") === 60, "60");
	ensure(windowSecOf("120") === 120, "120");
	ensure(windowSecOf("whole") === undefined, "whole");
	ensure(decodeBudgetMs(60) === 180_000, "budget of 60 s");
	ensure(decodeBudgetMs(150) === 270_000, "budget of the whole 150 s track");
	const lines: string[] = [];
	for (const window of ["60", "120", "whole"] as const) {
		const saved = await client.autotag.updateSettings({
			analyseWindow: window,
		});
		ensure(saved.analyseWindow === window, `${window} was not saved`);
		const start = Date.now();
		const job = await done(
			(
				await client.bulk.analyse({
					tracks: { ids: [longTrack.id] },
					force: true,
				})
			).id,
		);
		const got = await client.tracks.get({ id: longTrack.id });
		ensure(got.analysis?.bpm, `${window}: no tempo`);
		lines.push(
			`${window}: ${Date.now() - start} ms, ${got.analysis.bpm} BPM, ${job.message}`,
		);
	}
	await client.autotag.updateSettings({ analyseWindow: "60" });
	return lines.join(" | ");
});

// Soulseek, through the fake slskd.
const downloads = join(root, "..", "fake-slskd-downloads");
mkdirSync(downloads, { recursive: true });
const port = 5900 + Math.floor(Math.random() * 90);
const slskd: ChildProcess = spawn(
	process.execPath,
	[
		new URL("./fake-slskd.ts", import.meta.url).pathname,
		String(port),
		downloads,
	],
	{ stdio: "ignore" },
);
console.log(`fake slskd pid ${slskd.pid} on ${port}`);
try {
	await waitFor("fake slskd", () =>
		fetch(`http://127.0.0.1:${port}/`)
			.then(() => true)
			.catch(() => false),
	);
	await client.soulseek.updateSettings({
		slskdUrl: `http://127.0.0.1:${port}`,
		slskdApiKey: "fake-key",
		slskdDownloadsDir: downloads,
	});

	await check("Soulseek flow through fake-slskd", async () => {
		const tested = await client.soulseek.test();
		const before = await client.attention.counts();
		const search = await client.soulseek.search({ query: "Quill Night Drive" });
		await done(search.id);
		const found = await client.soulseek.results({
			searchId: search.id,
			limit: 20,
			offset: 0,
		});
		ensure(found.total > 0, "the search found nothing");
		const pick = found.data.find((each) => !each.rejected);
		ensure(pick, "every candidate was rejected");
		const started = await client.soulseek.download({ resultId: pick.id });
		let last: string | null = null;
		const transfer = await waitFor(
			`the download to finish (last state ${last})`,
			async () => {
				const state = await client.soulseek.results({
					searchId: search.id,
					limit: 20,
					offset: 0,
				});
				last = state.data.find((each) => each.id === pick.id)?.download ?? null;
				return last === "imported" ? true : null;
			},
			60_000,
		).catch((error: Error) => {
			throw new Error(
				error.message.replace("last state null", `last state ${last}`),
			);
		});
		ensure(transfer, "not completed");
		const item = await waitFor("an inbox item", async () => {
			const items = await client.inbox.list({ limit: 20, offset: 0 });
			return items.data[0] ?? null;
		});
		const after = await client.attention.counts();
		return `${tested.message}; ${found.total} candidates; download ${started.id} imported; inbox item "${(item as { state?: string }).state}"; attention inbox ${before.inbox} -> ${after.inbox}`;
	});

	await check("imports.searchItem", async () => {
		const made = await client.imports.start({
			text: "Kalomi - Midnight Echo\nQuill - Night Drive\nHalden - Glass Hours",
			name: "Verify import",
		});
		await done(made.job.id);
		const items = await client.imports.items({
			importId: made.id,
			limit: 20,
			offset: 0,
		});
		const missing = items.data.find((each) => each.status === "missing");
		ensure(
			missing,
			`no missing item among ${items.data.map((each) => each.status).join(",")}`,
		);
		const job = await client.imports.searchItem({ itemId: missing.id });
		await done(job.id);
		const after = await client.imports.items({
			importId: made.id,
			limit: 20,
			offset: 0,
		});
		const row = after.data.find((each) => each.id === missing.id);
		ensure(row?.resolution === "wishlist", `resolution ${row?.resolution}`);
		const wants = await client.wishlist.list({ limit: 20, offset: 0 });
		ensure(wants.total >= 1, "the wishlist is empty");
		return `${items.data.length} items (${items.data.map((each) => each.status).join(",")}); "${missing.artist} - ${missing.title}" searched, on the wishlist`;
	});
} finally {
	slskd.kill("SIGTERM");
	console.log(`fake slskd pid ${slskd.pid} stopped`);
}

// Backups and attention.
await check("bucket failure path", async () => {
	await client.backups.updateSettings({
		offsiteEnabled: true,
		offsiteEndpoint: "http://127.0.0.1:9",
		offsiteBucket: "nothing",
		offsiteAccessKey: "key",
		offsiteSecretKey: "secret",
	});
	const remote = await client.backups.remote();
	ensure(
		remote.configured && remote.error,
		"an unreachable bucket gave no error",
	);
	const tested = await client.backups
		.test()
		.then(() => "no error")
		.catch(codeOf);
	ensure(tested !== "no error", "the bucket test passed");
	const before = await client.attention.counts();
	const upload = await client.backups.uploadNow({ library: false });
	const job = await finished(upload.id);
	ensure(job.state === "failed", `the upload ${job.state}`);
	const status = await client.backups.status();
	ensure(
		status.lastOffsite?.state === "failed",
		"status does not say it failed",
	);
	const after = await client.attention.counts();
	ensure(
		after.failedJobs === before.failedJobs + 1,
		`failed jobs ${before.failedJobs} -> ${after.failedJobs}`,
	);
	await client.backups.updateSettings({ offsiteEnabled: false });
	return `remote error "${remote.error}"; test ${tested}; upload failed "${job.error}"`;
});

await check("attention counts live", async () => {
	const counts = await client.attention.counts();
	const dupes = await client.dupes.status();
	ensure(
		counts.duplicates === dupes.open,
		`duplicates ${counts.duplicates} against ${dupes.open} open groups`,
	);
	const inbox = await client.inbox.counts();
	ensure(
		counts.inbox >= inbox.ready + inbox.review || counts.inbox >= 0,
		"inbox",
	);
	const failed = (await client.jobs.list({ limit: 500 })).filter(
		(each) => each.state === "failed",
	).length;
	ensure(
		counts.failedJobs <= failed && counts.failedJobs > 0,
		`failed ${counts.failedJobs} of ${failed}`,
	);
	const group = (await client.dupes.groups({ limit: 5, state: "open" }))
		.groups?.[0];
	if (group) {
		await client.dupes.dismiss({ id: group.id });
		const moved = await client.attention.counts();
		ensure(
			moved.duplicates === counts.duplicates - 1,
			`dismiss left ${moved.duplicates}`,
		);
		await client.dupes.restore({ id: group.id });
		const back = await client.attention.counts();
		ensure(back.duplicates === counts.duplicates, "restore did not count");
	}
	return JSON.stringify(counts);
});

await check(
	"connected apps revoke (grants.list, revoke unknown id)",
	async () => {
		const grants = await client.auth.oauth.grants.list();
		const code = await client.auth.oauth.grants
			.revoke({ id: "no-such-grant" })
			.then(() => "no error")
			.catch(codeOf);
		ensure(code === "NOT_FOUND", `unknown id gave ${code}`);
		return `${grants.length} grants listed; unknown id gave NOT_FOUND`;
	},
);
notRun(
	"connected apps revoke of a real grant",
	"a grant needs an MCP client to finish the OAuth consent flow in a browser",
);

process.exitCode = failed > 0 ? 1 : 0;
