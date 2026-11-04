# TrackVault design critique: second pass

Twenty-five screens, shot at 320 and 1920 dark, data and empty, from the fixtures. Viewport shots, so anything under 800 px at 1920 is out of shot. Critics that did not build the screens read them against `CHECKLIST.md` and the first pass. The first round held eight screens on blocking findings.

## Blocking findings, closed

| Screen | Finding | Fix |
| --- | --- | --- |
| inbox, quarantine, playlist at 320 | a row's title broke mid-word | stack: a touch row's end group stands under its title; walk rule `word-split` |
| stats at 320 | "Playing time" clipped to "4,58" | stack: a Stats figure keeps its width and the unit wraps; walk rule `figure-cut` |
| auto-tag review at 1920 | Change and Source cut | app: the Change column takes the room |
| inbox record at 320 | Compare joined two values with a semicolon | app: rows that name "This file" and "In the library" |
| batch record | Undo offered on a batch that changed nothing | app: no Undo at count 0 |

Three other "blocking" findings were not defects of a real server: `playlists/$playlistId`, `backups` and `history/$batchId` in their `empty` shots show a record's counts beside no rows, because stack's empty fixture rule keeps a record's fields and empties its arrays. The maintainer's list below keeps them as what they are.

All eight screens then read `ship` in a second round of shots.

## Not re-checked

sign-in, index, connect, sets, playlists list, the settings area pages, device record and unmatched, wishlist record, import record, backups settings. Open layers, ticked rows, playing state, loading, error and not found were not shot.

## The maintainer's list: every critic's report

### Library: library, track record, playlist, stats, tags

1. First-critique findings, re-checked

Library (library/data-1920, data-320, empty-*)
- 720 px column with no grid, no sort header, no BPM/Key columns: fixed. data-1920 draws a full-width grid with a columns glyph, and Title, Artist, BPM, Key, Genre, Time, Energy and Added headers.
- BPM and Key not in the toolbar: fixed. Both pickers stand beside Filters.
- Count without separator, or missing: fixed. "48,210" stands over the grid.
- Empty state had no act: fixed (empty-1920 shows "Scan now").
- Nothing showed work waiting: fixed. A banner ("1 job failed. 4 inbox items waiting. 2 conflicts to review." with Open Jobs) and sidebar counts now show it.
- "Recently added" duplicating All tracks: fixed. It is gone from the sidebar.
- Page-bar act is a reload-looking glyph for "Scan now": still there (data-1920, top right).
- Tick boxes faint on the sheet: still there (data-1920).
- Sidebar footer not pinned: still there. "SYSTEM" is cut at the foot of empty-1920. Pinning cannot be judged in a viewport shot.
- Selection bar (nine acts, wrap, filled act "Edit tags"): not visible in these shots.
- Active sort mark, filter chips: not visible.

Library record (library/$trackId)
- 400 px cover and tower pushing Tags down: fixed. The cover is 80 px beside the name, and the tags start at y 290.
- Record on the 1700 px canvas with a 436 px blank band: fixed. The list and record fill the width.
- List beside the record cannot be a grid: fixed. A grid draws at 1130 px.
- Two BPMs and keys, missing playlists, duplicates and history sections: not visible (below the fold).
- Loading shape: not shot.

Playlists (playlists/$playlistId)
- No head and no facts: fixed. "214 tracks" and "19 h 37 min" appear.
- No order shown: fixed. A "#" column stands in the grid.
- No play act on rows: fixed (play and "..." on every row).
- Empty state had two instruction sentences and no act: fixed. The sentence is "This playlist has no track yet." over "Add tracks".
- Playlist list page, smart playlist with zero acts, opening a track leaving the playlist: not visible.

