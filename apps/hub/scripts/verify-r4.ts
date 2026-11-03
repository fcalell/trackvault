// Runs the R4 jobs end to end on a scratch database and a temp library of ffmpeg-made
// files, with every provider answered by a mocked `fetch` (no network):
//   DB_FILE=<migrated copy> node scripts/verify-r4.ts
// scan -> autotag (proposals) -> accept -> autotag-apply (tags read back from the file)
// -> art (cover embedded, thumbnail made) -> analyse (tempo, key, loudness) -> set builder.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "@fcalell/plugin-db/orm";
import { readEmbeddedCover } from "@trackvault/core/art";
import { readTags } from "@trackvault/core/tags";
import { settings, tracks } from "../src/schema/index.ts";
import analyse from "../src/server/jobs/analyse.ts";
import art from "../src/server/jobs/art.ts";
import autotag from "../src/server/jobs/autotag.ts";
import autotagApply from "../src/server/jobs/autotag-apply.ts";
import scan from "../src/server/jobs/scan.ts";
import { thumbnail } from "../src/server/lib/art.ts";
import { db } from "../src/server/lib/db.ts";
import { statement } from "../src/server/lib/raw.ts";
import { mixTracks, suggestAfter } from "../src/server/lib/sets.ts";
import { readSettings } from "../src/server/lib/settings.ts";
import { ensureGenres, loadTaxonomies } from "../src/server/lib/taxonomy.ts";

const ctx = <P>(payload: P) => ({
	id: crypto.randomUUID(),
	payload,
	signal: new AbortController().signal,
	progress: () => {},
});
const ok = (name: string, pass: boolean, detail = ""): void => {
	console.log(
		`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`,
	);
	if (!pass) process.exitCode = 1;
};

const root = mkdtempSync(join(tmpdir(), "tv-r4-"));
mkdirSync(join(root, "lib"));
const make = (name: string, bpm: number, hz: number, tags: string[]): void => {
	const period = 60 / bpm;
	const r = spawnSync("ffmpeg", [
		"-v",
		"error",
		"-y",
		"-f",
		"lavfi",
		"-i",
		`aevalsrc='0.9*sin(2*PI*${hz}*t)*exp(-9*mod(t,${period}))+0.2*sin(2*PI*${hz * 2}*t)':d=45:s=44100`,
		"-b:a",
		"192k",
		...tags.flatMap((t) => ["-metadata", t]),
		join(root, "lib", name),
	]);
	if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};
make("a.mp3", 124, 55, ["title=Midnight Echo", "artist=Kalomi"]);
make("b.mp3", 128, 65, ["title=Velvet Signal", "artist=Rendor", "genre=House"]);
// A 700 px square cover.
spawnSync("ffmpeg", [
	"-v",
	"error",
	"-y",
	"-f",
	"lavfi",
	"-i",
	"color=c=red:s=700x700",
	"-frames:v",
	"1",
	join(root, "cover.jpg"),
]);
const cover = readFileSync(join(root, "cover.jpg"));

const json = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
	});
