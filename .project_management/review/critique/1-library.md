# Library and playlists

Convention: 1920 dark only was shot, so 320, touch and light items are `n/a (not shot)` throughout. Library
(`/_app/library`) carries the full table. `recent` is the same `LibraryPane` with `recent` set
(`routes/_app/recent.tsx:9`), so its rows say "as Library" unless they differ. Record, Playlists and Playlist
carry their own tables with only the answers that differ or matter; an item not listed for a screen is "as the
Library row". Tags: **app** = TrackVault composition, **stack** = roster component, looks wrong wherever used.

Key measurements (1920x1080 viewport shots):
- Pane page bar 44 px tall; sidebar 220 px; list content x 244 to 964 = 720 px (`--container-reading`, tokens.ts:1120).
- Alone: the canvas is x 220 to 1920 (1700 px); content stops at 964, leaving a blank band 956 px wide (56 percent).
- With a record open: list pane 220 to 739 (520), record body 764 to 1484 (720), blank band 436 px to the right edge.
- Playlist detail: tree pane 220 to 739, track table 764 to 1484, blank band 436 px.

## Is the library a wide Table or list rows? (asked by the brief)

**List rows, at every state shot, and for an app reason.** `LIBRARY_COLUMNS` (lib/library.tsx:20) declares 12 columns
(5 `hidden`), but the Table picks its form from its own measured width: grid from `BREAKPOINT_PX.tablet` (768),
one `Row` per record below (`table/index.tsx:355`, `useWide`). `LibraryPane` renders `<Pane title back actions>`
with no `wide` (lib/library.tsx:166), and a Pane without `wide` caps its children at `max-w-reading`
(`pane/index.tsx:80`, `MEASURED = "*:max-w-reading"`, 720 px). 720 < 768, so the table is always in list form,
even at 1920 with nothing open. `grep wide` over `src/app` returns nothing: no screen of the app has a wide Pane,
which is the V17 breach ("a list page is `wide`") behind the "list pages stop at 720" defect.

Consequences for a 50k-track DJ library:
- No header sort and no sort mark. The sort is a bare "Sort" picker above the sheet (x 922-962, y 151) that does
  not say which column or direction is active.
- No BPM and Key columns to scan. BPM, key, genre, time and energy are one meta string "Kalomi · BPM 120 · 8A · House
  · Time 5:00 · Energy 1". Number columns are prefixed with their label ("BPM 120", "Time 5:00", "Energy 1") and text columns
  are not (key "8A", genre "House"), so the string is mixed and is read, not scanned. A DJ sorts by BPM/key and compares
  neighbours down a column; with a string you cannot.
- No columns menu (5 hidden columns: Mix, Rating, Quality, LUFS, Added never reachable), no frozen columns.
- 17 rows are on screen at 1080; a grid at 32 px would show about 30.
- Not right for this user. Fix (**app**): `<Pane wide>` on `LibraryPane` and the playlist Pane. Alone, at 1676 px the grid then
  draws. With a record open the list pane is 520 px, so rows are the only form that fits there (V14, V17: correct by the
  voice, bad for a table app). **stack** gap: a list beside a record can never be a grid, because the list Pane is
  fixed at `--container-list` 520 and the grid needs 768. Either let the Table draw a compact grid (title, BPM, key) from about 440 px,
  or have the record open over the list (`cover`) when the list is a wide table.

