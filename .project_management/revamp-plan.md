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
| The UI holds every track, the table isn't windowed | Compact library index + live deltas over WS, stack's windowed `Table` |
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
┌───────────────────▼─────────────── homelab (docker compose) ─┐
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
     agent @ DJ Mac                         agent @ PC (optional)
     local replica of /music                uploads a local folder → inbox
     Rekordbox bridge (master.db, ANLZ)
```

- **Hub** = the stack app. It is the only writer of the DB and the files.
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
  docker/                        Dockerfile (hub), compose.yaml (hub + slskd)
```

The old `.claude/rules/*` and `.knowledge/` (Solid/Electron) are deleted. `CLAUDE.md` imports stack's generated `.stack/guide.md` plus a short TrackVault page.

## 4. Performance design

**Budgets at 50k tracks** (measured on a seeded synthetic library, `pnpm seed:bench`):

| Action | Budget |
|---|---|
| Library first paint, warm (cached) | < 300 ms |
| Library cold load over LAN | < 1.5 s |
| Search/filter per keystroke | < 16 ms target, 50 ms max |
| Sort any column | < 100 ms |
| Scroll / select-all | 60 fps / < 50 ms |
| Rescan with no changes | < 5 s (stat only) |
| First scan | ≥ 300 files/s on SSD |
| Dedupe of the whole library | < 30 s |
| Bulk tag write of 1k files | background, < 30 s, UI unaffected |

**How:**
1. **Library index read.** One procedure returns every track in a compact tuple form, keyed by `libraryVersion`. Only the columns the table draws go in it; full records load on open.
   - Deltas (upserts and deletes since a version) arrive over the `library` WS channel.
   - The client keeps one in-memory index: filter, sort and search run there, on precomputed lowercase search keys, inside a Web Worker if the main thread ever exceeds the budget.
   - Stack's `Table` windows the rows (from 50 loaded rows).
   - Don't use `paginated: true`: it caps a page at 100 rows behind a "Show more" button.
2. **SQLite tuning.** WAL, `synchronous=NORMAL`, mmap, an index on every facet column.
   - An FTS5 table for server-side search (MCP, smart playlists, Soulseek matching).
   - Writes go in batched transactions of 1k rows.
   - Facet counts are maintained incrementally, not recomputed per request.
3. **Scanner.**
   - A `worker_threads` pool sized to `os.availableParallelism()`.
   - Each pass stats everything and parses only files whose (size, mtime, inode) changed.
   - The hash is streamed. Tag parsing skips covers.
   - Recursive `fs.watch`, plus a periodic reconcile pass (inotify limits are documented in the compose file).
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
| `tracks` | `id`, `audioHash`, `fingerprint`; title, artist, artists (normalised), remixer, mixName, album, albumArtist, label, `genreId`, year, releaseDate, isrc; bpm, key (Camelot), energy, loudness; rating, colour, comment; format, bitrate, sampleRate, durationMs, size; `hasArt`, quality flags; `addedAt`, `updatedAt`, `version` |
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
| `settings` | a single row |

The agent's local state (a small SQLite file of its own) holds its cursor, the local path map and a Rekordbox snapshot hash.

## 6. Rekordbox bridge (agent, macOS)

- **Read:**
  - `master.db` is SQLCipher (Rekordbox 6/7). Open it read-only with `better-sqlite3-multiple-ciphers`, using the publicly known key handling that pyrekordbox uses. Verify this against Rekordbox 7.
  - ANLZ files (`.DAT/.EXT`): cues, beatgrid, waveform.
  - Import is incremental, on `master.db` mtime change.
- **Write:**
  - **Primary:** direct `master.db` writes. Only when Rekordbox is not running, after a backup of `master.db`, and only for an allowlist of tested schema versions.
  - **Fallback:** rekordbox XML export for manual import when a version isn't supported.
  - Write scope: playlists (tree, order), rating, colour, comment, My Tags, and `FolderPath` relinks after organise or merge.
- **Matching:** device path ↔ hub track, by local path first and audio hash second.
- **Conflicts:** last writer wins per field, decided by `changes` timestamps versus Rekordbox `updated_at`. Playlists are compared as whole ordered lists, and both sides' versions are shown when they diverge.