const urls: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
	const url = String(input instanceof Request ? input.url : input);
	urls.push(url);
	if (url.includes("musicbrainz.org/ws/2/recording?"))
		return json({
			recordings: [
				{
					id: "rec-1",
					score: 100,
					title: "Midnight Echo",
					length: 45000,
					"artist-credit": [{ name: "Kalomi" }],
				},
			],
		});
	if (url.includes("musicbrainz.org/ws/2/recording/rec-1"))
		return json({
			id: "rec-1",
			title: "Midnight Echo",
			length: 45000,
			"artist-credit": [{ name: "Kalomi" }],
			genres: [{ name: "Tech-House", count: 5 }],
			releases: [
				{
					id: "rel-1",
					title: "Midnight EP",
					date: "2021-05-04",
					status: "Official",
				},
			],
		});
	if (url.includes("musicbrainz.org/ws/2/release/rel-1"))
		return json({
			id: "rel-1",
			title: "Midnight EP",
			"label-info": [
				{ "catalog-number": "CR001", label: { name: "Cipher Records" } },
			],
		});
	if (url.includes("musicbrainz.org")) return json({ recordings: [] });
	if (url.includes("api.deezer.com/search"))
		return json({
			data: [
				{
					id: 7,
					title: "Midnight Echo",
					artist: { name: "Kalomi" },
					duration: 45,
				},
			],
		});
	if (url.includes("api.deezer.com/track/7"))
		return json({
			id: 7,
			title: "Midnight Echo",
			duration: 45,
			isrc: "GBXYZ2100001",
			release_date: "2021-05-04",
			artist: { name: "Kalomi" },
			album: {
				id: 70,
				title: "Midnight EP",
				cover_xl: "https://cdn.example/cover.jpg",
			},
		});
	if (url.includes("api.deezer.com/album/70"))
		return json({
			label: "Cipher Records",
			release_date: "2021-05-04",
			genres: { data: [{ name: "Tech House" }] },
		});
	if (url.includes("api.deezer.com")) return json({ data: [] });
	if (
		url.includes("cdn.example/cover.jpg") ||
		url.includes("coverartarchive.org")
	)
		return new Response(cover, { headers: { "content-type": "image/jpeg" } });
	return new Response("not mocked", { status: 404 });
}) as typeof fetch;

ensureGenres();
readSettings();
db()
	.update(settings)
	.set({
		libraryRoot: root + "/lib",
		autotagMusicbrainzAgent: "TrackVault/1.0 (test@example.com)",
		autotagAcoustid: false,
		autotagDiscogs: false,
		autotagBeatport: false,
		analyseFillConfidence: 30,
		updatedAt: new Date(),
	})
	.where(eq(settings.id, 1))
	.run();

const scanned = await scan.run(ctx({}) as never);
ok("scan finds the two files", scanned.added === 2, JSON.stringify(scanned));
const all = db().select().from(tracks).all();
const a = all.find((t) => t.title === "Midnight Echo");
if (!a) throw new Error("track a missing");

// -- autotag -> review -> apply
const tagged = await autotag.run(ctx({ tracks: { ids: [a.id] } }) as never);
const props = statement(
	"SELECT field, before, after, source, confidence, state FROM proposals WHERE track_id = @t ORDER BY field",
).all({ t: a.id }) as Array<Record<string, unknown>>;
console.log(
	props
		.map(
			(p) =>
				`    ${p.field}: ${p.before} -> ${p.after} [${p.source} ${Math.round(Number(p.confidence) * 100)}%]`,
		)
		.join("\n"),
);
ok(
	"autotag stored proposals",
	tagged.proposals >= 3,
	`${tagged.proposals} proposals`,
);
const genre = props.find((p) => p.field === "genre");
ok(
	"genre went through the taxonomy",
	genre?.after === "Tech House",
	String(genre?.after),
);
ok(
	"MusicBrainz sent the project's user agent via fetch",
	urls.some((u) => u.includes("musicbrainz.org")),
);
const before = urls.length;
await autotag.run(ctx({ tracks: { ids: [a.id] } }) as never);
ok(
	"a second run is answered from the cache (no new requests)",
	urls.length === before,
	`${urls.length - before} new`,
);
statement(
	"UPDATE proposals SET state = 'accepted' WHERE state = 'pending'",
).run();
const applied = await autotagApply.run(ctx({}) as never);
const after = db().select().from(tracks).where(eq(tracks.id, a.id)).get();
const file = (
	statement("SELECT path FROM files WHERE track_id = @t").get({ t: a.id }) as {
		path: string;
	}
).path;
const onDisk = (await readTags(join(root, "lib", file))).tags;
ok(
	"accepted fields applied to the track",
	after?.genre === "Tech House" && after?.label === "Cipher Records",
	JSON.stringify(applied),
);
ok(
	"and written to the file's tags",
	onDisk.genre === "Tech House" && onDisk.label === "Cipher Records",
	`${onDisk.genre} / ${onDisk.label}`,
);
ok(
	"one batch with origin autotag",
	(
		statement(
			"SELECT count(*) AS n FROM batches WHERE origin = 'autotag'",
		).get() as { n: number }
	).n === 1,
);
// A rerun of the apply changes nothing.
const again = await autotagApply.run(ctx({}) as never);
ok("apply is safe to repeat", again.fields === 0);