## All tracks (library)
Shots read: library/{data,empty,loading,error,not-found}-1920.png, viewport-1920x1080.png, ticked-1920x1080.png, playing-1920x1080.png
Source read: routes/_app/library.tsx, route.tsx, lib/library.tsx, lib/queue.ts, ui/track.ts; stack table/index.tsx, action-bar/base.tsx, pane/index.tsx, shell/player.tsx, shell/index.tsx
Machine findings (from the run log): none (70 shots, 35 files, all passed; loading/error/notFound 12 shots passed)

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | viewport shot: toolbar bare (search + "Filters"), sheet of rows, selection bar at foot. Order right. |
| A-1b | yes | every row: name, meta line, age, play act. Same on Recent and playlist rows. |
| A-1c | n/a (no definition list on the list) | |
| A-1d | no | The list has no Section heading or band at all: no count of the library ("48,210 tracks") anywhere but the foot "0 of 48210 tracks chosen". Fix: Pane/Section title count or a band. **app** |
| A-2a | yes | no empty fact rows in the list. |
| A-2b | no | the count is told once, in the bar; but the row age "3 sec", "1 hr" is the Added column sort key not labelled: unclear what the age is (added, modified?). Fix: add "Added" to the meta or header. **stack** (list form drops the header) |
| A-2c | no | "0 of 48210 tracks chosen" has no thousands separator while Playlists says "1,320 tracks" (playlists data shot) and Filters use `count.format`. Fix: stack's `chosenNounOf` word fill formats the number (`action-bar/base.tsx:Count` uses `String(chosen.count)`). **stack** |
| A-2d | yes | no empty end group; the tick column is reserved, all rows tickable. |
| A-3a | yes | no meta truncates at 1920 (rows 720 wide). At 1280 not shot. |
| A-3b | yes | no 6-letter word truncated. |
| A-3c | no | each row: name, one meta of 6 parts (artist, BPM, key, genre, time, energy), age, play act, tick. V9 says name + meta + end group; the meta string of six is too much to scan (see above). **app/stack** |
| A-3d | n/a (not shot) | |
| A-4a | n/a (no section descriptions on the list) | |
| A-4b | yes | "All tracks", "Recently added", sentence case. |
| A-4c | no | empty-1920.png: "Nothing here yet." and no act, on a library that is empty. V15 and D7: it should say what fills it ("Scan the library folder or add files to the Inbox") and offer the act (Scan now). Also the selection bar "0 of 0 tracks chosen" with nine disabled acts still stands under an empty list. Fix: `empty={{ sentence, act }}` in the Table, hide the bar when `total` 0. **app** for the sentence, **stack** for the bar over an empty read. |
| A-4d | no | bulk-edit sheet description: "Empty keeps a tag, a dash clears it." and "Keep as is when empty." repeated on 10 fields (lib/bulk-edit.tsx:15). Playlists empty: "drag tracks onto it or use Add to playlist" (routes/_app/playlists.tsx:216). Mechanics in words. **app** |
| A-5a | no | primary filled act in the bar is "Edit tags" (ticked shot x 889-963, y 1043-1073, accent fill): last act of nine. Common task is Add to playlist. Fix: Add to playlist is the primary (order it last, the bar fills the last), or fold the rest. **app** (the bar fills the last act by design). |
| A-5b | n/a (no pills in rows) | record shows fact pills |
| A-5c | yes | no hierarchy by colour; "Quarantine" is red text (destructive tone, ticked shot x 668-757), correct. |
| A-6a | no | the row's trailing act is a play triangle on all rows (identical glyph repeated 17x); the page bar's only act is a circular-arrows icon `RefreshCw` that means "Scan now" (library.tsx:174) but reads as reload; tooltip only. Fix: `ScanSearch` or `FolderSync`. **app** |
| A-6b | yes | no chevrons on opening rows. |
| A-6c | yes | nothing pressable that is not. The tick boxes are dark outlined squares: low contrast vs the sheet (ticked shot x 266-282): unticked box edge about 2:1, visible but faint. **stack** (Checkbox edge colour in a row) |
| A-7a | yes | first row y 166 on both panes in the with-record shots. Record starts at y 70 (overline), list at 75 (search): off by 5 px (record head has no bar-aligned control). minor. |
| A-7b | n/a (no definition list on list) | |
| A-7c | n/a | |
| A-7d | yes | toolbar to sheet 44 px (sort row between), not a sections gap: the "Sort" line floats between the toolbar and the sheet with its own 32 px band. **stack** |
| A-8a | no | loading-1920.png: 4 skeleton rows and the selection bar says "0 of 0 tracks chosen" with nine acts. Loaded form has 17+ rows. The skeleton is the loaded form (title + meta + age); acceptable, but the bar states a false total while waiting. Fix: paint the bar as pending (the `painted` path exists in `ActionBarBase`, `of: painted ? 0`) show "--" not 0. **stack** |
| A-8b | no | empty-1920.png drops the "Sort" row (data has it) so the sheet moves up 28 px, and an empty library still shows the full selection bar. **stack/app** |
| A-8c | yes | error: icon + "This didn't load." + Retry; not-found: "Couldn't find this." + Back; one form each. But the not-found sentence is the generic one ("Couldn't find this.") not the library's noun. Library list has no `noun`. low. |
| A-8d | n/a (not shot) | |
| A-8e | yes | dark reads as drawn, slate sidebar, sheet a step lighter. |
| A-8f | no | the disabled acts in the bar ("Add to playlist" ... "Organise" at 0 chosen, viewport shot y 995) are `ink-disabled` on a surface: about 2.5:1, deliberate for disabled. The reason line "Choose tracks first." at 12 px in meta ink at y 1065 is fine. No finding beyond that disabled nine acts are loud noise at rest (see B5). |
| A-9a | no | Against Linear's issue list (grouped bands, many columns: title, status, assignee, date on one 32 px row): (1) rows carry one 44-50 px two-line cell with a text meta string, not columns (**app**: no `wide`); (2) no group bands or counts, no active-filter chips under the toolbar (**app**); (3) the bottom bar is a toolbar of nine buttons over two lines where Linear shows a floating compact bar with 3-4 acts and a menu (**app**/**stack**). |

