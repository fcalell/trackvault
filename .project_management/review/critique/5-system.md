# System: devices, conflicts, backups, settings, stats, set builder (and the frame states)

Scope note: only 1920 dark was shot, so 320, touch and light-mode items (C3d, C8d, half of C8e/C8f) are `n/a (not shot)`. The run log lists no machine finding for any of these screens (all floors passed), so every finding below is a judgement. Fixture data is synthetic: I judge layout and flow, not values. Shots under `/home/user/trackvault/apps/hub/shots/`. Sources under `/home/user/trackvault/apps/hub/src/app/` (`routes/_app/*.tsx`, `ui/backups.ts`, `fixtures.ts`) and stack's `/home/user/stack/plugins/react-ui/src/ui/components/bar-chart/index.tsx`, `/home/user/stack/plugins/react-ui/guide/rules.md` (lines 344, 346).

Global measurements (all six screens): the content column is 244 to 964 px = 720 px (V17 "record's parts within 720" is right for settings, but devices, backups, stats and the set builder are list pages: "a list page is wide"). At 1920 the canvas is 1700 px, so a 956 px band (56%) on the right is blank on every screen. Sidebar 220 px, bar line shared with the sidebar's first row (V2 ok), no dock in these shots.

---

## Devices (/_app/devices)
Shots read: devices/data-1920.png, devices/empty-1920.png (and conflicts shots, which show this pane at 471 px)
Source read: routes/_app/devices.tsx (all), fixtures
Machine findings: none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | data: bar, then one sheet of rows; no record. |
| A-1b | no | "DJ Mac" row carries name, status, then a 7-part meta ("darwin · djs-macbook · 47,900 files in the replica, 310 waiting · Rekordbox 7.0.3 · Rekordbox writes wait for verification · 14 changes waiting for Rekordbox to close · 41 tracks not matched") that wraps to 2 lines at 720 and 4 lines at 471 (conflicts shot). Booth PC and Old laptop carry 2 parts. Expected: name, one meta, one end group (V9). Fix: one short meta (platform name, files), push Rekordbox facts into a second Section or a record Pane. app (devices.tsx:56-74) |
| A-1c | n/a (no definition list) | |
| A-1d | n/a | The only Section has no heading (devices.tsx:193); a list outside a section is its own sheet, fine. |
| A-2a | yes | no empty label/value rows. |
| A-2b | no | Offline/Online word and the age ("3 days", "30 sec") both say "last seen" but neither is labelled; "Rekordbox" is in three of DJ Mac's meta parts. app |
| A-2c | yes | 3 rows, 3 devices; the "to review" conflict count is not shown at all (see E). |
| A-2d | yes | rows without act reserve nothing visible. |
| A-3a | yes | no truncation at 1920; wrapping instead. |
| A-3b | yes | |
| A-3c | no | DJ Mac row carries name, state, 5 facts, age, merge act, more (see 1b). app |
| A-3d | n/a (not shot) | |
| A-4a | no | Pane has no section descriptions; the empty sentence "No devices yet. Pair a machine to give it a replica of the library or to sync its Rekordbox." is two clauses. app (devices.tsx:197) |
| A-4b | no | raw platform strings "darwin", "win32" shown to a DJ (macOS, Windows); "replica" is jargon; "Rekordbox writes wait for verification" does not say verification of what. app (devices.tsx:57, 28-34) |
| A-4c | no | empty shot: sentence in a sheet but no outlined act; the only act to pair is a "+" glyph in the bar (V15: sentence over its act, centred). app: pass `empty.act` with the Pair sheet |
| A-4d | yes | |
| A-5a | yes | no filled act on the page (Pair is an icon). |
| A-5b | n/a | no pills; status dots only. |
| A-5c | yes | |
| A-6a | no | status: green dot "Online", hollow grey circle "Offline", red dot "Revoked"; each has a word (ok). The merge glyph on DJ Mac has no count and the tooltip is the only place that says "3 conflicts to review": a lone glyph reads as "git branch". app (devices.tsx:93-97) |
| A-6b | yes | rows with `more` only; no chevrons. |
| A-6c | yes | |
| A-7a | n/a (single pane in data); in the conflicts shot the two panes start both at y 69 (aligned). | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | |
| A-8a | n/a (state not shot) | |
| A-8b | yes | empty = sheet with one sentence; bar identical. |
| A-8c | n/a (state not shot) | |
| A-8e | yes (dark) | sidebar slate, sheet edge lighter than table. |
| A-8f | no | the offline row's hollow circle and "Offline" are the faintest ink on the page while it is the one that needs attention. app (tone `idle` for a device not seen in 3 days: devices.tsx:22) |
| A-9a | no | beside the anchor list row: 1) anchor rows carry 1 line, ours 2 to 4; 2) the anchor's state sits at the end, ours leads a long line; 3) the anchor's end group is one act, ours age + act + more. All app (composition). |
| B1 | no | sheet stops at x=964; 956 px blank right. Pane width option. app/stack? the Pane default is 720; ask whether `wide` exists for list pages. |
| B2 | n/a | |
| B3 | yes | no scroller. |
| B4 | yes | left edge 244. |
| B5 | yes | bar: "+" and "..." only. |
| B6 | n/a | |
| B7 | yes | |
| C1 | yes | one-line rows 32 px where meta is single (Booth PC row 50 px with 2 lines: it has a state mark so two lines, per V9). |
| C2 | n/a | |
| C3 | yes | |
| C4 | n/a | |
| C5 | yes | |
| C6 | yes | |
| D1 | yes | primary: "Pair a device" (icon "+"), right for a first run; not a filled act, ok. |
| D2 | yes | Revoke key is destructive with confirm (devices.tsx:124-131); Forget has confirm. |
| D3 | yes | icon acts carry labels in source. |
| D4 | no | "47,900 files in the replica, 310 waiting" uses thousands separators (good); "3 mths" vs "3 days" age forms are stack's. n/a-ish. |
| D5 | yes | dot plus word. |
| D6 | no | "device" (title), "agent" (not seen), "replica", "machine" ("Pair a machine"), "Revoke key" vs "Forget": 3 names for the thing (device, machine, key). app |
| D7 | no | empty has no act (see 4c). |
| D8 | n/a (state not shot) | |
| D9 | no | too much per row, too little page: three rows in a 1700 px canvas, and the status data is crushed into one line. app |
| E1 | no | cannot tell from the shot whether the library is in sync: "47,900 files in the replica, 310 waiting" is a count with no total ("of 50,000"), no last-synced time (the age is last seen), no progress. app (data exists: files.ok/pending/failed) |
| E2 | no | main task "see that the DJ Mac is current and fix it if not": the Sync now act is in the row's ... menu (devices.tsx:101-109) = 2 presses, and only when online. Pairing is 1 press (+). app |
| E3 | no | "Sync now" toasts "Asked the device to sync" but the row shows nothing running afterwards on this screen (no progress state beyond the count). app |
| E4 | n/a (devices does not move files) | |
| E5 | no | Conflicts is reachable from a glyph on the row and from the bar's more menu; sidebar "Devices" has no badge. Phone/hub chain DJ: Library, Playlists, Sets, Devices, conflicts each exist; nothing from Sets or Playlists says "on DJ Mac: yes/no". app |
| E6 | n/a | |
| E7 | n/a | |
| E8 | no | the key question. Booth PC: "Offline win32 · booth · 0 files in the replica" and "3 days"; there is no sentence about what to do ("open the agent on Booth PC"), no warning tone (`idle` grey), and 0 files means it never synced yet nothing says so. DJ Mac: "Rekordbox writes wait for verification" and "14 changes waiting for Rekordbox to close" are good facts but not marked as needing attention, and "41 tracks not matched" has no link to which tracks. The row prop `warning` exists (devices.tsx:83-87) but only fires for failed files and cloud sync, not for stale/offline/not-matched. "Rekordbox unreachable" is not a state at all. Fix: warning for offline > 1 day ("Not seen for 3 days. Open the agent on this machine."), link "41 tracks not matched" to the filtered library. app |
| E9 | n/a | |
| E10 | yes | sidebar "Devices" = Pane title; under System with History, Backups, Jobs, Settings (5). |
| F8 | n/a | no banner. |
| F12 | n/a (not these shots) | |
| G1 | yes | `back={false}`, first act "+" stands, "Conflicts" in the more menu. |
| G2 | yes | one Section; paired-key Section only when set. |
| G3 | no | leading mark is a device icon (laptop vs monitor) = type mark ok; but the marks line (state dot + word) and the facts are on the same line as the first meta; meta before marks reversed (V9: marks lead the meta line). stack/app: the render shows "Online" on its own line and the meta below, correct; ok. yes. |
| G4 | n/a | |
| G5 | n/a | |
| G6 | n/a | |
| G7 | n/a | |
| G8 | n/a | |
| G9 | n/a | |
| G10 | n/a | |