Stats
- Chart fills 492 of 720 px: fixed. The plot spans the whole card in data-1920.
- Units detached from figures: fixed. "hours" and "GB" sit beside the figure.
- Column 720 px with a 956 px blank band: still there (data-1920).
- Four count forms ("44.1K tracks", "42,852", "8,526", "50,000"): still there.
- No section descriptions, and TEMPO has no BPM unit: still there.
- Empty shows full figures over "Nothing here yet." and a Keys chart reading "0 tracks": still there (empty-1920).
- Loading shift, 14-retry error: not shot.

Tags
- 720 px column with a 956 px blank band: fixed. Rows span the width and are one line each.
- Empty state sentence with no act: partly fixed. "New tag" is added, but the sentence is still "No tags yet. Make one, then put it on tracks." (two sentences, an instruction).
- Screen gives no purpose or link to apply tags: still there.
- Delete without undo: not visible.

2. New findings (shot | finding and change | rule | severity)

| shot | finding and change | rule | sev |
| --- | --- | --- | --- |
| stats/data-320, empty-320 | "Playing time" figure clips to "4,58" with the unit pushed out. Let the cell wrap or shrink the figure, and put the unit under or after it. **stack** | verdict: cuts a word; 3b | blocking |
| playlists/$playlistId/data-320 | Title wraps at about 60 px and breaks mid-word ("Midnig / ht Echo / (Exte..."), so no title reads. The row's end group (age, play, more) plus the "#" chip leave the title no width. Move the age into the meta, as library/data-320 does. **app** | verdict: cuts a word; 3b, 3d | blocking |
| playlists/$playlistId/empty-1920, empty-320 | The head says "214 tracks, 19 h 37 min" over "This playlist has no track yet." The sidebar also highlights All playlists. Derive the head from the same read, or fix the fixture. **app** | verdict: a count against its rows; 2c | blocking |
| library/$trackId/data-1920 | Title is truncated ("Midnight Echo (Exte...") on every row while Artist and Genre have spare width. Weight the title column wider, or let it take the free space. **stack** | 3a | minor |
| library/$trackId/data-1920 | The Title input in the Tags form reads "Lunar Ritual (Extend..." at a fixed 156 px beside a 600 px blank label column. A field input should fill the value column. **stack** | 3a, V11 | minor |
| library/data-320, playlists/$playlistId/data-320 | Each row carries 5-6 labelled chips ("Artist: Kalomi", "Key: 8A") over 3-4 lines. Neutral chips look boxed, and the labels repeat what column headers said at 1920. Drop the labels and keep artist, BPM and key on one or two lines. **app** | 3c, 3d, 6c | minor |
| library/empty-1920 | "The library has no track yet." is wrong grammar, and the empty state is two sentences (V15 wants one). Use "No tracks yet. Scan the music folder." **app** | 4c, V15 | minor |
| library/data-1920 | The page-bar act is a reload glyph that means "Scan now". Use a distinct scan glyph. **app** | 6a | minor |
| playlists/$playlistId/data-1920 | "214" is told twice, as a head pill and as the bare count over the grid. The "#" column sits after Title instead of leading. Drop one count and lead with the position. **app** | 2b, 1b | minor |
| playlists/$playlistId/data-320 | The kicker reads "Playlists · Playlist", which repeats the word. **app** | 2b | minor |
| stats/data-1920 | The Pane still stops at 720 px with a 956 px blank band. A page of charts wants the width. **stack** | V17 | minor |
| stats/data-1920, empty-1920 | Chart heads show "44.1K", "42,852", "8,526" with no description. The Keys axis reads 1 to 12 with no A/B letters, and Tempo has no BPM label. Empty draws "Nothing here yet." in two sections and a zero-height chart in Keys. **app** | 1d, 4a, 8b | minor |
| tags/data-1920 | The count "840 tracks" is a hairline-edged box with no dot, so it looks like a control. Its meaning is unclear next to the library glyph, an unnamed arrow-like act that opens the library filtered by the tag. Use a plain grey chip and label the act. **stack** (chip), **app** (glyph) | 5b, 6c | minor |
| tags/empty-1920, empty-320 | The sentence names an instruction ("Make one, then put it on tracks."). Use "No tags yet." over "New tag". **app** | 4c, V15 | minor |
| tags/data-320 | The two end acts float mid-row, away from the edge, while the count chip wraps under the name. **stack** | 7a | minor |