| B-1 | no | list stops at x 964 of 1920 canvas: 956 px blank band (viewport shot). Same on Recent, Playlists (data-1920 right of x 964), Playlist detail alone. Fix `wide`. **app** |
| B-2 | no | record is 720 wide at 764-1484 and the list pane 520: read as one page, but a 436 px dead band on the right; on a 1920 monitor the record could hold the 720 plus a side column (cover, waveform) there. The 400 px square cover card pushes the editable Tags to y 1070 and below (record viewport). **app** |
| B-3 | n/a (list form, no horizontal scroller exists; the wide grid is never drawn) | |
| B-4 | yes | list sheet left edge x 245 under the toolbar's x 244; record sections x 764. |
| B-5 | no | **Selection bar wraps**, measured. Alone (library viewport): bar is 107 px tall (y 973-1080, 10 percent of the screen) in three rows: acts row 1 (Add to playlist ... Organise, x 309-964, y 995), row 2 (Apply rules, Edit tags, y 1033) and the reason line "Choose tracks first." (y 1065). The count text "0 of 48210 tracks chosen / Select all" (x 244-440, y 1027) stands in the left gap beside row 2. With a record open (library/$trackId viewport, 470 px bar): acts wrap to row 1 (Add to playlist ... Quarantine, x 266-715) and row 2 (Find duplicates x 337-452, Organise, Apply rules, Edit tags, y 1033), and "Find duplicates" **overlaps** the text "0 of 48210 tracks chosen" (x 244-380) and "Select all" (x 392-440) by about 100 px. In ticked-with-record the "Select all" and the "..." fold are covered by "Find duplicates" at y 1043-1073. Cause: nine acts in one bar; `ACTION_BAR_ACTS` wraps (`action-bar/base.tsx` ACTS.end = flex-wrap justify-end) while the count row is `justify-between` and not given a reserved start width. Two fixes: **app**: stand four acts (Add to playlist, Auto-tag, Quarantine, Edit tags) and put Fetch art, Analyse, Find duplicates, Organise, Apply rules in a `more`; **stack**: the ActionBar must reserve the count's width (the acts wrap within the room left of `COUNT`, never over it). |
| B-6 | n/a (no chart) | |
| B-7 | no | sidebar 220 yes; first row on the bar's line yes (y 21 both). Dock yes across the foot (playing shot y 1030-1080, x 220-1920), does not cover the last row (rows end above the bar) and sits under the selection bar: bar 946-1030, dock 1030-1080, together 134 px (12 percent) of the viewport. But sidebar: footer group is not pinned. The app never sets `end: true` on Settings (route.tsx:107; `PlaceSpec.end` exists, descriptors.ts:606) so System is an ordinary group; with the playlist folder expanded (playlists/$playlistId viewport) the sidebar overflows: "Jobs" and "Settings" are off the bottom (last visible "Backups" y 1057), and at 1080 high with nothing expanded Settings sits 8 px from the edge. Fix: `end: true` on Settings (and Jobs). **app**; and let the nested group scroll under a pinned footer: **stack** |

| C-1 | yes | rows 50 px (two lines), V9 says first-line box and gap; the list rows are 50, controls 32. Pills not in rows. |
| C-2 | n/a (no def list) | |
| C-3 | yes | name/meta/age: meta baseline shared. |
| C-4 | n/a (no section heading on the list) | |
| C-5 | yes | list and record first rows at y 166 and 70-ish; see A-7a. |
| C-6 | yes | sizes on the list: 13, 12; record: 20, 13, 12. |