Top three (devices): 1) E8: an offline or stale device has no sentence and no tone, so "is my Mac current" is not answered; 2) the DJ Mac row is a 7-part sentence (app), unscannable, with raw "darwin"/"win32"; 3) empty state has no pairing act and the page leaves 956 px blank.

---

## Conflicts (/_app/devices/conflicts)
Shots read: devices/conflicts/data-1920.png, devices/conflicts/empty-1920.png
Source read: routes/_app/devices.conflicts.tsx (all), worker/routes/devices.ts:244-300 (shape)
Machine findings: none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | a Table in a Pane; at 720 px the table collapses to rows and loses its column headers (see 1b). |
| A-1b | no | rows: title, then a neutral chip ("TrackVault"/"Rekordbox"), then "House -> Disco · Genre · DJ Mac", age at end. Slots differ from every list elsewhere (chip first on the meta line). The chip is the column "Kept" but its header is gone, so the chip reads as a label of where the track comes from. app (devices.conflicts.tsx:39-46) |
| A-1c | n/a | |
| A-1d | n/a | no section. |
| A-2a | yes | |
| A-2b | no | row 3 "Peak time": "214 tracks in order -> 214 tracks in order" is the same value twice: a before/after that shows no difference, so the decision cannot be made. app (phrase() in worker/routes/devices.ts:282-283 phrases order as a count; should say what moved) |
| A-2c | yes | "0 of 3 conflicts chosen" matches 3 rows; empty "0 of 0". |
| A-2d | yes | |
| A-3a | yes | no truncation. |
| A-3b | yes | |
| A-3c | no | 5 facts per row (name, kept chip, change, field, device, age). app |
| A-3d | n/a (not shot) | |
| A-4a | n/a | no description. |
| A-4b | yes | |
| A-4c | no | empty: "Nothing here yet." (stack's generic sentence) is right for "no open conflicts" but is a missed chance ("No conflicts. Both sides agree."); also the selection bar still stands at the foot with "0 of 0 conflicts chosen / Choose conflicts first." and two blocked acts over nothing. app (devices.conflicts.tsx:68-94: hide `select` when empty) / stack (the bar should not draw for an empty window) |
| A-4d | yes | |
| A-5a | no | no primary: both bar acts are outlined. In the 0-chosen state "Take Rekordbox" is drawn dim and "Keep TrackVault" bright: same blocked state, two looks (both have `blocked`). Observed in data and empty shots at x 1236-1484. stack (select-bar renders the last act differently / ignores blocked) unverified cause. |
| A-5b | yes | one chip style. |
| A-5c | yes | |
| A-6a | no | the grey dot in the chip has no meaning stated; the chip means "the side that was kept". app |
| A-6b | yes | checkbox rows; no chevrons. |
| A-6c | yes | |
| A-7a | yes | Devices pane and Conflicts pane both start at y=69. |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | |
| A-8a | n/a (state not shot) | |
| A-8b | no | empty keeps the bar and its blocked acts, the data keeps the same; but the left pane in the empty shot is "No devices yet" while a conflict page can only exist with devices: a fixture artefact. |
| A-8c | n/a | |
| A-8e | yes | |
| A-8f | no | blocked "Take Rekordbox" ink on the bar is near the floor. stack |
| A-9a | no | vs the anchor list: 1) no band/grouping by device or kind (track conflicts vs playlist order vs folder); 2) the anchor's pill is a state, ours a side; 3) one fact per row there, five here. app |
| B1 | no | Conflicts sheet 764-1484 (720 px), 436 px blank beyond it. app/Pane |
| B2 | yes | two panes read as one page, no dead gutter between (49 px). |
| B3 | n/a | table collapsed to rows. |
| B4 | yes | |
| B5 | yes | selection bar: "0 of 3 conflicts chosen  Select all" left, "Choose conflicts first." then two acts right; no overlap at 720. |
| B6 | n/a | |
| B7 | yes | |
| C1 | yes | rows are 52 px (two lines, ok), chip compact. |
| C2 | n/a | |
| C3 | yes | |
| C4 | n/a | |
| C5 | yes | |
| C6 | yes | |
| D1 | no | there is no primary and no recommended side; the bar acts are "Take Rekordbox" / "Keep TrackVault" (take vs keep: different verbs for the same kind of act, and "Keep TrackVault" is a no-op when the chip already says TrackVault was kept). app (wording) |
| D2 | no | resolving writes into Rekordbox and every device ("A value taken is written as your change (History undoes it) and reaches every device", only in the code comment at devices.conflicts.tsx:56-58) yet the acts have no `confirm` and say nothing of it on screen. app |
| D3 | yes | |
| D4 | no | before/after values are free text by field: "3 -> 5" for Rating (stars?), "House -> Disco". |
| D5 | yes | |
| D6 | no | "Take"/"Keep", "Kept", "conflicts chosen". The chip column "Kept" is the engine's guess; the user is not told that "kept" means "already applied". app |
| D7 | no | see 4c. |
| D8 | n/a (state not shot) | |
| D9 | no | too little for a decision (see E7). |
| E1 | no | the page says "Conflicts" with no sentence of what a conflict is ("changed in Rekordbox and in TrackVault since the last sync", which exists only in a code comment). app |
| E2 | no | main task: settle each conflict. Presses: tick row, press "Take Rekordbox"/"Keep TrackVault" = 2 per batch, which is fast, but there is no way to resolve one row by looking at it (no row act, no open). app |
| E3 | no | after resolving, nothing says when the Rekordbox write will happen (it waits for Rekordbox to close, per the Devices row). app |
| E4 | no | no preview, no confirm, no undo on screen (History is the undo, unmentioned). app |
| E5 | yes | back to /devices, Devices pane stays open beside it. |
| E6 | yes | window table, count "0 of 3". |
| E7 | no | the key finding. The screen must show hub side, device side and base side by side. Observed: one cell "House -> Disco" (hub -> device, with the direction named only in a column header that is lost when the table collapses to rows), a "Kept" chip, no base at all: the 3-way merge's ancestor is not stored or returned (`hub_value`, `device_value` only, worker/routes/devices.ts:244). For "Peak time" both sides print "214 tracks in order". No recommended side other than the chip. Fix: columns (or a row's meta) "TrackVault: House | Rekordbox: Disco | Was: House", with the kept side marked, and for orders a diff (3 tracks moved). app (data shape + composition) |
| E8 | no | no failure state; if a write to Rekordbox fails the screen does not say. app |
| E9 | no | no keyboard hint for Select all / resolve. stack/app |
| E10 | no | no sidebar item (reached from Devices), which is fine, but "Conflicts" as a pane title under a "Devices" pane reads as a record. yes-ish. |
| F2 | no | Table: selection bar docked at the Pane's foot with "N of M chosen, Select all, acts" in the right order (yes); but "Select all" is a text link beside the count, not a header box. stack |
| F3 | yes | window; count is the total (3). |
| G1 | yes | back="/devices" is right for a pane after a list. |
| G2/G3/G4/G5/G6/G7/G8/G9/G10 | n/a | |

