# TrackVault — Vision

**One line:** the place a DJ's library is curated, from any computer, with Rekordbox reduced to a performance tool.

**Promise:** every track in the library is unique, correctly tagged, sensibly filed, analysed, and on the DJ Mac ready to play, without opening Rekordbox to organise anything.

## Users

- **Primary:** one DJ/collector (the owner) with 10k–100k tracks across several computers, one DJ Mac running Rekordbox.
- **Later:** the owner's phone (stack's Expo target) for curation on the go.
- Not multi-tenant. One owner, many devices.

## Principles

1. **Performance first.** 50k tracks feel instant: search per keystroke, sort, scroll, select-all. Every bulk operation runs in the background with live progress. The UI never blocks.
2. **Nothing destructive without a preview and an undo.** Every change lands in a change log. Deletes go to a quarantine first.
3. **The hub is the truth.** One canonical library on the homelab. Devices are replicas.
4. **Automate the boring parts.** New music arrives via an inbox pipeline that fingerprints, dedupes, cleans, tags and files it before you see it.
5. **Rekordbox is a peer, not the master.** Read everything it knows (cues, grids, history, analysis). Write playlists and tags back.

## Feature map

Legend: **M** = must (your list), **S** = suggested by me. The phase is in `revamp-plan.md`.

### 1. Library (M)
- Browse, search, filter and sort 50k+ tracks instantly. Facets: artist, album, label, genre, BPM range, key, year, rating, format, custom tags, issues.
- Track record: all facts, waveform, cues (from Rekordbox), playlists it's in, duplicates/versions, change history.
- Preview player with waveform and keyboard-first navigation (arrows plus space to play).
- Formats: MP3, AIFF, WAV, FLAC, M4A (whatever Rekordbox plays).

### 2. Sync server (M)
- **Hub** on the homelab (Docker): canonical DB and files, serves the web UI. Any PC uses it through a browser, no install.
- **Agent** (a small daemon) on the DJ Mac: keeps a local replica of the files (content-addressed, delta, resumable), so DJing works offline.
- Agent on any PC (optional): uploads a local folder to the hub's inbox.
- Device status: what's synced, pending, failed, and free disk space.
- Later: an S3/R2 backend for the file store.

### 3. Rekordbox bridge (M)
- **Read:** collection, playlists and folders, cues/hot cues/memory cues, beatgrids, BPM/key, colours, ratings, My Tags, play history.
- **Write:** playlists (create, rename, reorder, folders), tags/rating/colour/My Tags, file relinks after the organiser moves files.
- Build playlists in TrackVault, then they appear in Rekordbox.
- Missing-file and broken-link detection on both sides.

### 4. Reorganise, dedupe, clean up (M)
- **Dedupe in tiers:**
  - exact: audio-content hash
  - acoustic: Chromaprint fingerprint
  - fuzzy: normalised artist/title
- Dedupe is version-aware: Original Mix ≠ Extended ≠ Radio Edit.
- **Merge:** pick the keeper automatically, using quality → has Rekordbox cues → playlist membership → tag completeness. Then move the cues, playlists and tags onto the keeper and quarantine the rest.
- **Organiser:** folder and filename templates with tokens and conditionals (`{genre}/{artist}/{artist} - {title} ({mix})`). Diff preview, collision handling, one-click undo. Rekordbox paths are relinked automatically.
- **Cleanup rules:** saved "if → then" rules. Examples: strip URLs and junk from tags, move "feat." into the artist field, split "Artist - Title" titles, normalise case and separators. They can run on demand or automatically on ingest.
- **Health:** corrupt or undecodable files, fake bitrates (upscaled 128 → 320, by spectral cutoff), low bitrate, missing tags or art, orphans.

### 5. Tags: unify, add, auto-tag (M)
- **Unify:** a genre taxonomy with aliases (`DnB`, `Drum n Bass` → `Drum & Bass`), artist and label aliases, applied library-wide and on ingest.
- **Add:** free custom tags (vibe, energy, set position, venue) that map to Rekordbox My Tags and to the file.
- **Auto-tag:** fingerprint plus provider lookup (MusicBrainz/AcoustID, Discogs, Beatport, Deezer for art and ISRC). It proposes candidates with a confidence score. You review them field by field as a before → after diff, and accept or reject.
- Cover art: fetch, embed, unify.

### 6. Soulseek client (M)
- Search, download and watch transfers from the UI. Backed by **slskd** running beside the hub.
- Quality filters: prefer lossless or 320, reject fakes, prefer your preferred formats.
- Before downloading, it tells you "already in library" (fingerprint/fuzzy match).
- Downloads land in the inbox pipeline.

### 7. Suggested features (S)
1. **Inbox pipeline:** every new file (upload, Soulseek, watched folder) is hashed, fingerprinted, dedupe-checked, cleaned, auto-tagged, analysed and filed. You approve the result in one list.
2. **Wishlist and playlist import:** import a Spotify, Beatport or YouTube playlist or a 1001tracklists set. It's matched against the library, and the missing tracks go to a wishlist that Soulseek auto-searches.
3. **Smart playlists:** live rules (`genre = Techno AND bpm 128–134 AND not played in 6 months`), synced to Rekordbox as normal playlists.
4. **Set builder:**
   - harmonic mixing helper: next-track suggestions by Camelot key, BPM window and energy
   - a set's key/BPM/energy flow at a glance
   - export to Rekordbox
5. **Analysis for tracks Rekordbox hasn't seen:** BPM, key, loudness (EBU R128), energy and waveform. Rekordbox's own analysis is imported when it exists rather than recomputed.
6. **History and freshness:** Rekordbox play history imported, giving never-played, most-played, last played and "forgotten gems" views.
7. **MCP server:** ask Claude to "build a 90-min progressive warm-up from tracks I haven't played this year" or "fix the genres of everything I added this week". Stack ships MCP.
8. **Phone app** (stack Expo): rate, tag and approve inbox and downloads, preview tracks.
9. **Backups:** nightly DB snapshot, quarantine retention, and a Rekordbox `master.db` backup before every write.
10. **Stats:** library growth, genre/BPM/key distribution, quality score.
11. **Far future:** export straight to a USB stick for CDJs, without Rekordbox.

## Non-goals (for now)
- Streaming-service playback, social features, multi-user libraries.
- Offline *editing* on replicas. Replicas are read-only and the hub is the single writer. Revisit after the bridge ships.
- A DJ performance engine.