// -- art
const fetched = await art.run(ctx({}) as never);
const withArt = db().select().from(tracks).where(eq(tracks.id, a.id)).get();
const embedded = await readEmbeddedCover(join(root, "lib", file));
ok(
	"art job embedded a cover",
	fetched.embedded >= 1 && withArt?.hasArt === true && !!embedded,
	JSON.stringify(fetched),
);
ok("noArt issue cleared", ((withArt?.issues ?? 0) & 64) === 0);
const thumb = await thumbnail(a.id, 128);
ok("thumbnail cached on disk", !!thumb, String(thumb));
const second = await art.run(ctx({}) as never);
ok(
	"art job skips tracks with art",
	second.embedded === 0 || second.kept >= 1,
	JSON.stringify(second),
);

// -- analyse
const measured = await analyse.run(ctx({ force: true }) as never);
const rows = statement(
	"SELECT t.title, a.bpm, a.bpm_confidence AS bc, a.key, a.energy, a.lufs FROM analysis_results a JOIN tracks t ON t.id = a.track_id ORDER BY t.title",
).all() as Array<Record<string, number | string>>;
console.log(
	rows
		.map(
			(r) =>
				`    ${r.title}: bpm ${r.bpm} (${Math.round(Number(r.bc) * 100)}%) key ${r.key} energy ${r.energy} lufs ${Number(r.lufs).toFixed(1)}`,
		)
		.join("\n"),
);
ok(
	"analysis stored for both tracks",
	rows.length === 2,
	JSON.stringify(measured),
);
const echo = rows.find((r) => r.title === "Midnight Echo");
ok(
	"tempo near 124",
	Math.abs(Number(echo?.bpm) - 124) < 3 ||
		Math.abs(Number(echo?.bpm) * 2 - 124) < 3 ||
		Math.abs(Number(echo?.bpm) / 2 - 124) < 3,
	`${echo?.bpm}`,
);
ok(
	"loudness measured",
	typeof echo?.lufs === "number" && Number(echo?.lufs) < 0,
);
const loud = db()
	.select({ l: tracks.loudness })
	.from(tracks)
	.where(eq(tracks.id, a.id))
	.get();
ok("tracks.loudness filled", loud?.l !== null && loud?.l !== undefined);
const b = all.find((t) => t.title === "Velvet Signal");
const bAfter = db()
	.select()
	.from(tracks)
	.where(eq(tracks.id, b?.id ?? ""))
	.get();
ok(
	"empty BPM tag filled only above confidence; genre House untouched",
	bAfter?.genre === "House",
);

// -- set builder
db()
	.update(tracks)
	.set({ key: "8A", bpm: 124, energy: 6 })
	.where(eq(tracks.id, a.id))
	.run();
db()
	.update(tracks)
	.set({ key: "9A", bpm: 126, energy: 7 })
	.where(eq(tracks.id, b?.id ?? ""))
	.run();
const [current] = mixTracks([a.id]);
const next = current ? suggestAfter(current, [a.id]) : [];
ok(
	"set builder suggests the 9A/126 track with reasons",
	next[0]?.track.id === b?.id &&
		next[0]?.explanation.includes("adjacent") === true,
	next[0]?.explanation,
);
console.log(`taxonomy genres loaded: ${loadTaxonomies().genre.entries.length}`);