Top three (conflicts): 1) E7: only the changed pair, direction unlabelled once the table collapses, no base, and an order conflict shows identical values; 2) E4/D2: bulk writes to Rekordbox with no confirm and the undo only in a code comment; 3) the bar's blocked acts look different (one dim, one bright) and stand over an empty window.

---

## Backups (/_app/backups)
Shots read: backups/data-1920.png, backups/empty-1920.png
Source read: routes/_app/backups.tsx (all), ui/backups.ts (all), fixtures.ts:1392-1432
Machine findings: none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar, then Now, Schedule, On this hub, Offsite sheets. |
| A-1b | yes | local rows: title (date), state mark and word, meta (size, tracks, zstd, Offsite), age at end; offsite rows: title, meta, age. Same slots. |
| A-1c | n/a | |
| A-1d | no | headings "NOW 2", "SCHEDULE 2", "ON THIS HUB 3", "OFFSITE 2": the counts on "Now" and "Schedule" are not counts of things (Schedule always has 2 fixed rows); descriptions on 3 of 4 sections, none on Schedule. app |
| A-2a | yes | |
| A-2b | no | "Offsite" appears as a plain meta word on local rows (29.9 MB · 50,000 tracks · zstd · Offsite), as a section, and as a Schedule row; the "Offsite storage is on" row repeats Settings' "Send backups offsite". app |
| A-2c | yes | counts match rows. |
| A-2d | yes | |
| A-3a | yes | |
| A-3b | yes | |
| A-3c | no | local rows carry date, state, size, tracks, compression, offsite fact, age, more (3 meta + mark). Compression "zstd" is not for a DJ. app (backups.tsx:36-44) |
| A-3d | n/a (not shot) | |
| A-4a | no | "Each backup is checked when it is taken. Check one again to catch a disk that has gone bad since." is two sentences and an instruction; the Offsite description "Database backups in the bucket. To restore from them, run restore-offsite.mjs from the bundle with the hub stopped." is two sentences with a script name (backups.tsx:171, 189). app |
| A-4b | no | "bucket", "zstd", "restore-offsite.mjs ... the bundle" are jargon; the page title says Backups but the first section "Now" shows a finished backup (state "Done" 2 hr ago): "Now" holds history. app |
| A-4c | no | empty shot: a single sheet "Nothing here yet." with no section headings at all, though the source gives each section its own sentence ("No backups yet. Back up now, or wait for the hour set in Settings."). The first-run user sees no schedule, no hint, no act. Cause: not determined (the empty fixture probably returns nothing the sections draw); if real, the page vanishes. app/fixture |
| A-4d | yes | |
| A-5a | yes | no filled act; "Back up now" is an icon in the bar. |
| A-5b | n/a | |
| A-5c | yes | |
| A-6a | no | dots: green "Done"/"Checked", grey "Not checked" (waiting tone), spinner "Running"; each has a word. "Not checked" in grey on a backup nobody verified reads as nothing wrong. app |
| A-6b | yes | the gear row acts (opens settings) uses a gear; rows with `more` have no chevron. |
| A-6c | yes | |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | sections are one gap apart. |
| A-8a | n/a (state not shot) | |
| A-8b | no | empty does not read as data with rows gone (see 4c). |
| A-8c | n/a | |
| A-8e | yes | |
| A-8f | yes | |
| A-9a | no | vs the anchor list: 1) no band per day/week/month (the retention policy in Settings), one flat list of 3; 2) no summary row (what is the newest good backup); 3) state at the start of the meta line vs the anchor's end-group state. app |
| B1 | no | 720 of 1700 px; the page is a list. 956 px blank. |
| B2 | n/a | |
| B3 | yes | |
| B4 | yes | |
| B5 | yes | bar: two icons and more. |
| B6 | n/a | |
| B7 | yes | |
| C1 | yes | rows 50 px with state mark (V9 two lines). |
| C2 | n/a | |
| C3 | yes | |
| C4 | no | descriptions: Now one sentence, Schedule none, On this hub two sentences, Offsite two. app |
| C6 | yes | |
| D1 | no | the screen's most common act is "check the last backup is good"; no primary exists; "Back up now" and "Send offsite now" are two bare icons at the bar's end (x 1842) with only tooltips. app |
| D2 | no | "Delete" is destructive with confirm (backups.tsx:58-66) and its sentence is good ("A copy offsite stays"). yes. Back up now / Send offsite now have no confirm (not destructive): fine. yes |
| D3 | no | the two bar icons (a database-backup glyph and a cloud-upload glyph) are near-identical to the row leading icons (same database glyph on every local row and on "Next backup"), so the bar act reads as a row mark. app/stack |
| D4 | no | dates "Tue, Nov 3, 06:48" (en-US weekday, month, day, 24 h) vs the comment in ui/backups.ts:22 "Tue 3 Nov, 03:00"; ages "2 hr", "1 day". "383.7 GB free" belongs to the disk, not to the "Next backup" row it trails. app |
| D5 | yes | |
| D6 | no | "On this hub" / "Offsite" / "Now" / "Schedule": the user's words are "local backup" and "cloud copy". "Send offsite", "bucket". app |
| D7 | no | see 4c. |
| D8 | n/a (state not shot) | |
| D9 | yes | right amount, but a narrow page. |
| E1 | no | the one sentence a DJ needs is "Last good backup: 2 hours ago, checked, copied offsite". It is not drawn; the user has to read the first row of "On this hub" ("Tue, Nov 3, 06:48 · Checked · Offsite"). The status read already returns `lastBackup`, `lastVerify`, `lastOffsite` (fixtures.ts:1415-1417) and the page ignores them. app (backups.tsx:138-167) |
| E2 | no | main task: confirm the library is safe, and if not, back up now. Confirm = read the list (0 presses, but no summary); back up now = 1 press on an unlabelled glyph. app |
| E3 | yes | "Now" shows the running offsite upload live ("Running 412 of 3100 files · 21.4 GB left · 4.2 MB/s"), done and failed rows with the error text (ui/backups.ts:40-45). Gap: a failed backup older than the 6 newest jobs drops out of "Now" and no banner says "the last backup failed". app |
| E4 | no | restore is not an act: the page says "run restore-offsite.mjs from the bundle with the hub stopped" and nothing about restoring a local backup. The local row's more menu has Check now and Delete only. The safety path (what do I do if the disk dies) is documentation text, not a step. app (docs/deploy.md exists) |
| E5 | yes | Schedule row -> Settings (gear), empty sentences point to Settings. Backups jobs also appear in Jobs (same names "Database backup"). |
| E6 | yes | |
| E7 | n/a | |
| E8 | no | an unreachable bucket draws as the Offsite section's empty sentence "The bucket could not be read: <error>" (backups.tsx:199): a raw error under a heading, no tone, no act to Settings, and no state in "Schedule" (it still says "Offsite storage is on"). app |
| E9 | n/a | |
| E10 | yes | System group; "Backups" = Pane title; the same words in Settings' section "Backups" and "Offsite storage". |
| F8 | no | no banner when the newest good backup is older than a day. app |
| G1 | yes | |
| G2 | yes | 4 sections, none in another; sections with `empty` sentences. |
| G3 | yes | |
| G4 | no | "Offsite" fact shown as plain meta text vs "Encrypted" as plain meta; consistent. yes |
| G5-G10 | n/a | |