3. Verdicts
- library: ship.
- library/$trackId: ship.
- playlists/$playlistId: not yet. The 320 title is cut mid-word, and the empty head contradicts its rows.
- stats: not yet. The 320 "Playing time" figure clips to "4,58".
- tags: ship.

4. Could not judge from these shots
- Everything below 800 px at 1920 (viewport-sized): the selection bar, dock, record sections past Rating, the rest of Stats, and the rest of the sidebar.
- Sort and filter chips, ticked rows, and playing state.
- Loading, error and not-found states, and the light mode.
- Contrast numbers: only dim meta ink is visible, and I measured nothing.
- Dragging, and the row "more" menus.
- Sidebar pinning.
- Whether the Stats and Tags empty contradictions come from the fixtures or the app.

### Acquisition: soulseek, downloads, inbox, inbox record, wishlist

Everything below is from the shots only, plus the first critique's text. I did not open the source.

**1. First-critique findings re-checked**
- Pane not `wide`, every Table collapsed to row form and a 956 px void (wishlist, inbox, inbox/$itemId): fixed. wishlist/data-1920 and inbox/data-1920 draw real grids at full width, and the compare table spans the canvas.
- "Import a playlist" buried in the more menu (wishlist): fixed. It is an outlined act in the toolbar (wishlist/data-1920).
- A found want's standing act is "search again" (wishlist): fixed. The Found row shows a list icon, Wanted shows a search icon (wishlist/data-1920).
- Imports capped at five (wishlist): not visible. Only one import is shot.
- Soulseek "Type a value" hint: fixed. It is gone in soulseek/data-1920.
- Nav says "Search" while the page says Soulseek: fixed. The sidebar and the bar both read "Soulseek".
- Section description is advice (soulseek): still there. "Artist - Title (Mix) works best; a few words do too." is unchanged in soulseek/data-1920.
- Submit drawn as a grey neutral button (soulseek): still there, in soulseek/data-1920 and data-320.
- Empty shot equals the data shot (soulseek): still there. There is still no results state, and the screen is 80 percent blank.
- Nothing says whether Soulseek is connected (soulseek): still there.
- "Completed, TimedOut" raw state (downloads): fixed. downloads/data-1920 reads "Failed" and "The peer did not answer in time".
- Empty downloads had no act (downloads/empty-1920): fixed. The sentence now sits over a "Search Soulseek" act.
- No link to the want and no counts (downloads): partly fixed. Rows carry "Kalomi: For Kalomi - ... on the wishlist" as plain text, and there is still no summary.
- No progress bar (downloads): still there. It shows "41% of 14.1 MB" text and a spinner.
- Constant Download glyph as the leading mark (downloads): still there.
- Unlabelled icon acts (downloads, inbox): still there. The broom is gone from the bar, but the inbox approve-all double check at the bar's end is unlabelled.
- Inbox state and verdict double-drawn (inbox/data-1920): fixed. State is now one pill, "Why" a separate column, and the bands READY / NEEDS A LOOK / PROCESSING carry counts.
- No inbox summary or bands (inbox/data-1920): fixed.
- Selection bar shows four disabled acts (inbox): not visible. No selection is shot.
- Inbox duplicate decision has no side-by-side (inbox/$itemId/data-1920): fixed. COMPARE draws "This file | In the library" for ten facts, and the record is now first.
- Facts repeated on inbox rows (inbox/data-320): partly fixed. Chips such as "Artist: Kalomi" still sit under the name, and the path is repeated in "Goes to".
- Acts (Replace, Keep, Reject) hidden in menus (inbox/$itemId): not visible. The bar shows only play and more.
- Sidebar split across DISCOVER and LIBRARY (all five screens): partly fixed. There is a GET MUSIC group, but Inbox still stands under LIBRARY.
- Sidebar counts (all five screens): fixed. Inbox 4, Duplicates 12 and Auto-tag review 37 now show.
- Duplicated "Import a playlist" and unlabelled marks (wishlist/empty-1920): this is new, see below.

