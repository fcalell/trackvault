# Rekordbox bridge: verify on a real install (R2 spike)

No Rekordbox was available while this was written. The sources were pyrekordbox 0.4.4
source (the PyPI wheel: `db6/*.py`, `anlz/structs.py`, `config.py`, `utils.py`) and the
Deep Symmetry ANLZ layout as encoded there. pyrekordbox.readthedocs.io was not
reachable from the build box. Everything below is **assumed** until ticked, on a
**throwaway** Rekordbox 7 library (never a real one).

Verified in the build box only against a hand-made fixture (same table and column names
as pyrekordbox's models, an SQLCipher file made with the same pragmas): key
derivation, open/read/write round trip, idempotent re-runs, ANLZ parse of synthetic
bytes. None of that proves Rekordbox accepts the result.

## Opening

- [ ] `openMasterDb` opens a real Rekordbox 7 `master.db` (SQLCipher 4 defaults via
      `cipher='sqlcipher'` + `legacy=4` + passphrase `masterDbKey()`). pyrekordbox opens
      the same file with `sqlcipher3` and the same passphrase; the cipher parameters are
      the SQLCipher 4 defaults (PBKDF2-HMAC-SHA512 256000 rounds, AES-256-CBC, HMAC-SHA512,
      4096-byte pages).
- [ ] The key still holds on the newest Rekordbox 7.x (pyrekordbox lists 6.7.7 / 7.0.9
      as tested). `REKORDBOX_DB_KEY` / the `key` option override it.
- [ ] Journal mode of the live `master.db` (WAL or not). `snapshotCopy` copies `-wal` and
      deliberately not `-shm`; confirm a copy taken while Rekordbox plays opens and shows
      the latest rows.
- [ ] `findRekordboxInstall`: the `options.json` location and its `db-path` option on
      macOS (`~/Library/Application Support/Pioneer/rekordboxAgent/storage/options.json`
      is pyrekordbox's; `~/Library/Pioneer/...` is tried second) and on Windows
      (`%APPDATA%\Pioneer\rekordboxAgent\storage\options.json`).
- [ ] `isRekordboxRunning`: the process is named exactly `rekordbox` (macOS, `pgrep -x`) and
      `rekordbox.exe` (Windows). Check that `rekordboxAgent` (always running) does not match.

## Schema and the write allowlist

- [ ] Record `DjmdProperty.DBVersion` of the spike library (and of 6.x if supported) and put
      it in `WRITE_ALLOWED_DB_VERSIONS` (`db.ts`). It is **empty**, so every write is refused
      until then (or `allowedVersions` / `allowUntested` is passed).
- [ ] `probeSchema().complete` is true on the real file (`REQUIRED_COLUMNS` lists every column
      the readers and writer use). Dump `registry` once (agentRegistry rows) and note the
      other ids (e.g. an app version).
- [ ] Per-table NOT NULL columns that `insert()` does not set (it inserts only the columns it
      names; a NOT NULL without default makes the whole transaction roll back, which is
      safe but blocks the feature).

## Value encodings (readers and writer guess these)

- [ ] `djmdContent.Rating` scale: 0..5 or 0,51,..,255. Reader accepts both; the writer copies the
      scale already in the library (`max(Rating) > 5` means x51; empty library defaults to x51).
- [ ] `Length` is seconds, `BitRate` kbps, `BPM` x100 (pyrekordbox docs; `BPM / 100` is what
      the task asked for).
- [ ] `ColorID` for "no colour": `0`, `NULL` or empty. Reader maps `0` to none; writer writes NULL.
- [ ] `djmdKey.ScaleName` notation (musical vs Camelot) and whether it follows the user's
      display setting; the hub must compare keys in one notation.
- [ ] `djmdCue.Kind`: pyrekordbox says "Cue=0, Fade-In=0, Fade-Out=0, Load=3, Loop=4" yet treats
      `Kind > 0` as a hot cue; the reader assumes hot cue = Kind 1..8 (A..H) and a loop = any
      `OutMsec >= 0`. Check against a track with a memory cue, hot cues A-H, a saved loop,
      a hot-cue loop, a Load cue. `setCues` writes `Kind` as given.
- [ ] `djmdCue` columns the writer fills: `InFrame = ms * 150 / 1000`, `InMpegFrame`/`InMpegAbs`/
      `OutMpegFrame`/`OutMpegAbs` = 0, `CueMicrosec = ms * 1000`, `OutMsec = -1` and
      `OutFrame = 0` for plain cues, `Color = -1`, `ColorTableIndex` as given. MPEG frame
      columns may matter for MP3 seeking.
- [ ] `ContentCue` / `djmdContent.CueUpdated`: does Rekordbox need the content's `CueUpdated`
      (or `TrackInfoUpdated`, `AnalysisUpdated`) touched to notice new cues? Not written.
- [ ] My Tags: `djmdMyTag.Attribute` 1 = group, 0 = tag (assumed); new tags are created at
      the top level with `Seq = max + 1`.
- [ ] History: `djmdHistory.Attribute` 1 = folder; `djmdSongHistory.created_at` is the play
      time (assumed, used for `playedAt`).
- [ ] `DateCreated` / `StockDate` format `YYYY-MM-DD`; `created_at`/`updated_at`
      `YYYY-MM-DD HH:MM:SS.SSS +00:00` (pyrekordbox `datetime_to_str`).

## Write bookkeeping (what the plan asked to verify)

- [ ] ID strategy: 28-bit random, >= 100, as text (pyrekordbox `generate_unused_id`); song-playlist and
      song-my-tag rows use a UUID string as ID. Rekordbox accepts rows created this way.
- [ ] `rb_local_usn`: the writer gives each touched row the next `localUpdateCount` value and
      one value per delete, then stores the counter. pyrekordbox bumps once per attribute
      change. Check Rekordbox does not rewrite or reject rows, and that `usn` (cloud) staying
      NULL on new rows is right when Cloud Library Sync is off.
- [ ] `masterPlaylists6.xml`: element/attribute layout (`NODE Id/ParentId/Attribute/Timestamp/
      Lib_Type/CheckType`, Id as upper-case hex, root parent `0`) and that Rekordbox needs
      it in step with `djmdPlaylist` (pyrekordbox keeps it so). `masterplaylists.ts` edits it
      as text. Also: does a changed playlist membership need the playlist row's `updated_at`
      or the XML timestamp bumped? (`setPlaylistTracks` bumps only the XML timestamp.)
- [ ] New `djmdContent` rows copy pyrekordbox `add_content` (ContentLink from the `TRACK` menu
      item, DeviceID/MasterDBID from `djmdDevice`, `MasterSongID = ID`, `rb_file_id`,
      `HotCueAutoLoad = on`). Check Rekordbox opens the track, analyses it, and fills
      `AnalysisDataPath`, `BPM`, `KeyID`.
- [ ] Deleting a track (`deleteContent`) leaves rows in other tables (`djmdMixerParam`,
      `djmdActiveCensor`, `djmdSongHotCueBanklist`, `djmdSongHistory`, `contentFile`,
      `contentCue`); check Rekordbox tolerates it or extend the delete.
- [ ] Rekordbox reads a freshly written master.db without a rebuild/repair prompt.
- [ ] Relinking: moving `FolderPath` also needs the ANLZ `PPTH` rewritten (`relinkAnlzPath`);
      check Rekordbox accepts it and shows the track as found.

## Cloud Library Sync detection (heuristic)

`cloudLibrarySyncEnabled` returns on / off / unknown from: playlist `100000` existing,
`cloudAgentRegistry` rows, tracks with `usn > 0`, and any truthy `*cloud*` option in the
agent `options.json`. None of these is confirmed to be the on/off switch.

- [ ] Toggle Cloud Library Sync on a throwaway library and diff `master.db` + `options.json`
      before/after to find the real flag; replace the heuristic with it.

## ANLZ files

- [ ] PQTZ, PCOB, PCO2, PPTH, PWAV, PWV3, PWV5 offsets follow the Deep Symmetry layout as
      pyrekordbox encodes it. Parse real `.DAT`/`.EXT`/`.2EX` files and compare beat
      grid, cues and waveform against Rekordbox's own display.
- [ ] PWV5 bit layout (red 3, green 3, blue 3, height 5, 2 spare) and PWAV/PWV3 height in
      the low 5 bits.
- [ ] Which of cues/beatgrid Rekordbox reads from `master.db` and which from ANLZ: do cues
      written only to `djmdCue` show up in the player and on exported media?
- [ ] Whether copying ANLZ files (and `share/PIONEER/USBANLZ/...`, `AnalysisDataPath`) between
      installs is accepted, and `withAnlzPath` output is accepted (header `len_file`,
      PPTH `len_tag`/`len_path` are fixed up).
- [ ] The `.2EX` file (PWV6/PWV7/PWVC) is not parsed; only listed by `listTags`.