Top three (backups): 1) E1/E4: the page never says "last good backup, offsite copy current" and gives no restore step (a CLI script name in a description); 2) E8/F8: a failed or unreachable backup surfaces only as a job row or an empty sentence; 3) the empty shot loses every section and the page's acts are two unlabelled glyphs.

---

## Settings (/_app/settings)
Shots read: settings/data-1920.png (via viewport tiles), settings/viewport-1.png to viewport-6.png, empty-1920.png, loading-1920.png, error-1920.png, not-found-1920.png
Source read: routes/_app/settings.tsx (lines 1-60, 120-560 scanned)
Machine findings: none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar, then Library, Soulseek, Inbox, Auto-tag, Cover art and analysis, Playlist import, Backups, Offsite storage, Account. |
| A-1b | no | field rows differ: 53 fields, a label column of 207 px (x 257-464) all ok, but each row is 80 px (e.g. "Library folder" row y 112-192): label + "Optional" under it, the control, then the description 24 px under the control, so a one-line input costs 2.5 rows. Switch rows put the switch 450 px from its label at x 935. stack (Form row) + app |
| A-1c | n/a | |
| A-1d | no | headings uppercase, one description each, but the descriptions run 2 lines with a 58-character measure (Auto-tag, Offsite) and the sheet's action rows ("Browse the hub's folders", "Test the connection", "Back up now") each stand as a second sheet under the group with no heading; "ACCOUNT 2" carries a count, no other heading does. app |
| A-2a | yes | |
| A-2b | no | "Optional" is drawn under all 53 labels (e.g. "Library folder / Optional", "Hour of the day / Optional") : a fact repeated 53 times. The settings procedures take patch-style optional inputs, so the Form's optional mark fires on every field. Fix: stack's Form with `commit: "field"` should not draw the optional mark (a field that saves itself has no "required" contrast), or the app declares the inputs as non-optional. stack (form/index.tsx:496 `optional={!derived.required}`) |
| A-2c | yes | |
| A-2d | yes | |
| A-3a | yes | |
| A-3b | yes | |
| A-3c | n/a | |
| A-3d | n/a (not shot) | |
| A-4a | no | descriptions that are instructions or two sentences: "Providers are asked about a track and what they agree on waits in Review. A provider with no key or user agent is not asked." (two sentences, hard to parse); "The database is copied while the hub runs, checked, packed and kept by the policy below. Music files are not in it: they stay on disk and go offsite."; "Any S3-compatible bucket: AWS S3, Cloudflare R2, Backblaze B2, MinIO. The keys need to read, write and delete in the bucket." app (settings.tsx:237, 370, 443) |
| A-4b | no | jargon a DJ does not know: "slskd address", "slskd API key ... (web.authentication.api_keys)", "Longest peer queue", "user agent" ("TrackVault/1.0 (me@example.com)"), "Needs fpcalc on the hub to fingerprint files", "ISRC", "Endpoint", "Bucket in the host name", "Region", "Access key id", "AES-256-GCM", "audio/<hash>.<ext>", "zstd (smallest, fast)", "Same recording threshold" vs "Same song threshold" (the Duplicates screen calls these exact/acoustic/fuzzy). app |
| A-4c | n/a | |
| A-4d | no | "Browse the hub's folders / Pick the folder instead of typing its path": a mechanic; should be a pick on the field. app (settings.tsx:93) |
| A-5a | yes | no filled act; `commit: "field"`, no bar. |
| A-5b | n/a | |
| A-5c | yes | |
| A-6a | no | Remove marks on secret fields: a red trash glyph at rest on 6 fields (x 928) in the danger colour: danger hue not on a state. The masked value "••••••••ab12" reads as an input value, not "Saved". Expected (F7): "Saved, ends in ab12" and a Remove act. stack (secret control) |
| A-6b | yes | |
| A-6c | no | switches are 450 px from their labels with the description between: the eye pairs the switch with the wrong row on a 720 px sheet. stack |
| A-7a | n/a | |
| A-7b | yes | label column 207 px on all groups. |
| A-7c | n/a | |
| A-7d | yes | sections one gap apart (y 272 to 297 to 381: the action sheets stand 24 px under their group, ok). |
| A-8a | yes | loading-1920.png: same 5401 px height as data, same sections, labels and descriptions stay, controls are pulse blocks; the picker ("Quality wanted", "Policy", "Compression") is a small 20 px square instead of a picker's width and the "Optional" labels are drawn while loading. No shift. |
| A-8b | n/a | empty-1920.png is identical to data (same values): fixture, the form has no empty form. |
| A-8c | no | error-1920.png: seven sections each draw "This didn't load." with a Retry (7 Retry buttons for one cause), while the action rows between them ("Test the connection", "Back up now", "Send everything now", Encryption key) stay live and pressable over an unloaded form. Pane has no `read` (settings.tsx:52), so the page-level form (one sentence, one Retry) is not used. app (give the Pane a combine of the six reads) |
| A-8c' | no | not-found-1920.png: "Couldn't find this." with a "Back" act, seven times, on a place with no record to find. stack (a read that 404s on a top-level place draws a record form) |
| A-8e | yes (dark) | |
| A-8f | no | "Optional" and the 12 px descriptions in the faint ink at 80 px rows read hard to see on the sheet (tile 1: "For example http://localhost:5030."). stack (faint ink) |
| A-9a | no | vs the anchor settings screen (Linear: a titled column of grouped rows): 1) their row is one line (name left, control right), ours is 80 px with a 3-line stack; 2) they have no "Optional"; 3) they page-group with a left list of sections; ours is a 5400 px scroll. app (composition) + stack (Form row) |
| B1 | n/a | settings is a record-width form (720): correct. |
| B2 | n/a | |
| B3 | yes | |
| B4 | yes | |
| B5 | yes | bar: one refresh icon (x 1880). |
| B6 | n/a | |
| B7 | yes | |
| C1 | no | rows 80 px; controls 32 px. stack/app |
| C2 | yes | one label width: 207 px on every group. |
| C3 | yes | |
| C4 | no | see 1d. |
| C6 | yes | |
| D1 | yes | none, correct for field-commit. |
| D2 | yes | "Remove" of a secret: no confirm visible in source scan; "Clear" n/a. unverified: I did not open the secret control to see its confirm. |
| D3 | no | trash glyph has no word at rest (accessible name unverified). stack |
| D4 | yes | units in descriptions ("kbit/s", "Percent", "Days") instead of a column header: acceptable in a form, but "Percent." and "From 0 to 100." and "0 to 23, the hub's local time." are three styles. app |
| D5 | n/a | |
| D6 | no | glossary: "Soulseek" section vs sidebar "Search/Downloads/Wishlist"; "Auto-tag" vs sidebar "Review"; "Inbox" settings "Approve new tracks" vs Review; the backup settings repeat the Backups place. app |
| D7 | n/a | |
| D8 | yes | see 8a. |
| D9 | no | 53 fields on one 5400 px page with nine groups, no way to jump (no sticky sections, no search, no sidebar sub-items). Too much per page; the rare ones (S3 region, bucket in host name, upload speed limit) stand at the same level as the daily ones. app |
| E1 | yes | section titles name the parts. |
| E2 | no | main task: set the library folder (first run) or check a provider key. Library is first (good). Presses: type, blur to save = 2. The "Test the connection" row for slskd stands 7 rows below the key it tests, and results are a toast. app |
| E3 | no | per-field save feedback: no state in the shots (no "Saved" mark); I could not check. "Setting it scans it" for the library folder is a side effect described in help, with no confirm. app |
| E4 | no | changing the library folder starts a scan; backup folder, keep policy (keep daily 7) can delete old backups on the next run; no preview. app |
| E5 | no | settings do not link to their places (Soulseek -> Downloads, Offsite -> Backups, Backups -> Backups page). app |
| E6 | n/a | |
| E7 | n/a | |
| E8 | no | no field says it is wrong; the only check is a "Test the connection" row whose result is not on the page; the providers whose key is missing ("Discogs token" empty, "Beatport access token" empty) stand switched on/off with no warning that Discogs is on but cannot work. app |
| E9 | no | no shortcut hints. |
| E10 | yes | "Settings" bottom of System; Pane title same. |
| F7 | no | masked hint is "••••••••ab12" inside the input, not "Saved, ends in ab12"; Remove is a red trash at rest; an unset secret ("Discogs token", "Beatport access token") is an empty box with no "Not set" word, so set vs unset are not distinguishable at a glance. stack |
| F8 | n/a | |
| F9 | no | error-1920.png: yes each failed read draws in its own Section (7 forms), but the page as a whole shows 7 times the same sentence; the rule "a repeated line is accepted" (rules.md:344) is met; the Pane could hold one read. app + stack |
| F12 | n/a | |
| G1 | yes | |
| G2 | no | action sheets ("Browse the hub's folders", "Test the connection", "Back up now") stand as lists outside sections under their group: a list outside a section is its own sheet (allowed), but with no heading they read as part of nothing. app |
| G3 | yes | |
| G6 | no | groups yes; labels are nouns ("Library folder", "Bitrate margin") but also questions/verbs ("Download for the wishlist", "Back up every day", "Send backups offsite", "Encrypt before sending"); `commit: "field"` ok (no bar); label column shared. "optional" marks on every field. app/stack |
| G8 | yes | |
| G10 | n/a | |