**2. New findings**

| shot | finding and change | rule | severity |
|---|---|---|---|
| inbox/data-320 | The Ready row title breaks mid-word ("Midni / ght / Ech…"). The checkbox, age, check and more squeeze the title. Put the title on its own line and the acts under it, as V14 asks. | 3b, 3d, V14 | blocking, stack (row form) |
| inbox/$itemId/data-320 | COMPARE joins two values with a semicolon and no source ("Midnight Echo (Extended Mix); Midnight Echo (Original Mix)"). Which value is the file and which is the library is unreadable. Label each value "This file" and "In the library" in the list form. | 2, 1b | blocking, stack |
| downloads/data-320 | The first row title truncates to "Midnight Echo (Extende…" over three lines. Its age, cancel and more squeeze it. Fold the acts or move the age into the meta line. | 3d, V14 | minor, stack |
| inbox/data-1920 | The "Goes to" path truncates ("Mid…") on the one row that has it, and the other bands draw it empty. Widen the column or leave it out of the list. | 3a | minor, app |
| inbox/data-1920 | The Processing table starts its columns about 28 px left of the other two (Title at x=258 vs 286), because its rows have no checkbox. Three tables carry three header rows and three column-menu icons. Reserve the checkbox slot, or draw one table with bands. | 7a, 7b, 2d | minor, app |
| inbox/$itemId/data-1920 | VERDICT says "Decision: possible duplicate, not certain" and repeats the head's "Needs a look" pill. PIPELINE "5" counts steps. | 2b, 2c | minor, app |
| inbox/$itemId/data-1920 | COMPARE does not mark the rows that differ (Title, Quality, Length, Size, Genre). Those differences are what the decision turns on. | 9a | minor, app |
| inbox/$itemId/empty-1920 | The empty record keeps "This file beside the library copy it matched" and a blank "In the library" column. The verdict still says "possible duplicate". Leave the section out when nothing matched. | 8b, 2a | minor, app |
| inbox/data-1920 vs inbox/$itemId/data-1920 | The row reads "Ready" and the record reads "Needs a look" for the same file. This looks like a fixture mismatch, as in the first critique. | 2 | minor, fixture |
| soulseek/data-1920 | The one task, "Search Soulseek", is a grey button, not the filled primary. The form is 1650 px wide for a one-line query, and the page is 75 percent void. | 5a, V5 | minor, stack (blocked submit) and app |
| wishlist/empty-1920 | "Import a playlist" appears twice, in the Imports sheet and in the toolbar. The pill says "Import" once for imports and once for a playlist. | 2b | minor, app |
| wishlist/data-1920 | Ages read "30 min" and "in 30 min" on one page. "Found" is a blue state pill and "Wanted" a grey one, so the hue carries the state. | 5b, A3 | minor, app |
| downloads/data-1920 | The meta line carries a state pill, peer, progress, speed and the want text on a second line. Failed rows offer only the same retry (E-8). The Failed row's "Lio:" prefix shows the artist, while the want line on the first row shows "Kalomi: For Kalomi...". | 3c | minor, app |

**3. Verdict per screen**
- Soulseek: ship. Improvements only (the advice description and the grey submit).
- Downloads: ship.
- Inbox: not yet. At 320 the title breaks mid-word on the Ready row ("Midni / ght").
- Inbox record: not yet. At 320 COMPARE joins the two copies' values with a semicolon and no label.
- Wishlist: ship.

