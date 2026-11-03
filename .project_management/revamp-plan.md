# TrackVault Revamp — Plan

What it's for: `vision.md`. This file covers how: architecture on `@fcalell/stack`, performance design, data model, UI, phases, stack gaps and open decisions.

Ground rules (from the owner):
- A full move to stack. No backwards compatibility, no tests, code directly.
- Old code is a reference only: rewrite everything.
- Performance is the top priority.

## 1. What changes from today

| Today | Revamp |
|---|---|
| Electron app, SolidJS, Kobalte, TanStack Solid | Stack app: `node()` target, React + `reactUi()` roster, served by the hub and opened in any browser |
| Hand-wired Hono + oRPC over Electron IPC | `api()` procedures with `reads`/`writes` (cache invalidation for free) |
| Drizzle + better-sqlite3, two DBs (library and desktop) | `db({ dialect: "sqlite" })` on the hub. The local-only half moves to the agent's own state |
| `node-id3` (MP3 only) + `music-metadata` | One tag layer for MP3/AIFF/WAV/FLAC/M4A (read and write) |
| Scan reads files one at a time on the request thread, so rescans block | Worker-thread pool, incremental by stat, file watcher, durable jobs with live progress |
| Dedupe compares every track with every other (O(n²)), with bigram similarity | Tiered: hash → fingerprint (LSH) → fuzzy with blocking. Roughly O(n) |
| The UI holds every track, the table isn't windowed | Server-side search, sort and filter behind stack's windowed pagination (built in stack, §4), live updates over WS |
| Bitrate threshold setting ignored, `check-types \|\| true` | Gone with the rewrite. `pnpm check` is the real gate |

Ideas worth keeping from the old code:
- path-safety checks (nothing leaves the library root)
- organiser token patterns and presets
- facet and issue counts in the sidebar
- the three editing modes: inline, record and bulk
- the standard genre list as the seed of the taxonomy

## 2. Topology

```
           browser (any PC / phone)
                    │  https (LAN or Tailscale)
┌───────────────────▼─────────────────────────────── homelab ──┐
│ hub: stack app, node() target                                 │
│  ├─ worker: oRPC procedures, auth, MCP                        │
│  ├─ services: jobs · scanner/watcher · analyzer · media       │
│  │            · sync (/sync + ws) · slskd bridge              │
│  ├─ SQLite (WAL)          /data/trackvault.sqlite             │
│  └─ file store            /music (library root, read/write)   │
│ slskd (sidecar)  ── REST ──▶ hub                              │
└──────────────────────────────▲────────────────────────────────┘
                               │ /sync (HTTP range + ws)
             ┌─────────────────┴─────────────────┐
     agent @ each Rekordbox machine         agent @ PC without Rekordbox (optional)
     local replica of /music                uploads a local folder → inbox
     Rekordbox bridge (master.db, ANLZ)
```

- **Hub** = the stack app. It is the only writer of the DB and the files.
- **Hosting:** the hub is one Node 24 process (`node .stack/server.ts`), with slskd beside it.
  - The process manager is still open: systemd, Docker or whatever the homelab already runs. Nothing in the app depends on the choice.
  - External binaries (`fpcalc`, `ffmpeg`, `audiowaveform`) are found on `PATH` and checked at startup.
- **Agent** = a plain Node 24 daemon/CLI in the same repo. It is not a stack app, because it has no UI. It talks to the hub over `/sync` (a `http.mount` endpoint) and a WS channel. On macOS it carries the Rekordbox bridge.
- **Identity:** a track's identity is its **audio-content hash** (the audio frames, tags excluded). Tag edits don't change identity, and moves and renames are detected for free. The hub's `trackId` is a UUID mapped to the hash.

## 3. Repo layout

```
trackvault/
  pnpm-workspace.yaml
  apps/
    hub/                         stack consumer
      stack.config.ts            node, db(sqlite), auth, api, vite, react, reactUi, screens
      src/schema/index.ts
      src/worker/routes/*.ts     library, tracks, playlists, tags, quality, organize,
                                 autotag, inbox, downloads, devices, jobs, settings
      src/worker/mcp.ts
      src/server/services/*.ts   jobs, scanner, watcher, analyzer, media, sync, slskd
      src/shared/channels.ts     library, jobs, transfers, devices
      src/app/routes/**          UI
    agent/                       Node daemon: pair, sync, watch, rekordbox
  packages/
    core/                        pure domain code shared by hub and agent:
                                 tags io, audio hash, fingerprint, normalize/similarity,
                                 patterns, rules engine, rekordbox reader/writer
  deploy/                        homelab notes and unit/compose files, once hosting is chosen
```

