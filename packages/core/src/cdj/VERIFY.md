# CDJ / XDJ USB export: verify on real players

Research-grade. `export.pdb` is a reverse-engineered format; this module was written from
the specs below and has never been in a CDJ. Treat every box here as unchecked until ticked,
on a **spare stick** (FAT32 or exFAT, never the DJ's only copy) with a handful of tracks.

## Sources (read on the build box)

- Deep Symmetry crate-digger `rekordbox_pdb.ksy` (Kaitai spec of export.pdb and exportExt.pdb),
  fetched from GitHub raw. The authority for page, row and string layouts here.
- rekordcrate 0.2.0 `src/pdb/mod.rs` (Rust, crates.io): cross-check of the page header and the
  table types. Read, not built or run (the sandbox refused to build downloaded code).
- Already in the repo from earlier work: `../rekordbox/anlz.ts` (ANLZ layout via Deep Symmetry
  and pyrekordbox).
- Not reachable: djl-analysis.deepsymmetry.org (the prose analysis), so nothing was read there.
- `exportLibrary.db` ("Device Library Plus", Rekordbox 6.8+/7) is **not implemented**: it is an
  SQLCipher database and its schema and key were not read from any source here.

## What is implemented

| Piece | State |
|---|---|
| `readPdb` | Header, page chain, row groups with presence flags, DeviceSQL strings (short ASCII, long ASCII 0x40, UTF-16LE 0x90). Decodes tracks (all numeric fields, 15 strings), artists, albums, genres, labels, keys, colors, artwork, playlist tree and entries. Other tables (history, columns, unknown) are listed in `tables`, not decoded. exportExt.pdb (tags) is not read. |
| `buildPdb` | A fresh 4096-byte-page file with all 20 table types, one index page plus data pages per table. |
| `exportUsb` | `Contents/<artist>/<album>/<file>` copy (skips a file already there with the same size), `PIONEER/rekordbox/export.pdb`, and ANLZ `.DAT/.EXT/.2EX` under `PIONEER/USBANLZ/Pxxx/xxxxxxxx/` **only** for tracks that carry Rekordbox's own ANLZ bytes (`track.analysis`, from the agent's `analysis_blobs`); the PPTH inside is rewritten to the new audio path (`withAnlzPath`). Tracks without ANLZ are exported without waveform, beat grid or cues and the report says so. |
| `inspectUsb` / `readUsb` | Detects export.pdb, exportExt.pdb, exportLibrary.db, USBANLZ; reads export.pdb. |

## Confidence

- **High** (spec read directly): header layout, page header offsets, row group/presence-flag
  geometry, the row layouts of track, artist, album, genre, label, key, color, artwork,
  playlist tree and playlist entry, string encodings, table type numbers, little-endian.
- **Medium**: values the spec calls unknown and the writer fills with typical numbers
  (track `bitmask` 0x000c0700, the `19048`/`30967`/`41`/`1`/`2-or-3` constants, page header
  fields at 0x14, 0x24, 0x26, header word 5 at 0x10). A real player may be strict about them.
- **Low / known gaps** (likely reasons a CDJ would reject or misbehave, check these first):
  1. Index pages (flag 0x64) are written empty (header only). Real ones carry "garbage
     patterns" the spec does not explain; players may use them for lookups.
  2. The `columns` table (type 16) and the history tables are empty. Real exports fill
     `columns` with the browse-column definitions; players might need it for the Browse menu.
  3. Row order within a table is insertion order; Rekordbox sorts some tables, and a player's
     binary search (if any) could assume it. The artists/albums/genres are in first-seen order.
  4. No `exportExt.pdb` (tags, "My Tag" on newer players), no `DEVSETTING.DAT`,
     `DJMMYSETTING.DAT`, `MYSETTING.DAT`, `MYSETTING2.DAT`, no `PIONEER/rekordbox/` auxiliary
     files, no album art (`PIONEER/Artwork`). Players use defaults; some firmware may insist.
  5. CDJ-3000 / Rekordbox 7 sticks use `exportLibrary.db` (Device Library Plus). Players that
     support only that format (newer Opus Quad/Omnis firmware modes) will ignore export.pdb;
     CDJ-2000NXS2, XDJ-1000MK2, XDJ-RX2/RX3, XDJ-XZ, CDJ-3000 still read the legacy export.pdb.
  6. The keys table holds the key text as given (e.g. `8A`, `Am`). Rekordbox uses fixed ids
     for its 24 keys in a fixed order; filtering by key on the player may differ.
  7. File names with non-ASCII characters are stored as UTF-16 strings and in the file
     system as sanitized names; FAT32 long-name support on the stick is assumed.

## Verified here (build box)

- Round trip of our own writer through our own reader: 700 tracks, 40 artists, 471 albums, 9
  genres, 3 keys, 8 colors, a folder and two playlists, 603 playlist entries; multiple pages
  per table, ASCII, Latin-1-range and long (150 char) titles; ids, tempo, rating, color, paths
  all come back equal. This proves self-consistency only.
- Not verified against any third-party parser, Rekordbox, or a player.

## How to verify on real hardware

1. Export a stick with `exportUsb` for ~20 tracks (some with ANLZ from the agent, some without),
   two playlists, one folder.
2. **Second parser:** run rekordcrate (`cargo install rekordcrate`, `rekordcrate list-playlists
   export.pdb`) or crate-digger's `ParseDump`; both should list the tracks and playlists with
   no error. Also run the same tool on a stick Rekordbox exported and diff the page headers,
   the index pages, the `columns` table and the unknown fields against ours.
3. **Rekordbox:** import the stick (Rekordbox, Device > the stick). It should read the
   library; a failure here points at the header or page geometry.
4. **Player:** CDJ-2000NXS2 / XDJ-1000MK2 first (legacy format): the stick mounts, Browse >
   Playlist shows the tree, tracks load and play, BPM and key show, rating and color show.
   Without ANLZ: no waveform and no beat grid is expected, play must still work.
   With ANLZ: waveform, beat grid, cues and hot cues must match Rekordbox.
5. Search and sort on the player (Artist, Album, Genre, Key, BPM): this exercises the tables
   the index pages and ordering may matter for.
6. Report each failure against the "Low" list above; the likely order of fixes is the index
   pages, then `columns`, then the row order.

## Not done

Device Library Plus (`exportLibrary.db`), `exportExt.pdb`, album art, history playlists,
reading ANLZ back into the pdb (cue counts), and any deletion of tracks already on a stick
(an incremental update rewrites `export.pdb` whole).