**4. What I could not judge**
- Everything below 800 px at 1920 and below the fold at 320. That includes the inbox record's PIPELINE and the Done band.
- The inbox record's bar acts (approve, replace, keep, reject) and their menu. Only play and more are drawn.
- The Soulseek candidate table, the running and failed search states, and the connected or unset-up banner.
- The wishlist Imports cap, and the Imports section with more than one import.
- Any selection bar, any loading, error or not-found state, and light mode.
- The contrast of the 12 px faint meta ink, which only reads as passable by eye.
- The fixture row mismatch in the inbox: whether it is data or a bug.

### Cleanup: duplicates, organiser, rules, issues, auto-tag review, quarantine, genres, aliases

**1. First-critique findings (shot names are under `shots/phase3/<screen>/`)**
- Width (all 8 screens): fixed. Every sheet now runs to x=1895 in `data-1920`.
- Table grid in Review and Quarantine: fixed. `auto-tag-review/data-1920` and `quarantine/data-1920` draw headers, sort and the columns menu.
- Quarantine "1 day" against "Days left 29", no header: fixed. Both columns are named in `data-1920`, and `data-320` labels it "Days left 29".
- Table bar over an empty table: fixed. `auto-tag-review/empty-1920` and `quarantine/empty-1920` draw no selection bar.
- Banner act drawn as tinted text, and the filled act on the wrong control (organiser, rules, genres, aliases): fixed. A filled foot act now reads "Move the files", "Apply to the library", "Tidy the genres" or "Tidy the spellings".
- Unapplied plan drawn as a green "done" strip: fixed. The banner is amber and says "Planned Wed, Nov 4, 01:12, not applied yet" (`organiser/data-1920`).
- Duplicates choice facts (format, bitrate, length only): fixed. Rows now carry size, tags, cues, playlists and path (`duplicates/data-1920`).
- Duplicates empty names its act but draws none: fixed. `duplicates/empty-1920` draws "Find duplicates".
- Aliases and genres show no per-spelling track count: fixed. "Alias, 240 tracks" and "7 tracks" appear in `genres/data-1920` and `aliases/data-1920`.
- Issues "Corrupt audio 0" with a green dot: fixed. It is now a hollow dot and "Checked 30,000 of 48,210" (`issues/data-1920`).
- Issues "6200" and "1900" without a separator: still there (`issues/data-1920`, `data-320`).
- Dot with no word on issues rows: still there (`issues/data-1920`).
- Issues empty "Nothing to fix." with no act: still there, but the unchecked chips stay on screen below it (`issues/empty-1920`).
- "fpcalc" and "PATH" jargon: still there in the duplicates banner (`duplicates/data-1920`). The issues ffmpeg banner is not in the shot.
- Section descriptions inconsistent: still there. Organiser TEMPLATE has one, PRESETS and PREVIEW have none. Aliases has none on any of its five sections.
- Rules heading description wraps at x=653 on a 1650 px sheet: still there (`rules/data-1920`).
- Check glyph with several meanings: still there. The presets draw five check marks that read as "applied" (`organiser/data-1920`), and the merge act is a bare check (`aliases/data-1920`).
- Aliases: five sibling sections, Artist and Label duplicated, canonical name not choosable: still there (`aliases/data-1920`).
- Genres preview shows an Artist change under "Genre preview": still there (`genres/data-1920`). Whether the write matches the count is not visible.
- Preview stale after a change, and a confirm for Reject or Accept: not visible in these shots.