All work lands directly on `master` (trackvault) and `master` (stack). There are no feature branches.

The old `.claude/rules/*` and `.knowledge/` (Solid/Electron) are deleted. `CLAUDE.md` imports stack's generated `.stack/guide.md` plus a short TrackVault page.

## 4. Performance design

**Budgets at 50k tracks** (measured on a seeded synthetic library, `pnpm seed:bench`):

| Action | Budget |
|---|---|
| Library first paint (first window) | < 300 ms |
| Window query on the hub (search/filter/sort, 200 rows) | < 10 ms |
| Search/filter/sort to new rows on screen, LAN | < 50 ms |
| Scroll / jump anywhere | 60 fps, rows painted until loaded, < 100 ms to land |
| Select all | < 50 ms (a query, not 50k ids) |
| Rescan with no changes | < 5 s (stat only) |
| First scan | ≥ 300 files/s on SSD |
| Dedupe of the whole library | < 30 s |
| Bulk tag write of 1k files | background, < 30 s, UI unaffected |

**How:**
1. **Windowed library read, built in stack.** The library is one paginated procedure. Its input carries search, facets and sort, and SQLite does the work. The client only ever holds the rows near the view.
   - **Why not load everything into the browser:** it scales to any library size, keeps a constant payload, and gives the same speed over Tailscale as on the LAN for scrolling. The keystroke budget becomes one indexed query, a few ms on the hub plus the round trip.
   - Stack's current pagination doesn't fit. It is a keyset cursor on `createdAt` only, max 100 rows, loaded by pressing "Show more", and `Table` sorts the loaded rows on the client.
   - The stack work, done in `fcalell/stack` before R0's library screen (see S1–S6 below):

   | # | Stack change |
   |---|---|
   | S1 | **Window mode:** `paginated: "window"` answers `{ data, total, offset }` for an `offset` and `limit`. The collection sizes its scroller to `total` and fetches the pages the viewport and overscan cover, wherever the scrollbar is dragged. Rows not loaded yet paint. Pages are cached with eviction past a bound. A filter or sort change is a new key, and the old window stays drawn until the first page lands |
   | S2 | **Sort through the input:** a `Table` over a paginated read sends its header sort into the read's input (`sort: { column, direction }`, typed from the procedure) instead of sorting the loaded rows |
   | S3 | **Keyset on any column:** for cursor mode, `paginate` takes one or more sort columns plus the id tiebreak, instead of `createdAt` only |
   | S4 | **Scroll loading:** a windowed collection over cursor pages fetches the next page as the end nears. "Show more" stays for short lists |
   | S5 | **Limits:** a per-procedure `maxLimit` (the library uses pages of 200) |
   | S6 | **Selection over a query:** `choose` can hold "all N matching, except these ids". Acts receive `{ ids } \| { query, except }`, so select-all on 50k sends one request |

   - **Live updates:** the `library` channel broadcasts `{ ids, version }` after each write. The client patches loaded rows whose ids it holds and refetches loaded windows when the order or total may have moved. (Stack's channel/cache glue covers this; anything missing joins S1.)
   - **Payload:** a page holds only the columns the table draws. The full record loads on open.
2. **SQLite tuning.** WAL, `synchronous=NORMAL`, mmap, an index on every facet column.
   - An FTS5 table (prefix indexes) drives library search, MCP, smart playlists and Soulseek matching.
   - A covering index for each sortable column with the id tiebreak, so a window is an index range scan. `total` comes from the same filtered query, and the unfiltered count is cached by version.
   - Writes go in batched transactions of 1k rows.
   - Facet counts are maintained incrementally, not recomputed per request.
3. **Scanner.**
   - A `worker_threads` pool sized to `os.availableParallelism()`.
   - Each pass stats everything and parses only files whose (size, mtime, inode) changed.
   - The hash is streamed. Tag parsing skips covers.
   - Recursive `fs.watch`, plus a periodic reconcile pass. The inotify watch limit (`fs.inotify.max_user_watches`) is raised on the homelab.
4. **Jobs.** Every bulk or slow operation (scan, analyse, tag-write, organise, dedupe, sync, auto-tag, download) is a row in `jobs`.
   - The `jobs` service runs them with per-kind concurrency.
   - Progress streams over the `jobs` channel.
   - Jobs survive restarts and resume.
5. **Dedupe.**
   - Exact: group by audio hash.
   - Acoustic: Chromaprint (`fpcalc`), with locality-sensitive hashing (LSH) over fingerprint segments to find candidates, then compared by bit error rate.
   - Fuzzy: block on a normalised `artist|title` key with the mix name stripped, then compare only within each block.
   - Results are cached and only recomputed for changed tracks.
6. **Media.**
   - `/media/:trackId` is served through `http.mount` with HTTP Range support.
   - Waveform peaks are precomputed once (`audiowaveform`/ffmpeg) and stored as a small binary file.
   - Cover thumbnails are pre-sized.
7. **Sync.**
   - Content-addressed by audio hash plus file hash.
   - The agent pulls a manifest diff since its cursor, then pulls only missing or changed files with resumable range requests.
   - A tag-only change re-sends the file. The tag layer may later support sending the tag block only.

## 5. Data model (hub)

| Table | Holds |
|---|---|
| `tracks` | `id`, `seq` (the number FTS addresses the row by), `audioHash`, `fingerprint`; title, artist, artists (normalised), remixer, mixName, album, albumArtist, label, `genreId`, year, releaseDate, isrc; bpm, key (Camelot), energy, loudness; rating, colour, comment; format, bitrate, sampleRate, durationMs, size; `hasArt`, quality flags; `addedAt`, `updatedAt`, `version` |
| `files` | trackId, relative path, size, mtime, inode, fileHash, state (ok/missing/quarantined) |
| `genres`, `genreAliases` | the taxonomy and its aliases |
| `artistAliases`, `labelAliases` | unification maps |
| `tags`, `trackTags` | custom tags (Rekordbox My Tag mapping) |
| `playlists`, `playlistItems` | tree (folder/manual/smart), smart rules as JSON, fractional `position`, `rekordboxId` |
| `cues`, `beatgrids` | imported from Rekordbox, keyed by track |
| `plays` | play history (Rekordbox import) |
| `changes` | the op log: seq, entity, id, field, before, after, origin (ui/rule/autotag/rekordbox/agent), batchId, at. Drives undo, history, sync cursors and Rekordbox writes |
| `jobs` | kind, state, progress, payload, result, error |
| `rules` | cleanup and ingest rules |
| `inbox` | arriving items and their pipeline state |
| `wishlist`, `downloads` | Soulseek wants and transfers (slskd ids) |
| `devices`, `deviceFiles`, `rekordboxLinks` | agents, their sync cursor and local root; per-device file state; mapping from `DjmdContent` id to track |
| `analysisBlobs` | ANLZ files by content hash, per track, with the device they came from |
| `conflicts` | fields and playlists changed on two sides, with both values, until reviewed |
| `settings` | a single row |

The agent's local state (a small SQLite file of its own) holds its cursor, the local path map and the Rekordbox base snapshot.

## 6. Rekordbox bridge (agent, macOS and Windows)

### Access
- **Read:**
  - `master.db` is SQLCipher (Rekordbox 6/7). Open it with `better-sqlite3-multiple-ciphers`, using the publicly known key handling that pyrekordbox uses. Verify this against Rekordbox 7.
  - While Rekordbox runs, the agent reads a copy of `master.db` plus its WAL, so it never touches the live file.
  - ANLZ files (`.DAT/.EXT/.2EX`): cues, beatgrid, waveform.
- **Write:** direct `master.db` writes.
  - Only when Rekordbox is not running.
  - After a timestamped backup (the last N are kept).
  - Only for an allowlist of tested `master.db` schema versions.
  - Everything in one transaction.
  - An unsupported version falls back to a rekordbox XML export for manual import.
- **Where:** `~/Library/Pioneer/rekordbox` on macOS, `%APPDATA%\Pioneer\rekordbox` on Windows. The agent is the same code on both.

### Several Rekordbox installs

Every Rekordbox install is a **device** on the hub, and each `master.db` is a replica of part of the hub's model.
- Each install has its own `DjmdContent` ids, paths and analysis. They never leave the device.
- The hub maps them in `rekordboxLinks` (device, `contentId`, `trackId`).
- Tracks are matched by local path first, audio hash second.

**Who owns what:**

| Data | Owner | Flow |
|---|---|---|
| Tags (title, artist, genre…), rating, colour, comment, My Tags | Hub | Edited anywhere. Changes made in Rekordbox are imported, merged on the hub, then written to every install |
| Playlists (tree, membership, order) | Hub | Same: built in TrackVault or Rekordbox, merged on the hub, written everywhere |
| Cues, hot cues, loops, beatgrid | Performance data, authored in Rekordbox | Imported from the install that changed them, merged on the hub (per track, latest wins), then written to the other installs (`DjmdCue`; ANLZ files copied whole as blobs, see below) |
| Analysis (waveform, BPM/key detection) | Per device | ANLZ files are synced as content-addressed blobs, so an install doesn't have to re-analyse. Otherwise Rekordbox analyses on its own |
| Play history | Per device | Imported and added to the hub's `plays`. Never written back |
| Paths, `contentId`, analysis paths | Per device | Never synced. The agent writes its own local paths |

**The sync cycle**, per agent, on `master.db` change or startup:
1. **Snapshot.** The agent keeps the last state it synced (the base): per track the owned fields' values, and per playlist its ordered ids.
2. **Import.** It diffs the current `master.db` against the base, which gives exactly what changed in Rekordbox since the last sync. Those changes become `changes` rows on the hub, with origin `rekordbox:<device>`.
3. **Merge on the hub:**
   - Fields: a three-way merge per field (base, hub, device). A field changed on only one side takes that side. A field changed on both takes the later timestamp, and the conflict is recorded so the UI can show "changed on Mac and in TrackVault".
   - Playlists: membership adds and removes from both sides are merged as sets. If both sides reordered, the later order wins and the other is recorded.
4. **Export** (when Rekordbox is closed): the agent applies everything on the hub since its cursor that it hasn't already applied.
   - New tracks become `DjmdContent` rows pointing at the local replica, linked to their ANLZ blobs when known.
   - Merged fields, playlists and cues are written. Moves are relinked through `FolderPath`.
   - The new state becomes the base and the cursor advances.
5. **Rekordbox open:**
   - Importing still works (from the copy).
   - Export waits. The agent watches for Rekordbox to quit and then applies.
   - The UI shows "N changes waiting for Rekordbox to close on <device>".

**Rules:**
- **Rekordbox Cloud Library Sync must be off** on installs TrackVault manages. Two sync systems would fight over the same rows. The agent detects it and refuses to export while it's on.
- A track can be missing on a device (not synced yet, or excluded). It is left out of that device's playlists and shown in the UI, never deleted from Rekordbox.
- Deleting in Rekordbox removes the track from that device's collection only. Library deletes happen in TrackVault, go to quarantine on the hub, and are removed from every install on its next export.

**To verify before R2 write work:**
- Rekordbox 7's key handling.
- Which fields Rekordbox reads from `master.db` and which from ANLZ (do cues written only to `DjmdCue` show up?).
- Whether copying ANLZ files between installs is accepted.

A spike in R2 answers these on a throwaway install before anything is written to a real library.

## 7. Soulseek

- **slskd** runs beside the hub on the homelab. The hub's `slskd` service uses its REST API (with an API key) for search, enqueue and transfer status, and pushes progress to the `transfers` channel.
- Search results are ranked by format, bitrate, a fake-bitrate heuristic and how free the peer's upload slots are. Each result shows "already in library" (fuzzy and, after download, fingerprint).
- Finished downloads go to `/inbox`, then the inbox pipeline.
- A native protocol client is not planned. Reconsider only if slskd blocks something.

## 8. UI (stack roster, judged against Linear)

**Sidebar places** (Devices also lists open Rekordbox conflicts):

| Group | Places |
|---|---|
| Library | All tracks · Recently added · Inbox |
| Playlists | tree: folders, manual, smart |
| Curate | Issues · Duplicates · Organiser · Cleanup rules |
| Tags | Genres · Custom tags · Aliases |
| Discover | Search (Soulseek) · Wishlist · Transfers |
| System | Devices · Jobs · Settings |

**Key screens:**
- **Library:**
  - `Pane` with a `Toolbar`: search and facet filters.
  - Windowed `Table`: title, artist, mix, BPM, key, genre, rating, time, format/bitrate, added.
  - Inline edit on text columns. Row selection (`choose`) with acts: edit tags, add to playlist, organise, auto-tag, delete.
  - Opening a row shows the track record `Pane`: name, fact pills, waveform, cues, versions/duplicates, playlists, history.
- **Bulk edit:** a `Sheet` with a `Form`. Before applying, a preview `Table` of `change` cells (before → after). The same preview is reused by cleanup rules, genre unify, auto-tag and the organiser.
- **Duplicates:** groups as bands, with the keeper pre-picked and the reason shown. Merge moves cues, playlists and tags.
- **Jobs and transfers:** live rows with progress (`Stats`/`Stages`).
- **Devices:** sync state per device, Rekordbox status (last import/write, version, supported or not).
- **Player:** a persistent transport with waveform, and keyboard control (space, arrows, J/K). This is a stack gap, see §10.

## 9. Phases

Each phase ends in a usable app at 50k tracks within budget.

**R0 — Foundation**
0. **Stack first** (in `fcalell/stack`): pagination S1–S6 (§4), the player dock (G1) and the waveform (G2).
1. Wipe the old code. Set up the workspace and the hub stack app (`node`, `db sqlite`, `auth` passkey for a single owner, `api`, `vite`, `react`, `reactUi`, `screens`).
2. `packages/core`: tag IO (MP3 for now, behind a format-agnostic interface), audio hash, normalise.
3. Hub schema: tracks, files, jobs, changes, settings.
4. Services:
   - jobs runner and the `jobs` channel
   - scanner pool and watcher
   - media (Range, peaks)
   - library index plus the `library` delta channel
5. UI:
   - shell
   - library table with search, facets and sort
   - track record
   - inline and record editing (writes the file through a job)
   - Settings: library root, browsed on the hub's filesystem
   - player (on G1/G2)
6. A bench seed script with 50k synthetic tracks, and the budgets verified.
7. The hub running on the homelab (process manager picked then).

**R1 — Curation**
1. Change log UI and undo per batch.
2. Bulk edit with a diff preview.
3. Genre taxonomy and aliases, artist and label aliases.
4. Custom tags.
5. Cleanup rules engine, on demand and on ingest.
6. Organiser v2 (templates, conditionals, collisions, undo).
7. Quarantine.
8. Health checks: corrupt, fake bitrate, low bitrate, missing fields or art.
9. Dedupe v2 (three tiers) and merge.

**R2 — Playlists, sync, Rekordbox**
0. **Stack first:** drag and drop (G3) and the device credential (G4).
1. Playlists: tree, manual with ordering, smart rules.
2. Agent: pairing, manifest sync, resumable pulls, local watch and upload to the inbox.
3. Devices UI.
4. **Rekordbox spike** on a throwaway install: Rekordbox 7's key handling, cue storage, ANLZ copying (§6).
5. Rekordbox read: collection, playlists, cues, grids, history, analysis. Base snapshot and import as `changes`.
6. Three-way merge on the hub, `conflicts` and the conflicts UI.
7. Rekordbox write: playlists, tags, rating, colour, My Tags, cues, relinks. Export on Rekordbox quit, backups, version allowlist, Cloud Library Sync guard.
8. Multiple installs: ANLZ blob sync, per-device missing tracks.

**R3 — Acquisition**
0. Formats: AIFF, WAV, FLAC, M4A in the tag layer, scanner and Rekordbox bridge (Soulseek brings lossless).
1. Inbox pipeline: hash → fingerprint → dedupe check → rules → auto-tag (when R4 has landed) → organise → approve.
2. The slskd sidecar and the Soulseek UI.
3. Wishlist with auto-search.
4. Playlist import (Spotify, Beatport, 1001tracklists) with library matching.

**R4 — Intelligence**
1. Auto-tag providers (MusicBrainz/AcoustID, Discogs, Beatport, Deezer) with a review UI.
2. Cover art.
3. Analysis for non-Rekordbox tracks: BPM, key, LUFS, energy.
4. Harmonic next-track suggestions and the set builder.
5. Freshness views.
6. MCP server with tools.
7. Stats.

**R5 — Reach**
1. Phone app.
2. Backups and retention.
3. S3/R2 file store.
4. USB/CDJ export (research).

## 10. Stack gaps

Decided (D8): each gap is built in `fcalell/stack` (on `master`, following stack's own rules and catalog) before the TrackVault work that needs it. Only the work that needs a gap waits for it.

| # | Gap | Needed by |
|---|---|---|
| S1–S6 | Pagination: window mode, sort through the input, keyset on any column, scroll loading, per-procedure limits, selection over a query (§4) | R0 library |
| G1 | Audio transport: a persistent player dock in the `Shell` (play/pause, seek, volume, keyboard) | R0 |
| G2 | Waveform drawing (peaks → canvas, playhead, cue markers) | R0 |
| G3 | Drag and drop: rows → playlist place, reorder within a playlist | R2 |
| G4 | Device credential for non-browser clients (agent bearer token / API key). Check native sessions first | R2 |
| G6 | Table at scale: column show/hide, many columns, keyboard row navigation and actions. Check what `Table` has first | R0 |
| G7 | SQLite extras in `db()`: FTS5 virtual tables and triggers, pragmas on open. Check whether `stack db generate` keeps hand-written SQL first | R0 |
| G8 | Server folder browser (choosing the library root on the hub) | R0, with a path field until then |

Landed in stack: S1–S6, G1, G2, G6 (the Table's columns menu, keyboard rows, row act on a key), G7 (`ftsTable`, pragmas) and the device credential (G4). G8 was built in the app (`fs.browse`, owner-only, and a `Sheet` of folder rows in Settings), since it needs no stack part.

Gaps found building the library (R0):
- `paginateWindow` takes columns only: it cannot order by `collate nocase` or `bm25`, nor join the FTS table, so `tracks.list` builds its own page (ids first, then rows) and keeps `paginated: "window"`, `sort` and `maxLimit` for the client.
- `stack db generate` swallows drizzle-kit's interactive rename prompt (a column added and another dropped in one table) when there is no TTY, and still writes the FTS migration; it reports "No schema changes". Such a change is made in two steps.
- The generated `.stack/biome.json` lists `files.includes: ["!src/migrations"]` alone; in an app's `extends` chain it replaces the shared include list and Biome checks 0 files.
- Biome's `useValidAriaRole` flags `<Text role="meta">` (the type role); the app silences it on the line.

Gaps found building R2:
- A Shell place cannot nest: `PlaceSpec` (ui-core `descriptors.ts`) has `group` and no children, so the playlist tree is flat in the sidebar (the folder path is in the label); only a `Section` row has `children`.
- `stack db generate` cannot read a `sqliteView(...).as(qb => ...)` in the schema: drizzle-kit fails with `TypeError: query.inlineParams is not a function at ManualViewBuilder.as`, so smart tags use a join in core/smart instead of a view.

Gaps found building R3:

- The nested sidebar (`PlaceSpec.children`) fails the screens floor `inset` when a folder is open: `stack screens test --screen /_app/playlists/\$playlistId --mode light` reports `at 1280px, inset: div[treeitem].gap-gap.min-h-control < div[tree] < div < div "Peak time" x2 measured padding-left 28px, expected ... (nearest: section, 24px)` (also at 1920). The indent is the Shell's own, so the hub cannot fix it.

Gaps found building R4:
- `scripts/seed-bench.ts` had gone stale against R3's `tracks.codec` (a hub script, not stack): fixed in R4, which also gives the seed plays and loudness.

Gaps found building R5 (phone), still open:
- The workspace's global `react`, `@tanstack/react-query` and `@orpc/tanstack-query` overrides point at the web's copies (React 19.3); the phone needs stack's phone copies (React 19.2.3 with React Native 0.85), so `pnpm-workspace.yaml` has `phone>`-scoped overrides, and every phone dependency (`expo-audio` included) is a `link:` to `stack/apps/phone/node_modules`. A fresh stack checkout without `pnpm install` run in stack/apps/phone leaves those links dangling.
- `tsc` on the phone needs `allowImportingTsExtensions` because the hub's declaration references `@trackvault/core` sources by `.ts` path.
- The phone screens were type-checked and linted only: no emulator is available here (`phone-render.md`, `phone-capture.md` need one), so nothing has been drawn or run, the dock, the lock screen and the sign-in included.

Hosting files (unit/compose) are app work, not a gap: `stack deploy` ships nothing on the node target.

## 11. Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | Where the files live | **Hub is the source of truth** (homelab disk). PCs work through the browser, each Rekordbox machine holds a replica |
| D2 | Desktop shell | **Drop Electron.** Browser or installed PWA |
| D3 | Formats | MP3 first. **AIFF, WAV, FLAC, M4A in R3**, behind a format-agnostic tag layer from R0 |
| D4 | Soulseek | **slskd sidecar** |
| D5 | Rekordbox write path | **Direct `master.db`** (Rekordbox closed, backed up, version allowlist), XML fallback. Several installs as in §6 |
| D6 | Users | **Single owner**, one personal organization |
| D7 | Track identity | **Audio-content hash** |
| D8 | Stack gaps | **Built in stack first**, including pagination (S1–S6) |
| D9 | Network | LAN plus Tailscale, with a stable HTTPS origin for passkeys |
| D10 | Hosting | Homelab. Process manager (systemd, Docker…) still open, decided at R0 step 7 |
| D11 | Branches | Work directly on `master` in both repos |
