// Fills the dev database with a synthetic library to measure the hub against:
//   pnpm --filter hub seed:bench [count]     (default 50000)
// The rows look like a DJ collection (artist, genre, BPM and key distributions,
// bitrates, ratings, a few percent with missing tags) and live under the
// "bench/" path prefix, so running it again replaces them. The files do not exist
// on disk: a scan of a real library root marks them missing.
import { createHash } from "node:crypto";
import { getTableColumns, sql } from "@fcalell/plugin-db/orm";
import { createClient } from "@fcalell/plugin-db/sqlite";
import { normalizeTrack } from "@trackvault/core/normalize";
import * as schema from "../src/schema/index.ts";
import { files, settings, tracks } from "../src/schema/index.ts";

const COUNT = Number(process.argv[2] ?? 50_000);
const file = process.env.DB_FILE ?? "./data/trackvault.sqlite";

// A small deterministic generator, so a run is the same every time.
let state = 0x9e3779b9;
const random = (): number => {
	state ^= state << 13;
	state ^= state >>> 17;
	state ^= state << 5;
	return (state >>> 0) / 4294967296;
};
const pick = <T>(items: readonly T[]): T =>
	items[Math.floor(random() * items.length)] as T;
const weighted = <T>(items: ReadonlyArray<readonly [T, number]>): T => {
	const total = items.reduce((sum, [, weight]) => sum + weight, 0);
	let at = random() * total;
	for (const [item, weight] of items) {
		at -= weight;
		if (at <= 0) return item;
	}
	return (items[items.length - 1] as readonly [T, number])[0];
};
const gauss = (mean: number, spread: number): number => {
	let sum = 0;
	for (let i = 0; i < 4; i++) sum += random();
	return mean + (sum - 2) * spread * 1.7;
};

const SYLLABLES = [
	"ka",
	"lo",
	"mi",
	"ra",
	"ten",
	"vo",
	"sol",
	"ar",
	"ne",
	"ix",
	"do",
	"pa",
	"zu",
	"el",
	"bri",
	"an",
	"ko",
	"ve",
	"li",
	"tor",
	"mar",
	"sha",
	"dre",
	"fu",
	"gal",
	"no",
	"py",
	"qui",
	"rem",
	"sy",
];
const WORDS = [
	"Midnight",
	"Echo",
	"Signal",
	"Velvet",
	"Drift",
	"Neon",
	"Gravity",
	"Horizon",
	"Pulse",
	"Ritual",
	"Circuit",
	"Ghost",
	"Silver",
	"Ocean",
	"Static",
	"Mirror",
	"Fever",
	"Lunar",
	"Atlas",
	"Ember",
	"Harbor",
	"Cipher",
	"Aurora",
	"Monolith",
	"Tides",
	"Wire",
	"Orbit",
	"Paper",
	"Violet",
	"Kinetic",
	"Shadow",
	"Glass",
	"Thunder",
	"Silk",
	"Rain",
	"Fire",
	"Dust",
	"Sky",
	"Heat",
	"Stone",
	"Dawn",
	"Night",
	"Gold",
	"Wave",
	"Loop",
	"Bass",
	"Vision",
	"Dream",
];
const MIXES = [
	"Original Mix",
	"Extended Mix",
	"Radio Edit",
	"Club Mix",
	"Dub Mix",
	"Instrumental",
];
const GENRES: ReadonlyArray<readonly [string, number, number]> = [
	// name, weight, typical BPM
	["House", 22, 124],
	["Tech House", 14, 126],
	["Techno", 14, 132],
	["Deep House", 8, 120],
	["Progressive House", 6, 126],
	["Trance", 6, 138],
	["Drum & Bass", 6, 174],
	["Hip-Hop", 5, 90],
	["Disco", 4, 118],
	["Electro", 4, 128],
	["Afro House", 3, 122],
	["Dubstep", 3, 140],
	["Pop", 3, 110],
	["Ambient", 2, 80],
];
const KEYS = Array.from({ length: 12 }, (_, i) => [
	`${i + 1}A`,
	`${i + 1}B`,
]).flat();
const LABELS = Array.from(
	{ length: 400 },
	(_, i) =>
		`${pick(WORDS)} ${pick(["Records", "Music", "Recordings", "Audio", "Black", "Cuts"])}${i % 7 === 0 ? ` ${i}` : ""}`,
);

const name = (): string => {
	const parts = 2 + Math.floor(random() * 2);
	let out = "";
	for (let i = 0; i < parts; i++) out += pick(SYLLABLES);
	return out.charAt(0).toUpperCase() + out.slice(1);
};
// A few hundred prolific artists and a long tail, as a collection has.
const ARTISTS = Array.from({ length: 4000 }, name);
const artist = (): string => {
	const index = Math.floor(ARTISTS.length * random() ** 2.2);
	const main = ARTISTS[index] as string;
	const roll = random();
	if (roll < 0.08) return `${main} & ${pick(ARTISTS)}`;
	if (roll < 0.11) return `${main} feat. ${pick(ARTISTS)}`;
	return main;
};

const database = createClient(file, schema);
const sqlite = (
	database as unknown as {
		$client: {
			pragma(s: string): unknown;
			prepare(s: string): { run(p: unknown): unknown };
			transaction<T>(f: () => T): () => T;
		};
	}
).$client;
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = OFF");
sqlite.pragma("cache_size = -131072");

const columns = Object.values(getTableColumns(tracks));
const insertTrack = sqlite.prepare(
	`INSERT INTO tracks (${columns.map((c) => `"${c.name}"`).join(", ")}) VALUES (${columns.map((c) => `@${c.name}`).join(", ")})`,
);
const insertFile = sqlite.prepare(
	"INSERT INTO files (track_id, path, size, mtime_ms, inode, file_hash, state, scanned_at) VALUES (@track_id, @path, @size, @mtime_ms, @inode, @file_hash, 'ok', @scanned_at)",
);