Top three (settings): 1) 53 fields at 80 px each over 5400 px with "Optional" under every label and no way to jump (D9, A-2b); 2) secrets: no "Saved, ends in..." wording, red trash at rest, unset secrets look the same as empty text (F7); 3) jargon and hidden failure: slskd, fpcalc, ISRC, "bucket in the host name", and a provider can be on with no key and nothing says so (E8).

---

## Stats (/_app/stats)
Shots read: stats/data-1920.png, empty-1920.png, loading-1920.png, error-1920.png, not-found-1920.png
Source read: routes/_app/stats.tsx (all); stack bar-chart/index.tsx lines 56-115, 186-189, 258-290
Machine findings: none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar, Stats row, charts, lists. |
| A-1b | no | the lists: Genres rows: icon, name, count; Formats rows: icon, name + meta, count (2 lines); Most played: name + artist. The count has no separators in the lists ("9000", "41000") but the Stats row says "50,000" and charts say "44.1K tracks", "42,852 tracks", "50K tracks", "8,526 tracks": 4 forms on one screen. stack (Row `count`, BarChart head) |
| A-1c | n/a | |
| A-1d | no | "GENRES 6", "FORMATS 3", "MOST PLAYED 3", "LEAST PLAYED 2" carry counts; the chart headings (TEMPO, KEYS, ADDED, LAST PLAYED) carry a figure line under the label ("44.1K tracks") instead of a count and none has a description. app/stack |
| A-2a | yes | |
| A-2b | no | Formats row "MP3 / mp3" and "FLAC / flac": the meta repeats the name (stats.tsx:144-145), only M4A / aac adds a fact. app: drop the meta when equal |
| A-2c | no | Tempo head "44.1K tracks", Keys "42,852 tracks", Last played "50K tracks" vs "Tracks 50,000": tracks without BPM or key (5.9K, 7.1K) are not stated, and "Last played" counts never-played tracks while "Never played 31,000" is a separate cell. app |
| A-2d | yes | |
| A-3a | yes | |
| A-3b | yes | |
| A-3c | yes | |
| A-3d | n/a (not shot) | |
| A-4a | no | none of the 8 sections has a description (what is "Tempo"? bins of 5 BPM is only an aria label). app |
| A-4b | no | "Keys" (Camelot keys), "Added" (per month), "Last played": nouns ok; "Never played" cell with a link. |
| A-4c | no | empty-1920.png: the figure row still shows the full numbers (50,000 / 4,583 hours / 550 GB) while all charts say "Nothing here yet." (stack's generic sentence three times in a row) and Genres shows a lone "No genre 420"; contradictory (fixture). The sentences differ: "Plays arrive from Rekordbox." (good), "Formats show here once the library is scanned." Charts have no `empty` sentence. app (stats.tsx:63-110 give each chart an empty) |
| A-4d | yes | |
| A-5a | yes | |
| A-5b | n/a | |
| A-5c | no | all charts one teal series colour: fine; the single "Never played" bar in Last played is the tallest and not named. See F11. |
| A-6a | n/a | |
| A-6b | no | Genres/Most played rows open (href) with no chevron: correct; chart bars look pressable-free; the bars do not open "tracks in this key" though the data is exactly a filter. app |
| A-6c | yes | |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | |
| A-8a | no | loading is 2126 px tall vs data 1918 px: a 208 px shift. The list skeletons draw 4 two-line rows each (Genres 4 rows of 47 px vs data 6 rows of 32 px; Least played 4 rows vs 2 rows of 50; Formats 4 vs 3). Chart skeleton 430 x 120 plot vs data 492 x 130. stack (list skeleton is a fixed 4 two-line rows) |
| A-8b | no | empty keeps the toolbar-less layout but the figure row stays populated; headings stay. |
| A-8c | no | error-1920.png: 14 retry forms for one failure (5 cells with the red "!" glyph + a refresh glyph + "This didn't load." and 9 sections with an icon, the sentence and a Retry), 1250 px tall where the loaded page is 1918. Each form is the right one per frame, but the page reads as 14 problems. stack (design accepted in rules.md:344) / app (the Pane could hold one combined read) |
| A-8c' | no | not-found-1920.png: "Couldn't find this." + "Back" nine times plus five red "!" cells: stats is a place, not a record; "Back" has nowhere to go (back={false}). stack |
| A-8e | yes | |
| A-8f | yes | |
| A-9a | no | vs the anchor (a screen of grouped rows with counts): 1) the anchor's data stand in the page's width, ours charts at 492 of 720 px; 2) their figure strip is one band, ours is a band of 5 cells with units detached; 3) ours has 4 charts that cannot be acted on. stack/app |
| B1 | no | stats column 720 px, 956 px blank. |
| B2 | n/a | |
| B3 | yes | |
| B4 | yes | |
| B5 | yes | |
| B6 | no | CONFIRMED. (a) Fill: the plot spans x 280-736 (456 px) plus the axis lane 244-280, i.e. 492 px of the 720 px column (68%); the 228 px right of each chart is empty, while the Stats strip and the lists above and below span 720 px. Not set in bar-chart/index.tsx (STACK is `flex flex-col min-w-0`, no max width; the cap is not found in that file): the chart sits at 68% inside the Section. stack. (b) Names: Tempo (`bar.at`, stats.tsx:70) names only "100 BPM" and "140 BPM" out of 9 bars; Added (`bar.at`, :94) names only "2025-01" and "2025-12" out of 12; Keys (`bar.label`) names every second bar (1A, 2A ... 12A, the 12 B bars unnamed); Last played (`bar.label`) names 3 of 6 bars ("Last month", "3 to 6 months", "Over a year"), the 2nd, 4th and 6th unnamed, and the 6th is the tallest (31K, "never played"). So Tempo and Added are app (should give `bar.label`: "100", "105"...; "Jan"... ), Keys and Last played are the stack's thinning made worse by the 68% width: at the full 720 px every Last played bar (113 px slot) and every key (28 px slot) would be named. (c) Stats row: 5 cells in one band 720 px: yes, reads as one band. Units "hours" and "GB" are pinned to the cell's end (x 490-520 and 648-664) detached from the figure by 25 px: stack. |
| B7 | yes | |
| C1 | yes | |
| C2 | n/a | |
| C3 | no | chart head "44.1K tracks": figure and unit share a baseline (ok); the unit in the Stats cell ("hours", "GB") sits at the cell's end. stack |
| C4 | no | see 1d. |
| C5 | n/a | |
| C6 | yes | |
| D1 | n/a | no act except links. |
| D2 | n/a | |
| D3 | no | "Never played 31,000" is a link inside a Stats cell but nothing marks it pressable. stack |
| D4 | no | see A-1b: 4 count formats on one screen; "4,583 hours" for a library duration ("191 days") unreadable as time. app (stats.tsx:47) |
| D5 | n/a | |
| D6 | no | "Keys" (library calls "key" on tracks), "Added" (sidebar "Recently added"), "Last played" ok. |
| D7 | no | see 4c. |
| D8 | no | see 8a. |
| D9 | no | too much one-way: 4 charts and 4 lists, none acting; and none says anything about quality (vision: "quality score") or growth over time vs total. app |
| E1 | no | a DJ cannot say in one sentence what "Stats" tells them; no sentence of state ("8,200 artists, 31,000 never played") beyond figures. |
| E2 | n/a | read-only screen; main use: spot what to fix (no genre 420, never played 31,000). Links exist on 3 of 8 parts (Never played, genres, No genre); charts have none. app |
| E3 | n/a | |
| E4 | n/a | |
| E5 | yes | rows link into the library with filters. |
| E6 | yes | aggregates. |
| E7 | n/a | |
| E8 | no | see error shot: no distinction between "hub down" and "this aggregate failed". |
| E9 | n/a | |
| E10 | yes | Library group, "Stats" = Pane title. |
| F9 | yes | each failed read draws in its own Section. |
| F10 | no | Stats cells: figure 24 at 500 with label above: yes in data; error: red "!" glyph + a refresh glyph + "This didn't load." at 12 px, the cell grows from 77 to 104 px; not-found: red "!" glyph and "Couldn't find this." (an alarm for "not found"). stack |
| F11 | no | see B6. Source: tempo/added app; keys/last played stack. |
| G1 | yes | `back={false}`. |
| G2 | yes | |
| G3 | no | Formats: leading file icon, name + meta, count; Genres: music icon: same glyph as tracks in Most played (Music icon on a genre row and on a track row, stats.tsx:118, 22): one glyph, two meanings. app |
| G10 | n/a | |