**2. New findings: shot | finding and what to change | rule | severity**
| shot | finding and fix | rule | severity |
|---|---|---|---|
| auto-tag-review/data-1920 | The Change cell is cut on both rows ("Label: Cip...", "Cipher Rec...") and Source reads "Beatport, Music...", though Title and Artist hold 1100 px. The proposal being accepted cannot be read. Set widths, give Change the spare room (app). | C3a, 3b, V9; E7 | blocking, app |
| quarantine/data-320 | Titles break mid-word ("Midnig/ht/Echo...", "Untitl/ed") because age and acts take the row. The title needs a full first line, with the age moving under it (stack). | C3b, 3d, V14; verdict | blocking, stack |
| organiser/data-1920, data-320 | The template, the screen's one input, is cut: "{genre|Unknown}/{a..." in a box about 150 px wide. Let the control hold the full string (app). | C3a | minor, app |
| organiser, rules, genres, aliases empty-1920 | The banner says "3 files would move" or "3 tracks would change" over "The plan holds no change". The shared fixture is the likely cause, so split previews by kind (app). | C2b, 2c | minor, app (fixture) |
| organiser/data-1920 | "3 files would move" sits over tag-change rows (Field Genre, Tech-House to Tech House). A file move should show a path before and after (app, fixture). | C2c | minor, app |
| organiser, rules, genres, aliases empty-1920 | The filled foot act ("Tidy the genres" and the rest) stands over an empty plan. Drop it, or draw it disabled (app). | C8b, V5 | minor, app |
| aliases/empty-1920 | "Add a artist alias" has a grammar slip. Use "Add an artist alias" (app). | C4b | minor, app |
| issues/data-1920 | The same "Checked N of 48,210" fact shows twice, once on the issue rows and once under Health checks (app). | C2b | minor, app |
| duplicates/data-1920 | The heading "Same audio - 2 tracks 2" repeats its count. Rows carry seven chips, with the path as a chip. The two groups hold the same pair. Keeper meta reads "Kalomi: Keeper: kept higher bitrate". Drop the count from the label and move the path to meta (app). | C2b, 3c, 4b | minor, app |
| auto-tag-review/data-1920 | The sidebar says 37 and the list says 2. "Filters 1" repeats the "Show: Waiting" chip (app, fixture). | C2c, 2b | minor, app |
| organiser, rules, genres, aliases data-1920 | A bare count ("3") stands above the preview table with no noun. Name it, for example "3 changes" (stack). | C1d | minor, stack |
| issues/data-1920 | The wrench act beside the count has no visible name. A tooltip may exist but is not shown (app). | C6a | minor, app |

**3. Verdicts**
- Issues: ship.
- Duplicates: ship.
- Organiser: ship.
- Rules: ship.
- Genres: ship.
- Aliases: ship.
- Auto-tag review: not yet. The Change and Source cells are clipped on every row.
- Quarantine: not yet. Titles are cut mid-word at 320.