// The settings row, and the version the rows carry.
database
	.insert(settings)
	.values({ id: 1, updatedAt: new Date() })
	.onConflictDoNothing()
	.run();
const started = Date.now();

const clear = sqlite.transaction(() => {
	database.run(
		sql`DELETE FROM tracks WHERE id IN (SELECT track_id FROM files WHERE path LIKE 'bench/%')`,
	);
	database.run(sql`DELETE FROM files WHERE path LIKE 'bench/%'`);
});
clear();

const version = database
	.update(settings)
	.set({
		libraryVersion: sql`${settings.libraryVersion} + 1`,
		updatedAt: new Date(),
	})
	.returning({ version: settings.libraryVersion })
	.get()?.version as number;

const firstSeq =
	(
		database
			.select({ seq: sql<number>`coalesce(max(${tracks.seq}), 0)` })
			.from(tracks)
			.get() as { seq: number }
	).seq + 1;
const now = Date.now();
const seen = new Set<string>();
const run = sqlite.transaction(() => {
	for (let i = 0; i < COUNT; i++) {
		const [genre, , baseBpm] = weighted(GENRES.map((g) => [g, g[1]] as const));
		const bpm = Math.round(gauss(baseBpm, 3) * 10) / 10;
		const mix = weighted([
			[MIXES[0], 50],
			[MIXES[1], 25],
			[MIXES[2], 10],
			[MIXES[3], 8],
			[MIXES[4], 4],
			[MIXES[5], 3],
		] as const);
		const base = `${pick(WORDS)} ${pick(WORDS)}${random() < 0.2 ? ` ${pick(WORDS)}` : ""}`;
		const title = random() < 0.85 ? `${base} (${mix})` : base;
		const by = artist();
		const tagless = random();
		const album =
			random() < 0.7
				? `${pick(WORDS)} ${pick(["EP", "LP", "Sessions", `Vol. ${1 + Math.floor(random() * 9)}`])}`
				: null;
		const label = random() < 0.8 ? pick(LABELS) : null;
		const bitrate = weighted([
			[320, 70],
			[256, 8],
			[192, 6],
			[128, 6],
			[245, 10],
		] as const);
		const normalized = normalizeTrack({ title, artist: by, album, label });
		const noGenre = tagless < 0.03;
		const noBpm = tagless > 0.03 && tagless < 0.06;
		const noKey = tagless > 0.06 && tagless < 0.1;
		const hasArt = random() < 0.92;
		const durationMs = Math.round(Math.max(60, gauss(330, 70)) * 1000);
		const issues =
			(bitrate < 256 ? 1 : 0) |
			(noGenre ? 8 : 0) |
			(noBpm ? 16 : 0) |
			(noKey ? 32 : 0) |
			(hasArt ? 0 : 64);
		let hash = createHash("sha256").update(`bench-${i}`).digest("hex");
		while (seen.has(hash))
			hash = createHash("sha256").update(hash).digest("hex");
		seen.add(hash);
		const id = `bench-${i.toString(36).padStart(6, "0")}`;
		const added = now - Math.floor(random() ** 1.5 * 3 * 365 * 86400 * 1000);
		insertTrack.run({
			id,
			seq: firstSeq + i,
			audio_hash: hash,
			fingerprint: null,
			title,
			artist: by,
			artists: normalized.artistsKey || null,
			remixer: normalized.remixer,
			mix_name: normalized.mixName,
			album,
			album_artist: null,
			label,
			genre: noGenre ? null : genre,
			genre_id: null,
			year: random() < 0.9 ? 2010 + Math.floor(random() ** 0.6 * 16) : null,
			release_date: null,
			isrc: null,
			bpm: noBpm ? null : bpm,
			key: noKey ? null : pick(KEYS),
			energy: random() < 0.6 ? 1 + Math.floor(random() * 10) : null,
			loudness: null,
			rating: weighted([
				[0, 55],
				[1, 3],
				[2, 6],
				[3, 14],
				[4, 14],
				[5, 8],
			] as const),
			colour:
				random() < 0.15
					? pick(["red", "orange", "green", "blue", "purple"])
					: null,
			comment: random() < 0.1 ? pick(WORDS) : null,
			play_count: 0,
			last_played_at: null,
			format: "mp3",
			bitrate,
			sample_rate: 44100,
			duration_ms: durationMs,
			size: Math.round((durationMs / 1000) * bitrate * 125),
			has_art: hasArt ? 1 : 0,
			issues,
			block_key: normalized.blockKey === "|" ? null : normalized.blockKey,
			added_at: added,
			updated_at: added,
			version,
		});
		insertFile.run({
			track_id: id,
			path: `bench/${by.replace(/[^\w ]/g, "")}/${String(i).padStart(6, "0")} ${title.replace(/[^\w ()]/g, "")}.mp3`,
			size: Math.round((durationMs / 1000) * bitrate * 125),
			mtime_ms: added,
			inode: 10_000_000 + i,
			file_hash: createHash("sha256").update(`file-${i}`).digest("hex"),
			scanned_at: now,
		});
	}
});
run();
sqlite.pragma("wal_checkpoint(TRUNCATE)");
sqlite.pragma("optimize");

const took = Date.now() - started;
console.log(
	`seeded ${COUNT} tracks in ${took} ms (${Math.round((COUNT / took) * 1000)} rows/s) into ${file}; library version ${version}`,
);
void files;