| D-1 | no | the bar's filled act is "Edit tags", the ninth of nine acts. The most common bulk act for a DJ is Add to playlist. **app** |
| D-2 | yes | Quarantine `destructive` + `confirm` (library.tsx:~280, sentence names restore and undo); Organise and Apply rules `confirm`; Quarantine red outlined, not primary. |
| D-3 | no | the row's play act has a label `Play <title>` (tooltip/name); the page bar refresh icon is ambiguous (A-6a); nothing marks that rows are draggable (by V19 none is drawn) and the row has no `more` menu with "Add to ..." (V19: "every drag is also in the row's menu"; library.tsx row has `act` only, no `more`). **app** |
| D-4 | no | "3 sec / 1 hr" ages at the end; time "5:00" and BPM "120" in the meta string not right-aligned or tabular; "Time 5:00" labelled in one place and "Energy 1" unlabelled in units (no scale, "Energy 1" to "10"?). Quote: "BPM 120", "Time 5:00". **stack** (list form) |
| D-5 | n/a (no status) | |
| D-6 | no | "Time" for duration (record says "5:03" without label); "Quality"/"Energy"/"LUFS" vs record "Loudness": glossary split (list column "LUFS" hidden, record "Loudness -8.6 LUFS"); "Filters" button vs "Sort" picker; Inbox (Library group) vs Review (Curate group): two similar words for one acquisition chain. **app** |
| D-7 | no | empty: A-4c. Error and not-found one form each yes. |
| D-8 | yes | loaded rows painted, no spinner. Bar problem in A-8a. |
| D-9 | no | too little: 720 px column in 1700 canvas, 17 of 50k rows visible; and too much at the foot: 107 px bar, 9 acts. |
| E-1 | no | from the shot alone: "All tracks" and rows say what it is; the library's state (48,210 tracks, how many have issues, what is new, scan running) is told nowhere on the page except "0 of 48210 tracks chosen" at the foot. Fix: a count in the bar title or toolbar ("48,210 tracks"). **app** |
| E-2 | no | main task: find a track and act on it. Search 1 press, filter: "Filters" opens a panel of seven filters (Genre, Key, BPM, Energy, Played, Tag, Issue; lib/library.tsx:208) so BPM or key = 2-3 presses, and applied filters are not shown as chips in any shot (state not shot). Sort 2 presses and the active sort is not shown. For harmonic mixing, BPM range and Key should stand in the toolbar. **app/stack** |
| E-3 | no | Acts say `done` toasts with `to: "/jobs"`; nothing on the library shows a job running or its failure (the page bar has one icon only). Tag writes after an edit run in the background with no indicator on the library. Fix: a jobs count in the frame (sidebar Jobs row shows no count). **app** (route.tsx has no job count) |
| E-4 | no | Quarantine, Organise, Apply rules confirm sentences say "Undo the batch in History" at the act: yes. Preview before: only Edit tags has a live preview (bulk-edit.tsx, "What changes"); Organise and Apply rules apply to the chosen tracks after a sentence only, no before/after (the Organiser screen has the preview). Quarantine confirm yes. Partial. **app** |
| E-5 | no | Library to Playlists: "Add to playlist" in the bar yes, sidebar drop yes. Library to Issues: filter "Issue" yes. Library to Sets: only on the record ("Add to the set", more menu). Library to Review: toast link only. "Recently added" is a second place that is the same pane with a sort (shots identical): it belongs as a saved view of All tracks, not a sidebar place (E10). |
| E-6 | yes | window read, `total` 48210 shown in the bar, painted rows, search debounced 120 ms (library.tsx:~118), hub-side sort. Not shot: scroll jump. F3 below. |
| E-7 | n/a (no decision here) | |
| E-8 | no | player "Couldn't play this track." is the only error text, with no cause or act (known fixture issue, not judged); "This didn't load." + Retry generic: acceptable. |
| E-9 | no | Space plays (Shell), Shift+Enter plays the row (source comment library.tsx:~157), arrows/range ticks live in the grid; none is hinted on screen, and in list form the grid cursor is not drawn (the keyboard is the grid's). Search focus key not shown. **app** (hint in placeholder) / **stack** |
| E-10 | no | sidebar has 5 groups, 25 places (Library 5, Playlists 1+tree, Curate 6, Tags 3, Discover 3, System 5). Library group mixes the list (All tracks, Recently added) with Inbox, Set builder, Stats; "Set builder" label vs Pane title? (sets route not in this group; sidebar label "Set builder" checked only here). "Recently added" duplicates All tracks (same Pane, same rows in shots). "Inbox" (Library) and "Review" (Curate) and "Downloads" (Discover) are one acquisition chain split across three groups. **app** |

F items (library):
| F-1 | no | playing-1920x1080.png dock: one bar across the foot: title "Midnight Echo (Extended Mix)" (sans 13 at 500, not mono), second line replaced by "Couldn't play this track." (failure, fixture), prev/play/next, time "0:00", a plain slider, "5:00", volume slider with the volume glyph, close. No cover (the row had none), no artist while failing, no played/unplayed waveform: the dock draws a Waveform only when the track has `peaks` (`shell/player.tsx:269`) and the list's play act builds `toTrack(row)` with no peaks (library.tsx:~176, ui/track.ts:toTrack) so it is always a slider from the list; only the record's Play passes peaks. Fix: pass peaks (lazy `fetchPeaks`) from the list act, or have the shell fetch them. **app**. The time labels are at x 592 and 1659; the slider thumb in a 1000 px track: fine. No overlap with content. The dock row has no Current mark linking to the playing row: the row of the playing track (first row y 190) shows the play button in a boxed wash (x 919-951) but no accent bar or "playing" glyph. **stack** (row playing state) |
| F-2 | no | not drawn (list form). Selection bar: docked at the foot at the table's width/start (`BAR_PLACE`), "N of M chosen" + "Select all" yes, deselect folded into "..." (ticked shot x 469, y 1039) while it should be an act: the more menu holds "Select none"; the 3-selected state shows "Select all" in faint meta ink next to a bare dots icon. Range ticks: source yes (Shift+arrow). Active row wash: with record open, row 4 (y 316-365) has a 3 px accent bar + wash, yes. **stack** for the dots. |
| F-3 | yes | total 48210 shown (unformatted, A-2c), painted rows while a window loads (source, `PAINT_ROWS`), no "Show more", windowed. Scrollbar jump not shot. |
| F-4 | no | `drag={{ kind: "track" }}` and sidebar playlists `drop` with label `Add to <name>`: a source-level target. Shot: nothing shows a row can be dragged or that the sidebar takes it, and the library row has no `more` with "Add to ..." (V19). Reorder n/a on the library. **app** |
| F-5 | see Frame | |
| F-6 | n/a (sheet not shot); source: Edit tags `form.onChange` + `after: <EditPreview>` under the fields, "What changes" Section description "`touched` of the first `sampled` tracks change; `total` chosen." so it says how many it reaches but only for a sample, and it reads as a before/after Table (CHANGE_COLUMNS). Edit tags has no BPM or Title field while the record edits both. **app** |

G items (library): G-1 Pane title "All tracks" = sidebar label yes; actions: one icon act (Scan now), the rest none; `noun` not set (not-found says "Couldn't find this."): **app**. G-2 no sections on the list. G-3 rows: leading tick, name, meta, age, act; no chevron: yes. G-4 n/a. G-5 Toolbar bare, search leading, one row, "Filters" a button: yes, filter chips not shown. G-6-9 n/a. G-10 n/a.

Top three:
1. The list is rows, not the table the code declares: no `wide` Pane, so 720 px of 1700 used, no sort header, no BPM/key columns, no columns menu (**app**, and stack's list-beside-record can never be a grid).
2. The selection bar: nine acts wrap to three rows (107 px, 10 percent of the screen) and overlap the "N of M chosen" text with a record open; filled act is "Edit tags" (**app** act count, **stack** reserved count width).
3. No sense of the library's state or of running jobs: no total, no filter chips, no sort indicator, empty state with no act, nothing shows a job running (**app**).

## Recently added (recent)
Shots read: recent/{data,empty}-1920.png, recent/viewport-1920x1080.png
Source read: routes/_app/recent.tsx
Machine findings (from the run log): none
All items as Library, with: the shot is pixel-identical in structure to All tracks (same rows, same order "3 sec, 1 hr, 2 hr...", same bar). Only the title and the current place differ. A-1d/E-10: "Recently added" shows no "added" date or group band ("Today", "This week") although it is the one place where age is the point; the end age is the same unlabelled "3 sec". D-9: 56 percent blank. Empty state "Nothing here yet." with no act (A-4c). The page has no distinct purpose: fold it into All tracks as a sort (**app**).
Top three: (1) it duplicates All tracks (E10); (2) no date bands; (3) same 720 px column and nine-act bar as Library.

## Track record (library/$trackId, recent/$trackId)
Shots read: library/$trackId/{data,empty,loading,error,not-found}-1920.png, viewport-1920x1080.png, ticked-1920x1080.png; recent/$trackId/{data,empty}-1920.png, viewport-1920x1080.png
Source read: lib/track-record.tsx, routes/_app/library.$trackId.tsx, recent.$trackId.tsx, lib/queue.ts
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | record viewport: bar ("All tracks / Lunar Ritual (Extended Mix)"), overline "Elix", name (20), fact pills (MP3 320, 5:03, 123 BPM, 11B, Deep House), then sections. V11 order met; but then WAVEFORM, COVER (a 690 x 400 card at y 296-720), ANALYSIS, ISSUES, TAGS (the 14-row form), CUSTOM TAGS. The editable tags, the DJ's work, begin below y 1070. Fix: cover as a thumbnail beside the head (160 px), Tags before Analysis. **app** |
| A-1b | n/a | |
| A-1c | yes | definition values at the start of the value column (Analysis, x 862). |
| A-1d | no | ANALYSIS has the faint count "4" (data shot y 754), WAVEFORM, COVER, ISSUES, TAGS, CUSTOM TAGS have none; "Issues" shows no count of 0. Mixed. **app** (give none or all) |
| A-2a | no | Tags form: 14 rows labelled "Optional" under each label (data tall shot, e.g. Title, Artist, ..., Comment): all 14 fields mark Optional, so the mark means nothing and doubles the noise; fields Remixer, Album artist, ISRC are empty rows. Fix: `commit: "field"` forms drop the optional mark (**stack**) or set required where the field must be (**app**) |
| A-2b | no | the same fact shown 3x: Key 11B (pill, Tags field, and Analysis "Key 8A" which is a different measured value), BPM (pill 123, Tags 123, Analysis "126 BPM"), Energy (Tags 7, Analysis 7). The record shows two different BPM (123 and 126) and two keys (11B and 8A) with no explanation of which is the truth: the user cannot tell the tag from the measurement (E7). **app** |
| A-2c | yes | Analysis count 4 = 4 rows. |
| A-2d | no | WAVEFORM card holds one sentence "The waveform is drawn after a scan, with ffmpeg on the hub." — a sheet in a Card for a placeholder; jargon "ffmpeg" (D6). In the loaded-shape wait, `Cover` says "No cover is embedded. Fetch art looks one up." while the data shot shows an empty 400 px frame labelled "Cover art" (hasArt true but no image in the fixture: do not judge). **app** |
| A-3 | yes | no truncation. |
| A-4a | n/a (no descriptions) | |
| A-4b | no | "Issues" with "Nothing to fix." fine; "Tags" vs "Custom tags" and the Pane group "Tags" of the sidebar mean different things (the file's tags vs the user's labels): glossary. "Not measured" ok. **app** |
| A-4c | yes | "Nothing to fix.", "Nothing here yet." (Custom tags: one sentence, no act; the picker should stand instead of an empty sentence since you add tags here). **app** |
| A-4d | no | "Fetch art looks one up" names a button as the actor. low. |
| A-5a | yes | no filled act in the record bar (play, more, close). Primary task of a record is edit/play: Play is the first act, icon. OK. |
| A-5b | no | the five fact pills are all the same outlined style (format, length, BPM, key, genre) with no dot: fine per V12 "fact pill outlined"; the key pill and genre pill have no family hue though the tags (genre, key) are a family in the product. |
| A-6a | no | record bar icons: Play, "more" dots, Close x. Play is also the first act: fine. |
| A-6c | no | fact pills look like buttons (bordered boxes 30 px) but do nothing; clicking "Deep House" or "11B" should filter the library. (C6c). **app** |
| A-7a | no | list first row y 166, record overline y 78 and name y 106: two grids; the record pane's head sits 88 px above the list's first row. Acceptable by V11 (head, not a row). |
| A-7b | yes | Analysis labels one column (x 780-862) and the Tags form labels at the same column (x 754-840 in the empty-with-record tall shot): the Analysis value column starts at x 862 and Tags inputs at x 840 (tall record shot): about 22 px off, two grids in one Pane (S1 says one label column). **stack/app** |
| A-8a | no | library/$trackId/loading-1920.png: the skeleton is not the loaded form: Cover says "No cover is embedded. Fetch art looks one up." (a loaded sentence, wrong), Issues has 4 skeleton rows against a loaded 1 row "Nothing to fix.", Analysis 4 rows, Waveform a 26 px strip vs a loaded sentence card; Custom tags a labelled "Tags" skeleton list vs loaded empty sentence. The page is 1935 px in skeleton vs the loaded height; heading positions move (S15). **app** (Cover and Issues are sections with fixed placeholders), partly stack's list skeleton |
| A-8c | no | error shot: pane shows "All tracks" bar with only a close, one sentence "This didn't load." and Retry: yes one form. not-found: "Couldn't find this track." and Back, one form, noun used. Yes. |
| A-8f | yes | |
| A-9a | no | Against Linear's issue record: (1) Linear keeps the description first and the properties in a right-hand rail; here a 400 px cover and a waveform card take the top; (2) no activity/history, no "playlists it is in", no duplicates/versions section (vision.md promises all three), no file facts (path, size, bitrate, date added, plays); (3) the editable form is a 14-row table of inputs where Linear's rows are values that edit in place. **app** |

B-1 no (record 720 + 436 px band right), B-2 no (B-2 above), B-3 n/a, B-4 yes (x 764 all sections), B-5 yes for the record bar (play/more/close one line); the list's bar is the Library's B-5, overlapping, B-7 as Library.
C-1 no: Tags form inputs 32; rows 50; C-2 no (A-7b); C-3 yes; C-4 no (A-1d); C-5 see A-7a; C-6 yes.
D-1 yes (no filled act); D-2 yes: Delete not here; "Find a better version" adds to the wishlist; fine; D-3 no: the record's acts are 6 icon acts but only Play stands, the others in "more" (Add to the set, Auto-tag, Fetch art, Analyse, Find a better version: the DJ's Add to the set is hidden), D-4 no (BPM 123 vs "126 BPM" vs "BPM" field; Loudness "-8.6 LUFS" with unit per cell), D-6 no ("Tempo" in Analysis vs "BPM" everywhere else; "Loudness" vs "LUFS"), D-7 no (Custom tags empty), D-8 no (A-8a), D-9 no (too much, with a 400 px dead card).
E-1 yes (name, artist, format, length). E-2: main task = verify and fix tags, or play. Tags are 1070 px down: 1 scroll. E-3 yes: Tags save as the field is left ("Saved" done toast) but the write to the file runs in a job, no sign on the record. E-4 no: a tag edit goes to the file; undo path in History not told at the field. E-5 no: the record has no link to the playlists it is in or to its duplicates; "Add to the set" in `more`. E-6 yes. E-7 no: Tag 123 BPM / 11B vs analysis 126 BPM / 8A shown with 88%/64% confidence but no act to accept the measured value; this is the decision the screen should support (apply measured tempo to the tag). **app** E-8 n/a. E-9 no: Space plays (Shell), nothing hints. E-10 yes: opens beside its list, close x returns.
F-1 no: Waveform not drawn in any shot (fixtures have no peaks, shows the placeholder sentence): cannot judge played/unplayed contrast or cue marks; source: `Waveform` with `at` playhead only while this track is playing, no cue marks from Rekordbox are passed (`track-record.tsx`: no `cues`), though vision.md puts cues on the record. **app** F-2..F-6 n/a here (list form beside).
G-1: Pane `record` with `within`, `noun="track"`: yes; actions: first stands (Play), rest in more: but `back`/close x as expected. G-2: Section in Section no; `empty` with a sentence and no act (Custom tags). G-10: Card around Cover and Waveform: the cover Image aspect 1 at 690 wide is too large (V: sizes): fix a 160-240 px thumb. **app**

Top three:
1. The record is a vertical tower: placeholder waveform and a 400 px cover push the tags (the work) below y 1070 while 436 px right of it is empty; no side column. (**app**)
2. Two BPMs and two keys on one record (pill/tag 123, 11B; analysis 126, 8A) with no act to resolve them. (**app**)
3. Loading shape is a second layout (Cover sentence, 4 Issue rows vs 1), and the 14 "Optional" marks. (**app**/**stack**)

## Playlists (playlists)
Shots read: playlists/{data,empty}-1920.png
Source read: routes/_app/playlists.tsx, lib/playlists.tsx, route.tsx
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar with `+` and `...`, a single sheet tree. |
| A-1b | no | rows: icon, name, meta "Playlist · 214 tracks", "..." end. Folder row has no meta and a boxed chevron + "..." (data shot x 889-951, y 70-102: the fold chevron draws a filled box, a hover/focus wash that reads as a button state) while its children have "..." only, so end groups differ (V9: count, act, chevron). **stack** (the boxed chevron at rest) |
| A-2b | no | the tree is listed twice on the screen: sidebar "House > Peak time, Deep and late; Fresh 124 to 128" and the main Section have the same three names (data shot). The place's page repeats the nav. Its value is rename/move/delete and counts; make the page a table (name, kind, tracks, updated, length) and `wide`. **app** |
| A-2c | yes | counts 214, 96, 1,320 (formatted here). |
| A-4c | no | empty-1920.png: "No playlists yet. Make one, then drag tracks onto it or use Add to playlist in the library." two sentences, UI mechanics ("drag", "use Add to playlist"), wraps to 2 lines, no act button (V15 wants one sentence over an outlined act). Fix: "No playlists yet." + act "New playlist". **app** |
| A-4d | no | the same sentence. |
| A-5a | no | no filled act; the only creation act is an icon `+` with "New playlist" in the tooltip; the Pane also hides "New folder" and "New smart playlist" in `...`. OK per V10. |
| A-6a | no | the same wand icon `WandSparkles` means both "smart playlist" (rows, sidebar "Fresh 124 to 128") and "Cleanup rules" (sidebar), plus "New smart playlist" act. Two meanings, one glyph. Also "All playlists" uses the same `ListMusic` icon as each manual playlist. **app** |
| B-1 | no | 720 px content, 956 px blank (the screen has 3 rows). |
| D-9 | no | three rows in 1700 x 800 canvas: too little. |
| E-1 | no | "Playlists" tells nothing about library state: no total playlists, tracks, last played; E-2 main task: open a playlist (1 press), create one (1 press `+` then name). E-5: playlist rows open `/playlists/<id>` beside; the sidebar's folder and rows are the quicker path, so this page is rarely needed. E-10: "All playlists" in sidebar is the Pane's title "Playlists" (label mismatch, R: sidebar label = Pane title): **app** |
| F-4 | no | rows have `drag` (playlist) and `drop` (folders accept playlists, manual playlists accept tracks) in source: yes; no visual cue; "Move to the top level" in `more` yes for the order. No reorder of playlists. |
| F-5 | see Frame |

Top three: (1) the page repeats the sidebar tree in a 720 px column; (2) empty state has no act and two instruction sentences; (3) the same wand icon for smart playlists and cleanup rules.

## Playlist (playlists/$playlistId)
Shots read: playlists/$playlistId/{data,empty}-1920.png, viewport-1920x1080.png
Source read: routes/_app/playlists.$playlistId.tsx, lib/playlists.tsx
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | Pane "Peak time" bar: rename pencil, "...", close; then immediately the track sheet with a "Sort" picker; no head with the playlist's facts (214 tracks, length, kind, rule for a smart one). The count 214 appears only in the tree and the foot "0 of 214 tracks chosen". **app** |
| A-3c | no | rows: tick, name, six-part meta, age, "..." menu. |
| A-5a | yes | foot bar: one act "Remove from playlist" (x 1337-1483, y 1042-1073) and "Choose tracks first." — no filled act; it is `destructive` (not filled): ok. The foot bar is 1 line (45 px, y 1035-1080), no wrap, aligned to the table's left x 764: yes. |
| B-1 | no | table 720 px (x 764-1484), 436 px blank right. |
| B-5 | yes | no overlap here: count left, reason + act right. |
| D-2 | yes | `confirm` with sentence "They leave this playlist and stay in the library. Undo the batch in History." |
| D-3 | no | rows have "..." (reorder/drop menu) instead of Play: no `row.act` here (source: `row={{ id, href }}`), so a DJ cannot audition a track from the playlist; clicking opens `/library/<id>` (href), which jumps to the All tracks place and drops the playlist from view, the sidebar then highlights "All tracks". **app** |
| D-4/F-4 | no | an ordered list shows no order: no position numbers, no total length, and the row age "4 sec / 1 hr" (Added) at the end is not the order; the Sort picker on a manual playlist would break the order the user made (`reorder` only when `manual`). Reorder exists by drag and Alt+arrows in source and the "..." menu per row (shot x 1455). A set/crate order is the product of a playlist: show "1, 2, 3" (leading position) and the playlist's duration. **app**/**stack** (the Table needs an `order` column kind) |
| D-9 | no | too little to say it is a playlist: no head, no kicker "House /". |
| E-2 | no | main task: put tracks in the playlist and order them. Adding is only from the library (bar or drag): from this page there is no way to add (no act, no search); smart playlists show an empty bar with zero acts (`select.acts: []`, source) and "0 of N chosen". **app** |
| E-5 | no | see D-3. |
| E-7 | n/a | |
| F-2 | no | foot bar docked at the table's start and width: yes; empty-1920.png: "0 of 0 tracks chosen" with the "Remove from playlist" act stands under an empty list. |
| F-4 | no | see D-4. |
| G-1 | yes | `noun="playlist"`, `back="/playlists"` shows Close x with the tree before it: yes. |

Top three: (1) no order and no play: a playlist you cannot hear or see the order of; (2) opening a row jumps out of the playlist place; (3) wide table not used (720 px, 436 px blank).

## Frame: sidebar, page bar, dock (B7, F1, F5, E10 for the whole app)
Shots read: all of the above, mainly library/viewport, library/playing, playlists/$playlistId/viewport
- B7: sidebar 220 px yes; first row on the bar's line yes (trackvault y 21, title y 21); dock across the foot (x 220-1920, 50 px) without covering rows or the bar, but the footer group is not pinned and Settings/Jobs scroll away when a folder is expanded (see Library B-7). **app** (`end: true`) + **stack**.
- F1: see Library F-1: dock one bar, no waveform from list plays, no cover, no playing mark on the row. **app** (peaks) / **stack** (row's playing mark).
- F5: nested places. Folder row "House" with the fold chevron at the end (right, `>` collapsed in library shots, `v` expanded in the playlist shot, x 186): yes. Children are indented 14 px behind a 1 px rail at x 28 (playlist viewport y 338-400): yes. Current place "Peak time" has the accent 3 px bar + wash (x 6-214, y 338-370): yes. The folder opens itself for a current child (not on other pages: collapsed on library): good. Ancestor "House" shows the same ink as a plain place, not "selected ink" (indistinguishable in the shot). No counts in faint ink beside playlists (the app passes none: `usePlaylistPlaces` gives label, icon, route, drop). The Playlists group has the same "ListMusic" icon on "All playlists" and on playlists; the smart playlist shares `WandSparkles` with Cleanup rules (see Playlists A-6a). Folder rows have no drop highlight source (sidebar folders have no `drop`, only manual playlists: dragging a track on a folder does nothing, source lib/playlists.tsx). **app**
- E10: 25 places in 5 groups, learnable but: Library group holds Inbox and Set builder and Stats; "Curate" holds Review next to Issues; "Discover" holds Search/Wishlist/Downloads; "System" holds History/Backups/Jobs with Settings unpinned; "Recently added" duplicates "All tracks". Labels equal Pane titles on library and recent; "All playlists" vs "Playlists" differ.
- Page bar: library bar holds a lone refresh icon (Scan now) and nothing says what a scan is doing.

## Across the group
- Inconsistencies: (1) "Time"/"Energy"/"BPM" labelled in list meta (library, recent, playlist viewport shots) but the record's pills drop the labels ("5:03", "11B") and Analysis says "Tempo/Loudness"; (2) 720 px column on Library, Recent, Playlists and Playlist, while the record is also 720: every Pane in the group wastes the right 436-956 px; (3) the nine-act bar on Library/Recent vs one act on Playlist (the only bar that reads cleanly); (4) the same count shown as "48210" (bar) and "1,320" (Playlists) and "214" (tree); (5) the wand icon for smart playlist and cleanup rules.
- Stack findings: (1) Table is always list form beside a record and for any Pane without `wide`; the list form shows no header, no sort mark, no columns menu, unlabelled mixed meta (`table/index.tsx`); (2) ActionBar wraps nine acts over its own count (`action-bar/base.tsx`, `ACTS.end`, `ROW.end`) instead of folding into a `more` or reserving the count; (3) the count word does not format numbers (`chosenNounOf`: "48210"); (4) the selection bar paints "0 of 0 chosen" with its acts while the read waits or is empty; (5) the Tags form `commit: "field"` marks every field "Optional"; (6) the Shell sidebar's last group is not pinned unless a place sets `end`, and an expanded folder pushes the footer off screen at 1080; (7) record names, row titles and the dock title render proportional (Plex Sans) in all shots where V7/V9/V11 say mono: either the face is not applied or the voice is not obeyed. (8) the boxed fold chevron on the Playlists folder row at rest; (9) dock draws a slider, never a waveform, unless the app hands peaks.
- UX: the DJ's walk. Land on All tracks (a 720 px column of two-line rows, no total) -> search (works, 1 press) -> filter BPM/key (hidden behind "Filters": 2-3 presses) -> sort (2 presses, no indicator) -> tick three rows -> the bar offers nine acts over three lines, Add to playlist is the first of nine and "Edit tags" is the filled one -> pick a playlist -> open the playlist: no order, no length, no play, and a click leaves the playlist. Opening a record gives a 400 px cover first and the tags 1000 px down; its tempo and key disagree with its tags and cannot be reconciled. Breaks: filter and sort visibility (E2), job feedback (E3), the playlist as an ordered, playable thing (D-4), and the footer pinning of Settings.
