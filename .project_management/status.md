# Project Status

The revamp onto `@fcalell/stack` replaces the earlier Electron/SolidJS phases. Vision: `vision.md`. Plan: `revamp-plan.md`.

| Phase | Name | Status | Goal |
|---|---|---|---|
| R0 | Foundation | In progress | Stack pagination/player/waveform; hub on stack, scanner and jobs, library at 50k within budget |
| R1 | Curation | Not started | Change log and undo, bulk edit, taxonomy, rules, organiser, health, dedupe |
| R2 | Playlists, sync, Rekordbox | Not started | Playlists, the agent with Mac replica, Rekordbox read and write |
| R3 | Acquisition | Not started | Inbox pipeline, Soulseek (slskd), wishlist, playlist import |
| R4 | Intelligence | Not started | Auto-tag, analysis, set builder, MCP, stats |
| R5 | Reach | Not started | Phone, backups, S3/R2, CDJ export |

Decisions D1–D11 are settled (`revamp-plan.md` §11). 

## R0 progress

Done: stack work (window pagination S1–S6, player G1, waveform G2, Table at scale G6, FTS G7); hub on stack; `packages/core`; schema (tracks with `seq`, files, jobs, changes, settings); jobs runner, scanner pool, media (Range, `http.session`), library channel; library search (FTS5 `track_search`), window list `tracks.list` and `tracks.facets`, the index set (see `apps/hub/src/schema/index.ts`); library UI (All tracks, Recently added, track record with waveform and tag editing, row play act); `peaks` job (ffmpeg, low priority); folder browser for the library root (`fs.browse`, G8 as app code); bench seed and `scripts/bench-queries.ts`.

Left: hub on the homelab (step 7); budgets that need a browser (first paint, keystroke to rows) measured on the real hub; bulk-edit acts on the library selection (R1).

Measured at 50k tracks on the build sandbox (`pnpm --filter hub seed:bench`, then `scripts/bench-queries.ts`): window query plus total, 200 rows: unfiltered any sort and offset 2 to 5 ms; one facet (genre, key) with the common sorts 2 to 7 ms; issue filters on title or newest 2 to 5 ms; search by two words 3 to 6 ms. Over 10 ms: a BPM range (about 10k matches) 13 to 20 ms, a facet sorted by time or bitrate 10 to 15 ms, an issue filter sorted by a column with no partial index 20 to 40 ms at deep offsets, a one or two letter search prefix 9 to 14 ms.