**4. Could not judge from these shots**
- Loading, error and not-found states, and light mode: none were shot.
- 1920 shots are 800 px tall. Below the fold I could not see the sidebar's System group, the end of the genres preview table, or whether the foot bar hides the last rows.
- Confirms, tooltips and toasts, which need source or interaction.
- Whether the genres apply writes only genres (the first critique's top finding there).
- Whether a preview refreshes after a template, rule or alias change.
- Whether the empty-shot contradictions are fixture-only.
- Contrast numbers: judged by eye only.
- The wide Pane beside an open record: no record shot exists for these screens.

### System: history, batch, jobs, settings, backups, devices, conflicts

**1. First-critique findings re-checked**
- History A-4c, empty sentence only: fixed. history/empty-1920 now has an act, "Open the library".
- History B-1, Table capped at 720 px: fixed. history/data-1920 draws a real grid at full width with columns and a search/filter toolbar.
- History A-2c/E-1, no count, facts and filter: partly fixed. history/data-1920 has search plus "Anyone" and "Any state" picks, and the "Undone" state shows. The count is a bare "3" over the table.
- History D-4, "Changes 1880" with no separator: still there in history/data-1920 and history/data-320.
- History A-4b, labels are job names: still there ("Edit tags", "Rules"). The "By" chips are now flat grey with no dot, so the old A-5b/A-6c finding is fixed.
- History E-4, Undo offered on scan and undone batches: not visible. The Undo glyph in history/$batchId/data-1920 is present on an "Applied" batch, and no scan or undone batch is shot.
- Batch A-1a/D-9, no facts: fixed. history/$batchId/data-1920 has a head with "You", "3 changes", "Applied" and a date.
- Batch B-2/F-2, record table capped at 720 px: fixed. It draws a four-column grid at full width.
- Batch D-1, Undo next to Close: fixed. The bar has a back arrow on the left and a lone Undo on the right. It is still an unlabelled glyph.
- Batch E-5, rows do not link to the track: not visible. The track names are bold text with no mark.
- Batch E-3, Undo leaves for /jobs: not visible.
- Jobs A-4c, empty copy and act: partly fixed. jobs/empty-1920 has "Scan now", but the sentence is still two sentences.
- Jobs B-1, narrow sheet: fixed.
- Jobs E-5/E-8, failed row has no retry: fixed. The failed row in jobs/data-1920 has a retry glyph and a more menu. The links to the fix and to a result are not visible.
- Jobs, progress as text only: fixed, bars are drawn. Progress is still shown three ways in jobs/data-1920 ("37%" chip, count chip, bar).
- Jobs A-2b, "412 of 3100" next to "412 of 3,100": still there on the Offsite row, in both Jobs and Backups.
- Jobs, running first: fixed, both running rows sit at the top of jobs/data-1920. Whether this is a sort or just the fixture order is not visible.
- Jobs D-2/E-3, cancel confirm and sidebar count: not visible. The Jobs place is below the fold.
- Jobs A-9a, flat list with no bands: still there.
- Devices E8, offline has no sentence or tone: fixed. devices/data-1920 shows an amber "Offline" and "Not seen for 3 days. Open the agent on this machine and it syncs when it connects."
- Devices A-4b, "darwin" and "win32" shown raw: fixed ("macOS", "Windows"). "Replica" became "local copy".
- Devices, one DJ Mac meta line of seven parts: fixed. Facts are now chips plus one sentence.
- Devices A-4c, empty has no act: fixed ("Pair a device").
- Devices E2, Sync now hidden in the menu: fixed. A sync glyph is on the DJ Mac row.
- Devices A-6a, lone merge glyph: fixed. A "3 conflicts to review" chip carries a warning glyph.
- Devices, "41 not matched" links nowhere: not visible. The line is gone from the fixture.
- Devices B1: fixed, full width.
- Devices D6, "machine" and "device": still there in devices/empty-1920 ("Pair a machine").
- Conflicts A-2b, "214 → 214": fixed. conflicts/data-1920 reads "213 tracks → 3 moved, 2 added, 1 removed".
- Conflicts A-1a and E7, header lost and direction unlabelled: fixed at 1920. The header reads "TrackVault to Rekordbox". There is still no base side.
- Conflicts A-4c, generic empty: fixed ("No conflicts. Rekordbox and TrackVault agree…" with "Open Devices").
- Conflicts D2/E4, confirm and undo stated: not visible. No selection state is shot.
- Backups E1, no last-good line: fixed. "Last good backup Tue, Nov 3, 23:17 / Checked" is in backups/data-1920.
- Backups A-4c, empty drew no sections: fixed in layout. backups/empty-1920 keeps all sections, each with an act, plus a "Restore" section.
- Backups, unreachable bucket shown as failure: not visible.
- Backups A-4b/A-2b, jargon ("zstd", "bucket"), "Now" holding finished rows, repeated "Offsite" word: still there in backups/data-1920. The "Offsite" description is one sentence now, but "On this hub" is still two.
- Settings, 5400 px page of 53 fields: fixed. settings/data-1920 is an index of 8 areas with one sentence each.
- Settings, "Optional" on every field, secrets as a red trash, jargon in labels: not visible. The area pages are not shot. The index itself still uses "slskd" and "offsite bucket".
- Settings error state, seven "This didn't load.": not visible.

**2. New findings** (shot | finding and what to change | rule | severity)
- backups/empty-1920 and empty-320 | "Last good backup Tue, Nov 3, 23:17 / Checked" and "Offsite storage is on, 20.3 GB sent" sit beside "No backups yet" and "Nothing is in the bucket yet". Drop the status rows from the fixture, or make the screen read them from one source. | verdict, a fact contradicted | blocking, app (fixtures first)
- history/$batchId/empty-1920 and empty-320 | The head says "3 changes" over "This batch changed no field." Undo is also still offered. Use an empty-batch fixture with a head count of 0, and hide Undo on an empty batch. | verdict, a fact contradicted | blocking, app (fixture)
- backups/empty-1920 | "Open backup settings" and "the hour set in the backup settings" point to settings, but the settings index row says the settings are "on the Backups page". Make the two agree and give the act a real target. | glossary, V15 | minor, app
- history/data-1920 and conflicts/data-1920 | A bare "3" stands over the Table at x247 with no noun. Draw "3 batches" or "3 conflicts", or drop it. | V10, C 2c | minor, stack
- history/data-1920, jobs/data-1920 | A state is a green soft-filled pill in History, a grey chip with a dot in Jobs, Backups and the batch head. Pick one state-pill form. | V12 5b, 1b | minor, stack
- history/data-320, devices/empty-1920, conflicts/empty-1920 | At 320 the filter glyph stands on a row under the search instead of in one toolbar row. At 1920 the sidebar foot shows a blue bar at y790. | V14 8d | minor, stack
- jobs/data-1920 | The "412 of 3,100" chip and the "412 of 3100 files" line show the same fact twice, unformatted in the line. Remove the count from the server message or format it. | 2b, D4 | minor, app
- backups/data-1920 | The "Schedule 3" count counts fixed rows and its "Last good backup" is history. A finished "Database backup" sits under "Now". "Tue, Nov 3, 23:17" is shown next to the "2 hr" age. Rename the sections and drop one of the two time forms. | V10, 2b | minor, app
- devices/data-1920 | "Offline", "Not seen for 3 days" and the "3 days" age say the same thing three times. "Pair a machine" stays against "Pair a device", and the ages read "3 mths" against "3 days". | 2b, D6 | minor, app (ages stack)
- history/data-1920, history/$batchId/data-1920 | The label "Rules" for a batch is not a name ("Edit tags" is the job name too). The list says "1 hour ago" and the batch says "Wed, Nov 4, 00:15". Name what happened. | glossary, D4 | minor, app
- conflicts/data-320 | The "Kept" chip leads unlabelled ("TrackVault") while the others read "Artist:" and "Field:". Label it "Kept: TrackVault". | V9 | minor, app
- settings/data-1920 | Each row is 1650 px wide with a 1400 px blank to its right, and no mark says the row opens. | V9, V17 | minor, stack
- jobs/data-1920 | The failed row's link to the fix is not visible, so the fix may live only in the menu. | E8 | minor, app

**3. Verdicts**
- history: ship.
- history/$batchId: not yet. The empty shot contradicts "3 changes" and still offers Undo.
- jobs: ship.
- settings: ship (index only; area pages unseen).
- backups: not yet. The empty shot shows a last good backup and 20.3 GB offsite beside "No backups yet".
- devices: ship.
- devices/conflicts: ship.

**4. Could not judge**
- The 800 px shots cut off every sidebar below Tags. That hides the System group, the Jobs, Devices and Conflicts badges, and which places the groups hold.
- backups/data-1920 is cut after the "Offsite" section's second row, so Restore and the bottom of the page are out of shot.
- Not shot: selection state and bar in Conflicts, confirms, the row menus, tooltips and accessible names.
- Not shot: loading, error and not-found states, light mode, and the settings area pages (Optional marks, secrets).
- Contrast of the faintest meta text could only be judged by eye. It reads dim but acceptable.
- Whether the rows in the batch table link to their tracks, and whether the sort puts running jobs first, cannot be seen. A shot cannot show real behaviour or a bad-bucket or offline-device state.