Top three (stats): 1) charts name 2 of 9 / 2 of 12 bars (app: use `bar.label`) and only 3 of 6 on Last played with the tallest bar unnamed, and every chart fills 68% of its column (stack); 2) four count formats on one page, and units pinned away from the figure; 3) 14 retry forms in the error state and a loading page 208 px taller than the loaded one.

---

## Set builder (/_app/sets)
Shots read: sets/data-1920.png, sets/empty-1920.png
Source read: routes/_app/sets.tsx (all)
Machine findings: none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | order: toolbar (search + energy pick), Find, figure strip, Energy chart, Set, Next. The set (the thing being built) stands at y 700 and Next at y 900 under a chart and a search list; the order is toolbar, results, score, chart, set, suggestions. app |
| A-1b | no | rows carry "Rendor · 125 BPM · 9A · Energy 6" in Find, Set and Next; Next adds the run-on `why` ("8A to 9A: adjacent; 126 to 127 bpm, +0.8% pitch; energy 6 to 7; never played") which wraps to 2 lines on rows 2 and 3 (rows 50 vs 68 px high). app (sets.tsx:216) |
| A-1c | n/a | |
| A-1d | no | headings "FIND 3", "SET 3", "NEXT 3" carry counts; "ENERGY" has a figure line "21 energy" (the sum of three energies: meaningless); no description on any. app |
| A-2a | yes | |
| A-2b | no | "Velvet Signal" appears in Find, Set (#1) and Next (3rd) (fixture); key+BPM repeated in `why` ("8A to 9A", "126 to 127 bpm") and in the fact line ("128 BPM", "5A"). app |
| A-2c | no | Empty shot: "Tracks 0" with "Mix score 64 %" and "Weak steps 1": figures of a set that has no tracks. app (sets.tsx:148-158) |
| A-2d | yes | |
| A-3a | yes | |
| A-3b | yes | |
| A-3c | no | Next rows: name, 4 facts, why-sentence, score, add act (see 1b). app |
| A-3d | n/a (not shot) | |
| A-4a | no | none; the toolbar's pick "Energy: Keep the energy" reads as a label glitch ("Energy" label + "Keep the energy" value). app (sets.tsx:19-23, 120) |
| A-4b | no | "Mix score", "Weak steps", "Weak step", "clash", "adjacent", "pitch" (+0.8% pitch from a fixed `pitch: 8`, sets.tsx:46, never shown): Camelot terms explained nowhere on the page. app |
| A-4c | no | empty-1920.png: four empty sheets stacked (Find "Search the library to add a track.", Energy "Nothing here yet.", Set "Add a track to start the set.", Next "Suggestions follow the last track of the set.") plus a populated figure strip: 5 boxes for a first run, none with an act; "Start from a playlist" (the quickest way in) is a bar icon in the more menu. The Energy empty is stack's generic sentence (no `empty` given, sets.tsx:159). app |
| A-4d | no | "Find a track to add" ok. |
| A-5a | yes | no filled act. Save is an icon. |
| A-5b | n/a | |
| A-5c | no | the weak step is the only status hue (amber dot + warning glyph): correct. |
| A-6a | no | amber dot + triangle glyph on "Weak step" row 3: two marks for one state. app (status and warning are both set, sets.tsx:186-190) |
| A-6b | yes | |
| A-6c | yes | |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | |
| A-8a | n/a (state not shot) | |
| A-8b | no | empty does not read as data minus rows: the strip keeps data numbers. |
| A-8c | n/a | |
| A-8e | yes | |
| A-8f | yes | |
| A-9a | no | vs the anchor list: 1) the anchor groups by band, ours by 3 stacked sheets with no relation; 2) facts the DJ compares (BPM, key, energy) are in a sentence, not columns; 3) one-line rows there, 2 lines here. app |
| B1 | no | 720 px of 1700; 956 px blank right where the Next list could sit beside the Set. app |
| B2 | n/a | |
| B3 | yes | |
| B4 | yes | |
| B5 | no | bar holds Save, more; toolbar (search 244-767 and a 192 px pick) is one row: fine. yes |
| B6 | no | Energy chart: 3 bars at 456 of 720 px, y axis 0-8, x names "9A" under the first bar and "11B" under the last (`bar.at: point.camelot`, sets.tsx:166): the chart of energy is labelled by key and the middle bar is unnamed; a 40-track set would be 40 bars named only at its ends; stack's fill (68%) as on Stats. App: use `bar.label` = position or track; stack: fill. |
| B7 | yes | |
| C1 | no | row heights 50 / 68 px (see 1b). |
| C2 | n/a | |
| C3 | no | the "%" of "Mix score" is pinned to the cell end (x 706) while the figure "64" ends at x 525: 180 px apart. stack (Stats unit placement) |
| C4 | no | |
| C6 | yes | |
| D1 | no | the screen's most common act is "add the next track": the "+" on a Next row (1 press), correct; "Save as a playlist" (the finishing act) is a bare icon. app |
| D2 | yes | Clear the set has confirm (sets.tsx:103-106) and sits in the more menu. |
| D3 | yes | row acts have labels in source ("Add X to the set"). |
| D4 | no | facts as text ("125 BPM · 9A · Energy 6"): a DJ cannot scan 20 tracks for the BPM/energy flow; durations absent (a set has a length). app |
| D5 | no | weak step = amber dot + word + glyph: fine. |
| D6 | no | "Set" (section), "Set builder" (sidebar), "playlist" in the Save sheet; "Find/Set/Next" vs "Weak steps"; "Mix score". app |
| D7 | no | see 4c. |
| D8 | n/a (state not shot) | |
| D9 | no | too much vertical: strip, chart and Find above the set; too little horizontal. |
| E1 | no | the page does not say what it is: a search box and a pick, then three sheets. "Set builder" in the bar; no sentence "Pick a first track, then add what fits". app |
| E2 | no | main task: build a set fast. Path: type in search (1), "+" (1) per first track; thereafter "+" on a Next row (1 press per track), good. Faults: Next (the thing you press) is below the Set and the chart, at y 900 with 3 tracks and past the fold after about 10 tracks (rows 50 px each), so you scroll up and down for every add; reorder is drag with no handle needed; "Start from a playlist" and "Clear" are hidden in the more menu. Fix: Next beside the Set (the right 956 px are blank), or above it. app |
| E3 | no | add shows no toast/feedback beyond the new row; a mix score changes silently. n/a-ish. |
| E4 | yes | clear has a confirm; remove is one press with no undo (the set is a draft: low harm). |
| E5 | yes | rows link to the track; Save sheet describes the playlist and Rekordbox; the Set is not shown in Playlists until saved. |
| E6 | yes | suggestions limited to 15 (sets.tsx:48). |
| E7 | no | decision support: Next shows score 92%, the reasons in a run-on sentence and four facts, but not the facts the choice turns on side by side with the last track: BPM delta, key relation (Camelot step), energy delta are words in `why`; the "from" track is not named (the sentence says "8A to 9A" with no track); the weights of the score are not stated; no recommended pick other than the order (92% first). The weak step says "8A to 3B: clash" good. Fix: columns for key/BPM/energy with the last track's value on top and the deltas in the cells. app (sets.tsx:216) |
| E8 | no | no state for "tracks without BPM/key/energy" (`No BPM`, `No key` words only in the facts), which silently drop from suggestions or score; nothing says so. app |
| E9 | no | no keyboard (Enter to add the top suggestion): n/a. |
| E10 | yes | "Set builder" = Pane title; it stands in Library next to "Inbox" and "Stats", away from "All playlists" which it saves into. app |
| F4 | no | reorder by drag: the row has no order handle, the numbers "1. 2. 3." in the title show the order (yes); the "..." menu has reorder entries (not verified). |
| F11 | no | see B6 (energy chart named by key at the ends only). |
| G1 | yes | |
| G2 | no | the figure strip stands between sections as a Card on the table; allowed (non-row content). |
| G3 | no | rows with marks: "Weak step" dot + glyph + "8A to 3B: clash" on the meta line, then the facts: the marks line and the meta share a line (V9: marks lead the meta line). yes |
| G5 | yes | toolbar bare on the table, search leading. |
| G8 | no | the "Energy: Keep the energy" pick draws its own label inside; fine. |

