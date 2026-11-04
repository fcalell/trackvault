// What `stack screens serve` seeds: a small real library, made through the hub's own
// procedures and jobs. A few ffmpeg-made files in a scratch library root, a scan, tags,
// a playlist, a duplicate pair, a low-bitrate file, a stored preview and an applied edit.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineServeSeed } from "@fcalell/plugin-screens/serve";
import type { AppRouter } from "../../.stack/worker";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default defineServeSeed<AppRouter>(async ({ client }) => {
	// TODO: STACK_SERVE_DIR is not in the seed's environment (the run's own folder is
	// only the server's); the library root is a folder of its own until it is.
	const dir =
		process.env.STACK_SERVE_DIR ?? mkdtempSync(join(tmpdir(), "tv-seed-"));
	const root = join(dir, "library");
	mkdirSync(root, { recursive: true });

	const make = (
		name: string,
		hz: number,
		bitrate: string,
		tags: Record<string, string>,
	): void => {
		const made = spawnSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-y",
				"-f",
				"lavfi",
				"-i",
				`sine=frequency=${hz}:duration=8:sample_rate=44100`,
				"-ac",
				"2",
				"-b:a",
				bitrate,
				...Object.entries(tags).flatMap(([key, value]) => [
					"-metadata",
					`${key}=${value}`,
				]),
				join(root, name),
			],
			{ encoding: "utf8" },
		);
		if (made.status !== 0) throw new Error(`ffmpeg: ${made.stderr}`);
	};
	make("Kalomi - Midnight Echo.mp3", 220, "192k", {
		title: "Midnight Echo",
		artist: "Kalomi",
		genre: "Tech House",
		label: "Cipher Records",
	});
	// The same recording encoded again, so the scan keeps it as a track of its own.
	make("Kalomi - Midnight Echo (128k).mp3", 220, "128k", {
		title: "Midnight Echo",
		artist: "Kalomi",
		genre: "Tech House",
	});
	make("Rendor - Velvet Signal.mp3", 262, "192k", {
		title: "Velvet Signal",
		artist: "Rendor",
		genre: "tech-house",
		label: "Cipher Records",
	});
	make("Sade Vance - Lowlight.mp3", 330, "192k", {
		title: "Lowlight",
		artist: "Sade Vance",
		genre: "Deep House",
	});
	make("Thorne - Static.mp3", 440, "64k", {
		title: "Static",
		artist: "Thorne",
		genre: "Techno",
	});
	// No tags at all: an issue the library shows.
	make("track 06.mp3", 523, "192k", {});

	const wait = async (id: string): Promise<void> => {
		for (let i = 0; i < 600; i++) {
			const job = await client.jobs.get({ id });
			if (job.state === "done") return;
			if (job.state === "failed" || job.state === "cancelled")
				throw new Error(`${job.kind} ${job.state}: ${job.error ?? ""}`);
			await sleep(100);
		}
		throw new Error(`job ${id} did not finish`);
	};

	await client.settings.update({ libraryRoot: root });
	await wait((await client.scan.start()).id);

	const listed = await client.tracks.list({ limit: 50, offset: 0 });
	const byTitle = (title: string) => {
		const row = listed.data.find((each) => each.title === title);
		if (!row) throw new Error(`the scan did not find ${title}`);
		return row.id;
	};
	const echo = byTitle("Midnight Echo");
	const velvet = byTitle("Velvet Signal");
	const lowlight = byTitle("Lowlight");

	await client.tracks.update({ id: echo, bpm: 124, key: "8A", energy: 7 });
	await client.tracks.update({ id: velvet, bpm: 128, key: "9A", year: 2021 });
	await client.tags.assign({ trackId: echo, names: ["Peak time", "Warm-up"] });
	await client.tags.assign({ trackId: velvet, names: ["Peak time"] });

	const playlist = await client.playlists.create({ name: "Friday night" });
	await client.playlists.add({
		playlistId: playlist.id,
		tracks: { ids: [echo, velvet, lowlight] },
	});

	// The search is a job of its own, queued once the fingerprints are in.
	await wait((await client.dupes.run()).id);
	for (let i = 0; i < 100 && (await client.dupes.status()).open === 0; i++)
		await sleep(100);
	await wait((await client.unifyTags.preview({ fields: ["genre"] })).id);
});