## 7. Soulseek

- **slskd** runs in the same compose file. The hub's `slskd` service uses its REST API (with an API key) for search, enqueue and transfer status, and pushes progress to the `transfers` channel.
- Search results are ranked by format, bitrate, a fake-bitrate heuristic and how free the peer's upload slots are. Each result shows "already in library" (fuzzy and, after download, fingerprint).
- Finished downloads go to `/inbox`, then the inbox pipeline.
- A native protocol client is not planned. Reconsider only if slskd blocks something.

## 8. UI (stack roster, judged against Linear)

**Sidebar places:**

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
1. Wipe the old code. Set up the workspace, the hub stack app (`node`, `db sqlite`, `auth` passkey for a single owner, `api`, `vite`, `react`, `reactUi`, `screens`) and Docker compose.
2. `packages/core`: tag IO (5 formats), audio hash, normalise.
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
   - player (whatever the gap allows)
6. A bench seed script with 50k synthetic tracks, and the budgets verified.

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
1. Playlists: tree, manual with ordering, smart rules.
2. Agent: pairing, manifest sync, resumable pulls, local watch and upload to the inbox.
3. Devices UI.
4. Rekordbox read: collection, playlists, cues, grids, history, analysis.
5. Rekordbox write: playlists, rating, colour, My Tags, relinks. Then playlist conflict handling.

**R3 — Acquisition**
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

Per stack's gap rule, each is filed as an issue on `fcalell/stack`, and only the work that needs it waits. You own stack, so the alternative is building them there first (D8).

| # | Gap | Needed by | Interim |
|---|---|---|---|
| G1 | Audio transport: a persistent player dock in the `Shell` (play/pause, seek, volume, keyboard) | R0 | None that's acceptable. A player is core to the app |
| G2 | Waveform drawing (peaks → canvas, playhead, cue markers) | R0/R2 | A plain `Slider` for seeking |
| G3 | Drag and drop: rows → playlist place, reorder within a playlist | R2 | Acts "Add to playlist…", "Move up/down" |
| G4 | Device credential for non-browser clients (agent bearer token / API key) | R2 | Agent signs in with a passkey/OTP and holds a session. Verify native-session support |
| G5 | Big-collection read: a WS snapshot over 1 MiB (`bounds.frame`) needs chunking, or an HTTP snapshot plus channel deltas as one read | R0 | HTTP index read + `channelRead` deltas written into the query cache |
| G6 | Table at scale: column show/hide, many columns, keyboard row navigation and actions, a persisted cached read (IndexedDB) for warm load | R0 | Verify what `Table` already does; fixed column set |
| G7 | SQLite extras in `db()`: FTS5 virtual tables and triggers, pragmas on open | R0 | Hand-written migration SQL, if `stack db generate` keeps it |
| G8 | Server folder browser for settings (choosing the library root on the hub) | R0 | Text field with path validation |

Docker packaging is app work, not a gap: `stack deploy` ships nothing on the node target.

## 11. Decisions to confirm

| # | Decision | Proposal |
|---|---|---|
| D1 | Where the files live | **Hub is the source of truth** (homelab disk). PCs work through the browser, the Mac holds a replica. Alternative: files stay on one PC and the hub is a mirror |
| D2 | Desktop shell | **Drop Electron.** Browser or installed PWA. A native wrapper can come later if ever needed |
| D3 | Formats | **MP3, AIFF, WAV, FLAC, M4A** |
| D4 | Soulseek | **slskd sidecar** instead of implementing the protocol |
| D5 | Rekordbox write path | **Direct `master.db`** (Rekordbox closed, backed up, version allowlist), with XML as fallback |
| D6 | Users | **Single owner.** MCP needs `auth({ organization: true })`, so one personal organization |
| D7 | Track identity | **Audio-content hash** |
| D8 | Stack gaps | Build G1–G3 in stack before R0/R2 (owner's call), or file issues and ship the interims |
| D9 | Network | Hub on the LAN plus Tailscale for remote. Passkeys need a stable HTTPS origin (e.g. `trackvault.<tailnet>.ts.net`) |