Top three (set builder): 1) E2/E7: the "Next" suggestions stand under the set and the chart, one scroll away after a few adds, and the reasons are a run-on sentence instead of compared facts (BPM, key step, energy delta); 2) the energy chart is named by key at its ends only, fills 68% of its column, and its head says "21 energy" (a sum); 3) the strip shows "Mix score 64%" with 0 tracks, the first run is five empty sheets and the way in (Start from a playlist) is in a menu.

---

## Frame states (loading, error, not-found) from settings and stats
Shots read: settings/{loading,error,not-found}-1920.png, stats/{loading,error,not-found}-1920.png

| Item | Answer | Evidence |
| --- | --- | --- |
| C8a (loading keeps the loaded shape) | settings yes; stats no | settings loading is the same 5401 px as data, same sections and labels, pulses where values land. Stats loading is 2126 px vs 1918 (+208): list skeletons are 4 two-line rows each regardless of the data (Genres 6 one-line rows, Least played 2). stack |
| C8c (not-found and error each one form) | no | the form is one per frame, but a page of many frames repeats it: settings error 7x "This didn't load." + Retry; stats error 14 (5 cells with a red "!" + refresh glyph + sentence, 9 sections with Retry); not-found 7 and 14 "Couldn't find this." + "Back" (settings) / red "!" cells (stats). Not-found on a top-level place (no id) has no meaning, and "Back" leads nowhere (`back={false}`). stack (not-found on a place) / app (settings.tsx:52 and stats.tsx:41: Pane has no `read`, so the whole-page form with one Retry is not used) |
| D8 (waiting: loaded shape, no second layout) | settings yes; stats no | see C8a; no spinner over a blank page in either. |
| F9 (each failed read in its own Section) | yes | settings error: 7 Section frames; stats error: 9 Section frames and 5 cells; none takes the page; the action rows between stay live (settings: "Test the connection", "Back up now", Encryption key). |
| F10 (Stats cell as frame) | partly | data: figure 24 at 500, 12 px label above it, unit detached; error: cell shows red "!" + refresh glyph + 12 px "This didn't load." (cell 104 px vs 77: grows 27 px); not-found: red "!" and "Couldn't find this." (an alarm tone for missing). stack |

---

## Across the group

Inconsistencies between the group's screens
- Page width: devices, backups, stats, set builder and conflicts all stand at 720 px, leaving 956 px (devices, backups, stats, sets shots) or 436 px (conflicts shot) blank. Settings is the only one where 720 is right.
- Dates and ages: backups "Tue, Nov 3, 06:48" (en-US weekday-month-day) vs rows' ages "2 hr", "3 days", "3 mths" (devices) vs "30 sec": two abbreviation sets; source comment (ui/backups.ts:22) promises "Tue 3 Nov".
- Counts: devices "47,900 files", stats lists "9000", stats Stats strip "50,000", chart heads "44.1K / 42,852 / 50K / 8,526". Four formats in the group.
- Section counts: backups "NOW 2 / SCHEDULE 2" (fixed), sets "FIND 3 / SET 3 / NEXT 3", stats "GENRES 6": counts mean rows in some, nothing in others.
- Empty states: sets shows five boxes, backups collapses to one box with no headings, stats keeps the figure strip, devices has a sentence but no act; stack's generic "Nothing here yet." appears in 4 places that have no `empty` (conflicts, backups empty, sets Energy, stats charts).
- Names: device/machine/agent/key (devices); backup "On this hub" / "Offsite" / "bucket"; set / playlist; "Kept"/"Take"/"Keep" (conflicts).

Stack findings (roster defects)
1. BarChart does not fill its Section column: plot 456 + axis 36 = 492 of 720 px (stats and sets shots; Stats strip and lists above and below are 720). Cause not located in bar-chart/index.tsx (no width cap in its class strings); the narrowing makes bar-label thinning drop names (Last played 3 of 6, Keys 12 of 24). Fix: make the chart `w-full` in the Section body.
2. BarChart label thinning keeps first and thins every second, dropping the last (tallest) bar on Last played: thin from the end or prefer the ends.
3. Stats cell: unit pinned to the cell's end ("%" 180 px from "64" in sets; "hours"/"GB" 25 px away in stats); error cell grows 27 px and uses a red alarm for not-found.
4. Form `commit: "field"`: the "Optional" mark is drawn under 53 labels; secret control: masked value in the input with a red trash at rest, no "Saved, ends in" wording, no distinction between unset and empty (form/index.tsx:496, secret control).
5. Form row height: 80 px for a one-line control (label + Optional + control + description 24 px below), the switch 450 px from its label.
6. List skeleton: fixed 4 two-line rows (stats loading +208 px shift).
7. Missing form on a place with no record: "Couldn't find this." + "Back" on settings and stats (seven and fourteen times); Table's selection bar draws for an empty window and its last act looks enabled while blocked (conflicts shots, "Keep TrackVault" bright vs "Take Rekordbox" dim).
8. Table collapsing to rows below 765 px drops its column headers, so the conflicts chip ("Kept") and the "TrackVault to Rekordbox" direction are unnamed.

UX: the flow as the user walks it
- DJ chain: Playlists -> Set builder (build, save) -> Devices (is the DJ Mac current?) -> Conflicts (settle). Set builder does not tell the set is in Rekordbox yet; Devices does not tell the DJ Mac holds the set's tracks; "41 tracks not matched" has no link. The chain breaks at Devices: the state is a sentence of 7 facts and an offline machine says nothing of what to do.
- Safety chain: Settings (backup policy) -> Backups (is it good?) -> restore. The page never states the last good backup, a failed one shows only as a job row for a while, and restore is a script name in a section description. Conflicts write into Rekordbox with no confirm and no on-screen undo.
- Set building: search, add, then scroll to Next after every few tracks; Next explains itself in a run-on sentence; key, BPM and energy are not compared in columns; the energy chart is named by key.
- Settings: one 5400 px page of 53 fields, no jump list, jargon (slskd, fpcalc, ISRC, bucket in the host name, AES-256-GCM), "Optional" under every label, secrets without "Saved" and a provider can be on with no key and no warning.

Not checked: the secret control's Remove confirm and its accessible names, settings per-field save feedback and the Save/more menus (no shot of interactions); the cause of the 68% chart width is not located in source (only measured); 320, touch and light mode (not shot).
