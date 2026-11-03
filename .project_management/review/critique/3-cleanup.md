# Cleanup (issues, duplicates, organiser, rules, review, quarantine)

Scope notes. Only 1920 dark was shot: items about 320, touch and light are `n/a (not shot)` (C3d, C8d, the light half of C8e/C8f, C8f read for dark only). Loading, error and not-found were not shot for these screens: C8a, C8c, D8, F9, F10 are `n/a (state not shot)` unless a source fact is cited. Fixture data is synthetic; where a shot is a fixture artefact it is said. Tags: **app** = TrackVault composition, **stack** = a roster component.

Two facts shape every screen of this group, so they are stated once and referenced as [W] and [P]:

- [W] No route here sets `wide` on its Pane (`grep wide src/app/routes/_app/*.tsx` finds nothing). Every Pane stays inside `*:max-w-reading` (stack `pane/index.tsx:80,271`), so in all twelve shots the sheet's right edge is x=964 on a canvas that runs x=220 to x=1920: a blank band 956 px wide, 56 percent of the canvas, on every screen. V17: "a list page is `wide`". The cap is also why every Section row is two lines (container 720 < 765, V14) and why Review and Quarantine draw as a list, not a table (see their sections). **app** (add `wide` to the Pane).
- [P] Preview model (`src/app/lib/preview.tsx`, used by Organiser and Rules). `previews.latest` (`src/worker/routes/previews.ts:13-32`) returns the newest job of that kind whose mode is preview, with no timestamp and no link to the template or rule set it was computed from. It is never invalidated by a template change, a preset press, a rule switch or a rule edit, and it stays "done" after the apply job ran. So after "Move the files" the page still says "3 files would move" and still offers "Move the files". **app**.

---

## Issues (/_app/issues)
Shots read: shots/issues/data-1920.png, shots/issues/empty-1920.png
Source read: src/app/routes/_app/issues.tsx, src/app/lib/api.ts (used), src/shared/library.ts (ISSUE_LABELS, by reference), src/app/fixtures.ts (health)
Machine findings (from the run log): none (all 35 files, 70 shots passed)

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | data: Section "By issue", Section "Health checks", list on a sheet, no toolbar needed |
| A-1b | no | Row slots are the same as Duplicates/Quarantine (title, meta, end), but the leading mark is a status dot here and an icon elsewhere; count "6200" is a bare number on the end while "30,000 of 48,210" in the same screen uses separators. See D4 |
| A-1c | n/a (no definition list) | |
| A-1d | no | data: "BY ISSUE 4" and "HEALTH CHECKS 2" carry a count but no description; Organiser's TEMPLATE and Rules' RULES carry one. Counts here count section kinds, not tracks: "4" = 4 issue types, which is read as a number of problems |
| A-2a | yes | no empty labelled fact |
| A-2b | no | data: "Corrupt audio" row is `dim` with count 0 and a green dot: the dot and the "0" say the same thing twice, and both are wrong (see E1) |
| A-2c | no | data: band "BY ISSUE 4" counts four rows, correct; "HEALTH CHECKS 2" correct; but "Corrupt audio 0" is shown from a check that covered 30,000 of 48,210 files, so the count is not a count of what the library holds |
| A-2d | yes | rows with no act reserve no end room; "By issue" rows have a count only |
| A-3a | no | nothing truncates at 1920 |
| A-3b | no | no short word truncates |
| A-3c | yes | row = dot, name, one meta, count |
| A-3d | n/a (not shot) | |
| A-4a | n/a | By issue has no description; Health checks has none |
| A-4b | yes | nouns; "Fake bitrate", "Low bitrate", "No key" |
| A-4c | no | empty.png: "Nothing to fix." is one sentence in the meta ink, centred, on its own sheet: form is right. But it offers no act and, with 30,000 of 48,210 files decoded, it claims an all-clear that was not earned (see E1, D7) |
| A-4d | no | meta "ffmpeg could not decode the file to its end" (issues.tsx:WHY.corrupt) and banner "The corrupt and fake bitrate checks need ffmpeg on the hub's PATH." name tools, not the thing; "Measure the spectrum" is jargon for "check for fake bitrates" |
| A-5a | yes | no filled act on the screen; status hue only on dots |
| A-5b | n/a (no pills) | |
| A-5c | no | the yellow vs green dot is a tone, not hierarchy |
| A-6a | no | data: yellow dot = attention, green dot = done, but neither dot has its word (V9 asks "a state's dot and word"); the legend is only an accessible name. The green dot on "Corrupt audio 0" claims "done" |
| A-6b | yes | no chevron on rows that open (rows have `href`, issues.tsx:toRow) |
| A-6c | no | the three rows with a count open the library filtered, but nothing says so: no hover affordance is visible in the shot and the count looks like a static figure. Pressable-looking and non-pressable rows are the same form (a dim "Corrupt audio 0" row is not pressable) |
| A-7a | n/a (single pane) | |
| A-7b | n/a (no definition list) | |
| A-7c | n/a | |
| A-7d | yes | data: BY ISSUE sheet ends y=294, HEALTH CHECKS heading y=328; same 34 px gap as the other screens |
| A-8a | n/a (state not shot) | source: `summary.at(...)` paints Sections while waiting |
| A-8b | yes | empty.png keeps both headings; "By issue" shows its sentence |
| A-8c | n/a (state not shot) | |
| A-8d | n/a (not shot) | |
| A-8e | yes | dark shot: slate sidebar, sheet lighter than the table, no pure black or white |
| A-8f | yes | rows' faint meta ("Under the bitrate threshold in Settings") reads at roughly 4.5:1 by eye |
| A-9a | no | beside the Linear grouped-list screen: (1) Linear's rows carry assignee, labels and a status word; these carry a dot with no word (app) (2) Linear's list uses the whole canvas, this stops at x=964 [W] (app) (3) Linear counts in band headings equal the rows below; here the band counts kinds (app) |
| B-1 | no | content stops at x=964; blank band 956 px [W] (app) |
| B-2 | n/a (no record) | |
| B-3 | n/a (no wide table) | |
| B-4 | yes | both sheets start at x=244 |
| B-5 | n/a (no bar content) | the bar holds only the title: nothing to wrap |
| B-6 | n/a (no chart) | |
| B-7 | yes | sidebar 220 px, first row on the bar's line (y=21 both) |
| C-1 | yes | rows are 50 px because they take two lines, which is the V14 rule for a container under 765 px, itself caused by [W]. Pills: none |
| C-2 | n/a | |
| C-3 | yes | name and count on one baseline per row |
| C-4 | no | headings are uppercase 12 with faint count, but only 2 of the group's screens carry a description under the heading (see A-1d) |
| C-5 | n/a (single pane) | |
| C-6 | yes | three sizes visible |
| D-1 | n/a | no primary act on the screen. The common task, "run the checks", is two play icons in the sheet rows, which is a correct quiet choice |
| D-2 | n/a (no destructive act) | the two Play icons run read-only checks |
| D-3 | no | the two Play icons carry labels "Check integrity" and "Check bitrates" (source: act label), so tooltip yes; but the row title "Decode every file" does not look pressable and its pressable part is only the glyph at x=935, 700 px from the text |
| D-4 | no | issues.tsx:toRow `trailing: { count: issue.count }` draws "6200" and "1900" with no thousands separator (data-1920 x=922-951) while the Health checks meta formats `count.format()` "30,000 of 48,210". One format expected. Fix: stack's row count should format with Intl (**stack**), otherwise the app pre-formats |
| D-5 | no | dot without a word on all four rows; colour alone separates "attention" from "done" (**stack** row `status` form draws a dot only; app can use `meta` to say it) |
| D-6 | no | "ffmpeg", "PATH", "Measure the spectrum", "Fake bitrate" (a DJ says "fake 320" or "upscaled"); "Corrupt audio" vs the vision's "Health" naming; sidebar "Issues" vs vision "Health". Quote: "The corrupt and fake bitrate checks need ffmpeg on the hub's PATH." |
| D-7 | no | empty.png "Nothing to fix." has no act and does not say that checks are only 62 percent done |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little: one 4-row sheet and one 2-row sheet in 1700 px of canvas |
| E-1 | no | A DJ can tell the page lists problems and counts. What is missing is how fresh and how complete the figures are: "Corrupt audio 0" next to "Decode every file 30,000 of 48,210 checked" means 18,210 files are unchecked, yet the row is a green "done" dot. The state of the library is misreported. **app** (issues.tsx:toRow sets `done` from count 0 regardless of `checked`; fix: show "0 of 30,000 checked" or an attention dot while checks are incomplete) |
| E-2 | no | Main task: find what is wrong and fix it. Presses: open a row (1) lands in the library filtered; no fix act is offered here or there on the row: the screen never offers Rules, Duplicates or Organiser as the cure. The next step is not visible. **app** |
| E-3 | no | pressing a Play icon toasts "Checking files" with a link to /jobs; the page itself shows no running state: the meta "30,000 of 48,210 checked" is static text and the Play icon does not become a progress or a stop. Failure is only seen on /jobs. **app** (source: no job read in issues.tsx) |
| E-4 | n/a (the page acts on nothing; both Play acts are read-only) | |
| E-5 | no | no row links forward to Duplicates, Rules or Organiser; "Low bitrate" could link to Soulseek search, "No key" to the analysis job, "Fake bitrate" to Quarantine. Chain breaks at step one. **app** |
| E-6 | no | rows open `/library?issue=...`, which is the right scale answer (the library windows); but counts are read as one query and not tied to the library's own filter facets in the shot. Holds at 50k |
| E-7 | n/a (no choice on this screen) | |
| E-8 | no | the ffmpeg banner says what is wrong but not what to do (install where? on the hub box) and its tone is attention with no act. **app** |
| E-9 | n/a (nothing to type or navigate by keyboard beyond rows) | |
| E-10 | yes | sidebar "Issues" in group Curate = Pane title "Issues". Curate order Issues, Duplicates, Organiser, Review, Cleanup rules, Quarantine does not follow the chain (Rules before Organiser; History sits in System, not in Curate) |
| F-8 | no | Banner in source (issues.tsx) uses `summary.at(...)` returning `undefined` when no sentence, so it moves the page once on arrival: correct. Not visible in shots (ffmpeg true in the fixture) |
| G-1 | yes | `back={false}`, one title, no actions |
| G-2 | no | "By issue" has no description sentence; `empty` has a sentence and no act |
| G-3 | no | leading is a status dot (no word); end is a bare count and no chevron (correct) |
| G-7 | no | tone "attention" has no `act`; no `until` needed |

Top three:
1. "Corrupt audio 0" shows a green done dot while only 30,000 of 48,210 files have been decoded (and 12,000 measured): the page reports a clean library it has not checked (app, issues.tsx:toRow).
2. The screen is a dead end: no row offers the fix (Duplicates, Rules, Organiser, Review), so the cleanup chain starts with a screen that does not lead anywhere (app).
3. Content stops at x=964 and rows are forced to two lines, so a 6-row page uses a third of the canvas (app, [W]); counts read "6200" next to "30,000" (stack row count, app fallback).

---

## Duplicates (/_app/duplicates)
Shots read: shots/duplicates/data-1920.png, shots/duplicates/empty-1920.png
Source read: src/app/routes/_app/duplicates.tsx, src/worker/routes/dupes.ts, src/app/ui/track.ts, fixtures (dupes)
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | banner, then bands over rows on one sheet |
| A-1b | no | members are "Artist - Title" in the sans, not the mono the V9 name takes (data: "Kalomi - Midnight Echo" is the same sans as meta's neighbour); meta carries format-bitrate, length and "Keeper: ..." in one line |
| A-1c | n/a | |
| A-1d | no | the one Section has no title at all, so no heading, count or description; the page has bands instead (see D-9) |
| A-2a | yes | |
| A-2b | no | band "Same audio - 2 tracks" with a faint "2" beside it: the count is stated twice (A-2b). The leading Check on the keeper and "Keeper:" in its meta state the same thing twice |
| A-2c | yes | band count 2 = 2 rows each |
| A-2d | no | the duplicate row ("Copy" icon, "Duplicate" word) draws a glyph and a word for what the leading Check/absence already says; "Duplicate" is a word on every non-keeper row |
| A-3a | no | nothing truncates (rows are short); but the keeper meta "Keeper: kept more complete tags (9 vs 6 fields)" needs 400 px and would truncate beside a longer name |
| A-3b | no | |
| A-3c | no | rows carry: mark, name, quality, length, role (+reason), more menu: three meta parts. Within the V9 limit but the facts a choice needs (size, path, tags, cues) are absent |
| A-3d | n/a (not shot) | |
| A-4a | n/a | no description |
| A-4b | no | band label "Same audio - 2 tracks" uses a hyphen as separator and "tracks" as a unit; the banner "Without fpcalc on the hub's PATH the search compares audio hashes and names only." is a UI-mechanic sentence with a binary name. Source REASONS: "Sounds the same" and "Same artist and title" (reasons are sentences, headings should be nouns) |
| A-4c | yes | empty.png: one sentence over no act. But it says "Find duplicates to search the library." and offers no act: the act is in the bar as a lone magnifier. V15 and D7: the sentence names the act and the act should be on the sheet. **app** (duplicates.tsx `empty={{ sentence }}` has no `act`) |
| A-4d | yes | "Find duplicates" in sentence names an act, not a UI mechanic |
| A-5a | yes | no filled act; the amber banner is a state |
| A-5b | n/a (no pills) | |
| A-5c | no | |
| A-6a | no | data: check = keeper, two-squares glyph = duplicate. The "Copy" glyph is the generic copy-to-clipboard icon; it reads as "copy" not "duplicate of the keeper". Merge glyph on the band reads as git-merge, correct |
| A-6b | yes | no chevrons |
| A-6c | no | the band's end icon (merge, x=935,y=148) is an act with no word and the only way to resolve the group: the common act is icon-only (V10 allows an icon act beside a band, tooltip carries words) |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | banner to sheet gap 24 px |
| A-8a | n/a (state not shot) | |
| A-8b | no | empty.png keeps the banner, which is right; but the bar's search and "..." icons remain while their targets (Find duplicates, Merge every exact duplicate) have nothing to merge: the merge-all act is live on an empty page |
| A-8c | n/a (state not shot) | |
| A-8d | n/a (not shot) | |
| A-8e | yes | amber banner is a soft fill, no inversion |
| A-8f | no | the banner's amber text on the amber-dark fill reads at about 7:1; fine. The faint count beside the band ("2") reads hard to see against the sheet (about 3.5:1 by eye) |
| A-9a | no | beside Linear's grouped list: (1) Linear's bands carry the group name and a count only, here the band prints "Same audio - 2 tracks 2" (app) (2) Linear rows carry one extra fact each; here a choice with one needed fact set (size, path, mix) shows three parts (app) (3) all content at x=244..964 beside Linear's full-width list [W] (app) |
| B-1 | no | stops at x=964, blank 956 px [W] (app) |
| B-2 | n/a | |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | no | the bar holds two icons at the far end only (x=1842 and x=1880) and nothing wraps; but they sit 880 px from the content they act on (see D-3) |
| B-6 | n/a | |
| B-7 | yes | |
| C-1 | yes | rows 50 px by V14 two-line rule [W]; bands 46 px, taller than the row height rule of V10 ("a band at the row height") (**stack** list band; measured y=126..170) |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | no | no Section heading on this screen (see A-1d) |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | no | The screen's most common task is "resolve a group". The first (standing) bar act is "Find duplicates" (an outlined icon), the merge is an icon in each band, and there is no filled primary. After a search, the primary action should be "Merge N groups" with the count. **app** |
| D-2 | yes | Band merge has `confirm` ("Merge this group?", says the others move to the quarantine and to undo the batch in History); Pane "Merge every exact duplicate" has `confirm` but names no count and no undo ("Groups of identical audio merge into their keepers, and the other files move to the quarantine."). It is in the "..." menu, not the primary. "Not duplicates" (dismiss) and "Keep this one instead" have no confirm and `done` is absent (no toast): the dismiss is silent and cannot be reversed from this screen: `dupes.restore` exists on the server (dupes.ts:135) and no UI reads `state: "dismissed"`. **app** |
| D-3 | no | bar icons "Find duplicates" (magnifier, easily read as a search box) and the "..." menu holding "Merge every exact duplicate"; row "..." holds "Keep this one instead" and "Not duplicates". The act that decides the winner is a "..." menu item. **app** |
| D-4 | no | "MP3 320" has no unit (kbps) while the keeper reason says "(320 vs 192 kbps)"; durations 6:12 consistent with the library |
| D-5 | yes | keeper has a word; duplicate has a word |
| D-6 | no | "fpcalc", "PATH"; "Sounds the same" vs "Same audio"; "Keeper", "Merge" and "quarantine" are consistent product words; vision says "merge". "Keeper: kept higher bitrate" repeats the verb |
| D-7 | no | empty has one sentence and no act on the sheet (see A-4c) |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little: a 2-group list in 1700 px; and too little per row (see E-7) |
| E-1 | no | the page does not say how many groups are open, how many were dismissed, when the search last ran, or the library's duplicate share: `dupes.status` returns `open`, `dismissed`, `fingerprints` (dupes.ts:100-110) and the page uses only `fpcalc`. **app** |
| E-2 | no | Main task: decide each group's winner, merge. Presses: find (1 + a job wait on /jobs) → per group: merge icon (1) + confirm (1). Next step after "Find duplicates" is not shown here: the page does not show that a search is running or done; the user must go to /jobs and back. 100 groups at a time with "Show more groups" in a separate Section. **app** |
| E-3 | no | "Find duplicates" toasts "Looking for duplicates" with a link to /jobs; nothing on the page shows progress or "N groups found". Failure is only on /jobs. The list refreshes through `useJobEffects` after the job ends (jobs-effects.ts: dupeGroups invalidated), which is right but silent. **app** |
| E-4 | no | Preview: none. A merge fills tags into the keeper and quarantines the rest, and no screen shows what the keeper will gain (the "tags filled" are never listed). Undo: the confirm sentence of the band act names "Undo the batch in History" (good, at the moment of the act); the "Merge every exact duplicate" confirm omits it and omits the count; after the act nothing on the page links to the batch or the quarantine, only /jobs. **app** |
| E-5 | no | no link from a merged group to Quarantine or to History, no link from an exact group to the track records to compare. Issues does not link here. **app** |
| E-6 | no | 100 groups per page with a "Show more" row (duplicates.tsx PAGE); at 50k tracks the groups can be thousands. No sort, no filter by reason or confidence, no search; `confidence` is returned by the server and never shown. **app** |
| E-7 | no | Decision support is thin. Side by side per member: format and bitrate (yes, "MP3 320" / "MP3 192"), length (yes, 6:12 / 6:12) but not path (the whole point when two files carry the same name: where does each live?), not file size (`size` is selected in dupes.ts but never drawn), not mix (`mixName` selected, never drawn), not tag completeness (only the keeper's reason mentions "9 vs 6 fields"), not cues or playlist membership (the vision's keeper rule). The keeper is recommended (check mark, first row, "Keeper: ..." reason). No way to hear or open a member from this list: rows have no `href`. The facts are on separate lines of meta, so a difference in one fact is not scannable. In the fixture both groups show the same names, so a real "which one" decision gets no column to compare. **app** (rowsOf in duplicates.tsx); a **stack** option: a Table with `wide`. |
| E-8 | no | the fpcalc banner tells what is missing but not what to do or its effect on the result (acoustic tier off); no act. **app** |
| E-9 | no | no hint of keyboard keys; no keyboard accept path |
| E-10 | yes | sidebar Duplicates = Pane title |
| F-8 | yes | Banner is always placed with a `sentence` selection that answers `undefined` (duplicates.tsx), so it moves the page once on arrival; data shot shows it above the sheet, tone attention, one sentence; no act |
| G-1 | yes | `actions` first stands (Find duplicates), the second in more |
| G-2 | no | Section has no title and no description; second Section for "Showing N of M groups" is a row with a Plus icon: a second sheet for a footer, an overload of Section (**app**) |
| G-3 | no | rows use a leading icon for role (Check/Copy), meta carries role word and reason; marks are on the same line as meta, not on a second line |
| G-4 | n/a (no pills) | |
| G-7 | yes | tone attention, one sentence, no act, no `until` |

Top three:
1. The winner choice is made blind: path, size, mix, tag completeness, cues and playlist membership are not drawn, though `size` and `mixName` are already in the response (app, E-7).
2. Dismissing a group ("Not duplicates") and "Keep this one instead" are silent in the "..." menu with no confirm, no toast and no way back from this screen; merging has no preview of what the keeper gains and the merge-all confirm gives no count (app, D-2, E-4).
3. The search runs invisibly: the page shows no progress, no last-run, no open/dismissed counts that the server already returns (app, E-1, E-3).

---

## Organiser (/_app/organiser)
Shots read: shots/organiser/data-1920.png, shots/organiser/empty-1920.png
Source read: src/app/routes/_app/organiser.tsx, src/app/lib/preview.tsx, src/app/lib/changes.ts, src/worker/routes/organiser.ts, fixtures (previews, organiser)
Machine findings (from the run log): none
Fixture note: the data shot's change rows read "Tech-House → Tech House · Genre", which are rules-style tag changes, because the fixture's `previews.list` is shared with Rules. A real organiser preview carries `path` before → after rows. In the empty shot the banner says "3 files would move" over "Nothing here yet.", also a fixture artefact. Both are judged as layout only.

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | Template form, presets, preview banner then change table, in the order of the task |
| A-1b | no | preset rows lead with an icon, carry the name and the template as code on the meta line, and end with a Check act: no other row in the group uses a Check as "use this" (Duplicates uses Check for "keeper") |
| A-1c | yes | the form's one label column |
| A-1d | no | "TEMPLATE" has a description sentence, "PRESETS 5" has none, "PREVIEW" has none |
| A-2a | yes | |
| A-2b | no | Section title "TEMPLATE" and field label "Template" (data x=244 and x=257) say the same word twice; the form's field description (token list, 2 lines) is also repeated in no other place |
| A-2c | yes | PRESETS 5 = 5 rows |
| A-2d | yes | |
| A-3a | no | |
| A-3b | no | |
| A-3c | no | preset row: icon, name, code chip, check |
| A-3d | n/a (not shot) | |
| A-4a | no | field description is not one sentence: "{artist}, {title}, {mix}, ... {genre|Unknown} gives a fallback, [ ({mix})] is dropped when empty, / starts a folder." It is help for the syntax, not a description of the section. Section description "Where each file lives under the library folder." is one sentence and fine |
| A-4b | no | "Organiser" and "Template" are nouns; "Move the files" is a verb phrase (an act, fine) |
| A-4c | no | empty.png: Section PREVIEW draws the banner and then a sheet "Nothing here yet." The sentence `none` ("Preview the template to see where the files would go.") is the right one, but it is not drawn in the shot because the fixture has a done preview |
| A-4d | no | "Where each file lives under the library folder" is fine; "{genre|Unknown} gives a fallback, [ ({mix})] is dropped when empty" is template syntax a DJ must decode |
| A-5a | yes | one filled act, "Preview", accent blue |
| A-5b | n/a | |
| A-5c | no | |
| A-6a | no | the five Check glyphs on the presets (x=935) are one glyph for "use this preset", but a check is the stack's "selected" mark elsewhere (the Duplicates keeper): five checks read as five selected. The current preset (the one equal to the saved template) is not marked. Tooltip "Use Genre / Artist - Title" is the only meaning. **app** |
| A-6b | yes | |
| A-6c | no | the code boxes `{genre|Unknown}/...` are inline code, not pressable, fine; the green strip with "Move the files" in green text is a Button drawn as a link (stack Banner act is a quiet button in the tone's ink) |
| A-7a | n/a | |
| A-7b | yes | one form label column |
| A-7c | no | the description of the field holds its height (2 lines) |
| A-7d | yes | gaps 32 px |
| A-8a | n/a (state not shot) | |
| A-8b | no | in the empty shot the TEMPLATE and PRESETS sections are unchanged (correct) and PREVIEW is the only difference, but with the fixture's contradiction (see fixture note) |
| A-8c | n/a (state not shot) | |
| A-8d | n/a (not shot) | |
| A-8e | yes | |
| A-8f | no | the green "Move the files" text on the dark green strip (x=858..940, y=625) is about 4.4:1 by eye; and it is the one act that moves 48k files. **stack** (Banner act ink on its tone fill) |
| A-9a | no | beside Linear's settings screen of a titled column of grouped rows: (1) Linear's template-like rows are one row each; here the template is a form sheet of 3 rows (field, description, bar) with a bar that holds only one button (app: the bar's row is 56 px for one button) (2) the preview is a separate page-bottom section 600 px below the field, so the user edits at y=133 and sees the effect at y=620+ (app) (3) the page stops at x=964 [W] (app) |
| B-1 | no | x=964 stop, 956 px blank [W] (app) |
| B-2 | n/a | |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | no | the Form bar holds one button at the far right and nothing else; no overlap |
| B-6 | n/a | |
| B-7 | no | the data shot is 840 px tall and the preview table ends at y=815 under the cut line: the preview list needs scrolling to see all of the first 3 rows at 1080 viewports? At a 1080 high screen the page fits; at 800 the last row is touching the cut. Not a defect at the shot's own height |
| C-1 | yes | preset rows 50 px (two lines [W]); form field 32 px, button 32 px |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | no | see A-1d |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | no | The primary (filled) act is "Preview", which is right for the next step but the page's most consequential act, "Move the files", is a quiet green link in the banner. After a preview, the primary should move to "Move the files" and "Preview" should go outlined. **app/stack**: banner acts are always quiet in stack; an app can't fill it. Tag **stack** for the missing filled form of Banner's act, **app** for not repeating it in the bar |
| D-2 | yes | "Move the files" has `confirm` ("Every file shown moves to its new place on the hub's disk. Undo the batch in History to move them back."): worded as what it does, names undo. But the sentence says "every file shown" while the table shows the first window and the count is 48,000 files moved or 3 moves; the confirm does not repeat the count. The apply uses the saved template, not the previewed one (organiser.tsx:onAct calls `organiser.get` then `apply`) |
| D-3 | no | presets' Check acts look like a state (see A-6a); the Preview button is an affordance, correct |
| D-4 | yes | counts via `Intl.NumberFormat` |
| D-5 | no | the banner's green check glyph and "done" tone mean "completed" in the tone vocabulary, but this banner is a proposal that has not happened (`TONES` in preview.tsx:11-17 maps job state "done" to `done`): a not-yet-applied plan is drawn as a success. **app** |
| D-6 | no | "Organiser" (noun) but the page tells the user to "Preview the template" and then "Move the files": the vision's word is the same. "take a numbered name" (the collision rule) is unclear without an example. "1 take a numbered name" reads as a typo for "1 takes" |
| D-7 | no | see A-4c: the sentence tells the act ("Preview the template ...") but with the Form's own Preview button above it the sheet draws no act |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little: three sections and a 3-row table in a 720 px strip |
| E-1 | yes | "Template" and "Where each file lives under the library folder" say it |
| E-2 | no | Main task: pick a layout, see the result, move. Presses: type or press a preset (1, saves immediately), Preview (1), wait, "Move the files" (1), confirm (1). The next step after Preview is visible. But a preset press does not preview, so the user needs two presses per preset to see its effect, and a half-edited template is never previewed live: F6. **app** |
| E-3 | no | Preview toasts "Planning the moves" (no `to`); Move toasts "Moving files" with a link to /jobs. The banner shows a running job's "message: done of total" (preview.tsx:said) and shows failure with the job's error: this is the one screen of the group where progress and failure are on the page, for the preview. For the apply job the page shows nothing (the latest preview stays "done", see [P]) |
| E-4 | no | Preview before: yes, a table of the first rows plus counts, with collisions counted. Undo after: named in the confirm sentence, not offered as an act after the move; and stale preview [P]: after the move the banner still says "3 files would move" and still offers "Move the files". The preview is not marked stale when the template changes. Rekordbox relinking, which the vision promises ("Rekordbox paths are relinked automatically"), is not mentioned anywhere on the page or in the confirm. **app** |
| E-5 | no | no link to History after the move; no link to Rules from the page that says the names come from tags (the organiser output depends on clean tags; the cleanup order Rules, Review, Organiser is not suggested). **app** |
| E-6 | no | the preview windows 200 rows per read (previews.ts maxLimit 200) and a count is shown (48,000 in place); fine for 50k. No filter for collisions only, no way to see which files collided other than a "Path (name taken)" row |
| E-7 | no | the template choice is not supported by examples: the presets show a code pattern and no sample result path ("Genre / Artist - Title" → `House/Kalomi - Midnight Echo.mp3`); one example would do |
| E-8 | no | a bad template error comes from the API (`checked()`: `parseTemplate` message) inside the field; the message is the parser's, not a DJ's |
| E-9 | no | none hinted |
| E-10 | yes | |
| F-6 | no | The preview does not stand under the fields as a live before → after: the Form uses `act` + `submit` (organiser.tsx), no `onChange`, no Sheet `after`. The preview is a separate Section 500 px below, computed by a job on submit, after a template change it shows the old template's result with no mark of staleness, and says how many files it reaches ("3 files would move, 1 take a numbered name, 48,000 are already in place") only in the banner. The count is there, the live link is not. **app**; the F6 mechanism exists in stack (Form `onChange`) and is not used |
| F-8 | no | banner is a job state, not a data-only banner: it is always present once a preview exists. Tone `done` for a proposal (see D-5); one sentence; its act is the apply; no shift measured |
| G-1 | yes | no actions; fine |
| G-2 | no | "Preview" Section holds a banner and a table in one Section (a Section's `children` is a banner and a table): the table is a sheet on its own (data y=665..815) |
| G-3 | no | preset rows: icon, title, meta as code; the check act at the end. In rows the meta is a code chip: correct V7 ("machine name in mono, boxed only inside a sentence", here a template is bare in a row, but a box is drawn: data x=282..595) |
| G-6 | no | the Form has a field label "Template" under a Section "Template" (see A-2b); its description is two lines of syntax; the bar is a row of its own that holds one button (56 px tall) |
| G-7 | no | banner: tone done on a plan; act is the one commit |

Top three:
1. The preview is not live and goes stale: nothing marks it when the template changes or a preset is pressed, and after "Move the files" it still says "3 files would move" and still offers the act (app, [P], F-6, E-4).
2. A not-yet-applied plan is drawn as a green success strip with a check, and its commit act is a quiet green link, the least prominent control on a page that moves 48,000 files (app TONES mapping; stack Banner act).
3. Five identical Check icons on the presets read as five "selected" marks; the current preset is unmarked and a press saves silently with no preview (app, A-6a).

---

## Cleanup rules (/_app/rules)
Shots read: shots/rules/data-1920.png, shots/rules/empty-1920.png
Source read: src/app/routes/_app/rules.tsx, src/app/lib/preview.tsx, src/app/lib/changes.ts, fixtures (cleanup)
Machine findings (from the run log): none
Fixture note: the empty shot still draws "3 tracks would change, 3 tags in all." under "No rules yet.", because the preview fixture is shared; judged as layout only.

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | list of rules, then preview |
| A-1b | no | rule rows: leading icon, title, meta "whitespace", then a switch and a "..." end group: the order switch then more is V9's "a switch or a pick, the act" OK. The meta is the rule's `summary`, which in the fixture is a machine word ("whitespace", "title case") not a description |
| A-1c | n/a | |
| A-1d | no | "RULES 2" has a description that wraps to two lines and a Plus icon at the end; "PREVIEW" has neither. The description wraps at x=653 although the sheet runs to 964 (**stack**: the heading row reserves room for the icon act of 310 px) |
| A-2a | yes | |
| A-2b | no | row meta "whitespace" repeats the title "Trim and collapse whitespace"; "title case" repeats "Title case the artist" |
| A-2c | yes | RULES 2 = 2 rows |
| A-2d | yes | |
| A-3a | no | |
| A-3b | no | |
| A-3c | no | row: icon, name, meta, switch, menu |
| A-3d | n/a (not shot) | |
| A-4a | no | "Switched-on rules run in this order, on demand here or over chosen tracks in the library." is one sentence but is two things (order, and where they run) and wraps |
| A-4b | no | "Cleanup rules" (Pane), "Rules" (Section) say the same word twice; sidebar says "Cleanup rules" |
| A-4c | no | empty.png: "No rules yet." is one sentence in the meta ink, no act on the sheet. The act is the Plus in the heading. V15: the empty state offers its act. **app** (`empty={{ sentence }}` has no `act`) |
| A-4d | no | the form's field descriptions "Used by Change case.", "Not used by Set a tag." (rules.tsx RULE_FIELDS) name which fields apply to which action: it is a form that shows all fields for every action and tells the user to ignore some. "Find it as written / Off reads Find as a regular expression." is jargon. **app** (use one form per action) |
| A-5a | yes | no filled act on the screen; the one accent is the on-switch |
| A-5b | n/a | |
| A-5c | no | |
| A-6a | no | data: two row icons, Sparkles (builtin) and WandSparkles (user rule) look nearly identical (x=268, y=155 and y=205): two meanings, one look. The switch on = enabled. The preview banner's green check = job done (see Organiser D-5) |
| A-6b | yes | |
| A-6c | no | the Eye icon at the bar's far end (x=1880) is the page's main act ("Preview on the library") and looks like a "show/hide" toggle |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | |
| A-8a | n/a (state not shot) | |
| A-8b | no | empty keeps both Sections (correct) but with the fixture's contradictory preview (see fixture note) |
| A-8c | n/a (state not shot) | |
| A-8d | n/a (not shot) | |
| A-8e | yes | |
| A-8f | no | green "Apply to the library" on dark green: same ink as Organiser (about 4.4:1). **stack** |
| A-9a | no | beside Linear's settings of grouped rows: (1) Linear's switch rows are label left, control right in one 720 column; same here, fine (2) Linear's rows hold a sentence of what the setting does; here the meta is a machine word (app) (3) page stops at x=964 [W]; the page's main act is 916 px from its Section (app) |
| B-1 | no | [W] 956 px blank |
| B-2 | n/a | |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | no | |
| B-6 | n/a | |
| B-7 | yes | |
| C-1 | yes | rows 50 px [W]; switch 32 |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | no | see A-1d |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | no | The screen's most common task is "preview what the rules would change, then apply". Its first act is an icon-only Eye in the bar, far from the Section it answers; the Preview Section's own sentence "Preview the rules to see what they would change in the library." tells the user to press an icon that is not on the sheet. There is no filled primary. **app**: put the act in the Section (`act`) or in the sentence's empty form |
| D-2 | yes | "Apply to the library" has `confirm` ("Every change shown is written to the library and to the files. Undo the batch in History."): says what it does, names undo. "Delete" (user rules) has `confirm`, in "...", "Changes it made stay in History". Toggling a rule on has no confirm and no preview, but nothing runs until apply. Apply runs `cleanup.apply` without a template of what was previewed: the preview is of "the enabled rules" at some earlier moment [P] and the apply uses the enabled rules at the moment of apply; a rule switched after the preview changes what is written without the preview changing. **app** |
| D-3 | no | rule "..." holds Edit and Delete: Edit is the only way to read what a rule does in full and is hidden; the Eye has the tooltip "Preview on the library" |
| D-4 | yes | "3 tracks would change, 3 tags in all." counts formatted |
| D-5 | no | see A-6a, D-5 of Organiser (preview tone `done` on an unapplied plan) |
| D-6 | no | "Tags it touches", "Tag to set" (tag vs field in the vision: "tags"); "Switched-on rules" (switched on vs enabled), "stripJunk" in the form is "Strip URLs and promo tags" fine. "Rules" are also named "cleanup rules" in the sidebar; the vision calls them "if → then" rules and the form calls the rule's parts "Action", "Find", "Replace with", with no "if" at all |
| D-7 | no | see A-4c |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little: a 2-row rule list with a 3-row preview; too much in the rule form (nine fields shown at once for every action) |
| E-1 | no | the page says what rules exist and which are on, but not what a rule does: the meta is a keyword ("whitespace"), so the user must open Edit to read it. **app** (the fixture's `summary`; the server's `rule.summary` is the source) |
| E-2 | no | Main task: switch rules, preview, apply. Presses: toggle (1 per rule), Eye (1), wait, "Apply to the library" (1), confirm (1). The Eye is not next to the switches or the preview Section [D-1] |
| E-3 | no | Eye toasts "Previewing the rules" with no `to`; the banner draws the job's progress and failure (preview.tsx:said), so the preview is visible from here. Apply toasts "Applying the rules" with a link to /jobs; the page shows nothing of the apply job and the preview stays "done" [P] |
| E-4 | no | Preview before: yes (a table of before → after per track and tag). The preview is stale after a switch or edit [P]. Undo after: the confirm names it in a sentence, and no act is shown after the apply; History is in the System group of the sidebar. **app** |
| E-5 | no | no link to the Review (auto-tag) or to the Organiser, which is the next step; the Section sentence "or over chosen tracks in the library" points to another screen without a link |
| E-6 | no | the preview windows (200 per read, 3 rows in the fixture); at 50k with a loose rule, the table is a window with a total: fine. The order of rules is stated ("run in this order") but cannot be seen (no numbers) or changed (no reorder in the menu): F4 for an ordered list. **app** |
| E-7 | n/a (the choice is a switch) | |
| E-8 | no | an invalid regular expression in Find would come from the API; not checked here |
| E-9 | no | none hinted |
| E-10 | yes | |
| F-4 | no | the rules list states an order and offers no position column and no reorder entry in "..." (rules.tsx toRow `more` has Edit and Delete only). **app** |
| F-6 | no | the Sheet form for Add/Edit rule has no `after` preview of what the rule would change on a sample; the user learns only after saving, then the Eye, then the preview. **app** |
| F-8 | no | the preview banner is a state banner (see Organiser) |
| G-1 | yes | one action in the bar |
| G-2 | no | "Rules" Section: description 2 lines (see A-1d) |
| G-3 | no | rows: leading icon with no distinct meaning (A-6a); meta machine word |
| G-6 | no | RULE_FIELDS shows nine fields for six actions, with "Used by ..." descriptions; fields that do not apply to the chosen action are shown. **app** |
| G-7 | no | see Organiser |

Top three:
1. The page's main act (preview) is an icon-only Eye at the far end of the bar, 900 px from the Preview Section that tells the user to press it; the empty form of that Section offers no act (app).
2. The preview can disagree with what apply writes: switching or editing a rule never invalidates it, it carries no age, and it stays after apply (app, [P], D-2).
3. Rows say "whitespace" and "title case" instead of what the rule does, and the order the Section promises is neither visible nor changeable (app, E-1, F-4).

---

## Review (/_app/review)
Shots read: shots/review/data-1920.png, shots/review/empty-1920.png
Source read: src/app/routes/_app/review.tsx, src/app/lib/changes.ts, src/shared/intelligence.ts (by reference), plugins/react-ui guide rules.md (Table), fixtures (autotag)
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | list pattern: toolbar bare on the table, then the list: yes. But the table is drawn as a list (see F-2), so its Field, Change, Source and Sure columns are one meta line |
| A-1b | no | row: checkbox, name, then a line of source pill + "Added Tech House · Genre · Sure 93%". Source is a chip here and plain text in Duplicates/Quarantine; the change (before → after) is prose inside the meta, not a before and after (data: "Cipher → Cipher Records · Label · Sure 78%", "Added Tech House · Genre · Sure 93%") |
| A-1c | n/a | |
| A-1d | n/a (no Section) | |
| A-2a | yes | |
| A-2b | no | "Kalomi - Midnight Echo (Extended Mix)" appears on two consecutive rows (two proposals, two fields): the track name repeats per field. At 50k a track with six proposals stands six times |
| A-2c | no | foot "0 of 3 fields chosen" = 3 rows. Right. In the empty shot "0 of 0 fields chosen / Choose fields first." draws a dead foot over an empty list (**stack** Table select bar with no rows) |
| A-2d | no | rows draw a Check act and a "..." menu on every row; fine |
| A-3a | no | |
| A-3b | no | |
| A-3c | no | the list form carries: checkbox, name, source chip, change prose, field, confidence, act, menu: four meta parts. The count is within V9's budget only because the Table collapsed its columns |
| A-3d | n/a (not shot) | |
| A-4a | n/a | |
| A-4b | no | column "Sure" (review.tsx COLUMNS key confidence) is a word a DJ would read as "confidence"; the rows read "Sure 93%". "Show: Waiting" vs state name "pending" in source; "Review" for auto-tag proposals vs the Inbox's "approve" in the same sidebar |
| A-4c | no | empty.png: "Nothing here yet." is generic, offers no act and says nothing about what fills it (auto-tag proposals come from running auto-tag on tracks) |
| A-4d | no | the foot "Choose fields first." is an instruction; "Show: Waiting" names a filter, fine |
| A-5a | no | the selection foot draws "Accept" and "Reject" both outlined, no filled primary; disabled Accept looks fainter than the enabled Reject, so Reject is the more prominent act of a screen whose common act is accept (data y=777, x=842..963). **app/stack**: a disabled act is a stack form; the foot's emphasis is **app** (give Accept the primary) |
| A-5b | no | the source chip (dot + "Beatport") is a type pill with a neutral dot for all sources (family "neutral"): the chip carries no hue, so three sources look identical. App's choice (`family: "neutral"`) |
| A-5c | no | |
| A-6a | no | the double-check glyph in the bar (x=1842, "Accept all above a confidence") and the single check in each row (x=897, "Accept Genre of ...") are the same family and differ by one stroke; the top one opens a sheet (a safe act), the row one applies. **app** |
| A-6b | yes | rows have `href` to the track and no chevron |
| A-6c | no | the checkbox column looks like a selection; correct |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | yes | toolbar to sheet 30 px |
| A-8a | n/a (state not shot) | |
| A-8b | no | empty keeps the toolbar and the foot bar, so the foot "0 of 0 fields chosen" stands over nothing (see A-2c) |
| A-8c | n/a (state not shot) | |
| A-8d | n/a (not shot) | |
| A-8e | yes | |
| A-8f | no | the foot's hint "Choose fields first." and the disabled Accept read as faint; the foot's text is small (12) on the table's ground at about 4.5:1 |
| A-9a | no | beside Linear's grouped list: (1) Linear shows an assignee and labels as columns on a full-width list; here the table's columns Field, Change, Source, Sure are collapsed into prose [W] (app) (2) the foot bar spans x=220..1920 but its content stands at 244..964, leaving 956 px empty (app, [W]) (3) rows repeat the track name per field instead of banding by track (app) |
| B-1 | no | [W]: the sheet stops at x=964; the foot's acts at x=842..963 |
| B-2 | n/a | |
| B-3 | n/a (the table is in list form) | |
| B-4 | yes | |
| B-5 | no | foot: "0 of 3 fields chosen", "Select all", hint, Accept, Reject on one line, no overlap. But the foot's items are split: "Select all" at x=385 and the acts at x=723..963, with 300 px between them |
| B-6 | n/a | |
| B-7 | no | the foot bar is docked at y=755..800 and the list stands above it; fine |
| C-1 | yes | rows 52 px; source chip 20 px |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | n/a | |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | no | The most common task is "accept". The bar's first action is the double-check sheet; the foot has no filled primary (A-5a). **app** |
| D-2 | no | "Reject everything waiting" has `confirm` and says "not proposed again for those tracks" (good) and is in the "..." menu. But the selection foot's "Reject" (`reject.mutateAsync({ proposals: picked })`, `picked` may be "all rows except ..." over 50k) and the row's "Reject" in "..." have no `confirm`; "Accept" (which writes tags to the files) has no confirm and no undo hint at the foot or the row (the batch is in History; the toast has `done: "Applying the tags"` with `to: "/jobs"`). Accept-above-confidence's sheet says "applied as one batch" but not "undo in History". **app** |
| D-3 | no | row Accept is a Check icon with an accessible name of `Accept ${field} of ${label}` (good), no word; the "..." holds Reject; a rejected field cannot be undone from here (the filter "Show" can view rejected; no Un-reject act) |
| D-4 | no | "Sure 93%": the unit is per cell, not in the header; the foot's "0 of 3 fields chosen" has no thousands separator concern |
| D-5 | no | confidence is text only; no bar or tone for low vs high |
| D-6 | no | "fields" (the foot noun) vs "tags" (Rules, Genres) vs "proposals" (the Table's accessible label): three words for one thing |
| D-7 | no | see A-4c |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little visible: a 3-row list at 720 px; too little decided per row: no current value, only the change |
| E-1 | no | "Review" and "Show: Waiting" do not say what is being reviewed (auto-tag results) or how many wait (the picker's description holds the counts but only when the picker is open). No heading, no count of waiting proposals, no source summary. The Pane title "Review" collides with the Inbox's review. **app** |
| E-2 | no | Main task: accept the good proposals, reject the bad. Fast path: bar "accept above confidence" (open sheet, press, 2) or select + Accept. Per row: one press (Check). Reasonable, but per field not per track: a track with six proposals takes six presses or ticks, and rows are not grouped by track. **app** |
| E-3 | no | Accept toasts "Applying the tags" with a link to /jobs. The rows vanish after the invalidation and nothing says how many were applied or that the files were written. Failure is on /jobs only. **app** |
| E-4 | no | Preview before: the change is the proposal itself (before → after is the preview) but at the narrow width it is prose "Added Tech House", and "Added" hides the old value. Undo after: not visible at the moment of the act (only the pane description in source comment); Accept writes to files. **app** |
| E-5 | no | rows open the track (`href /library/<id>`), which leaves the list; no link to run auto-tag from here; after accepting no link to History |
| E-6 | no | the list is a window over a total (the data is windowed: `autotag.list.window`) and preloaded; a Show filter is the only filter: no filter by source, confidence or field, no sort in the list form, no search. At 50k tracks the proposals can be tens of thousands. The high-confidence bulk path exists (acceptAbove). **app** |
| E-7 | no | Decision support: source (yes, chip), confidence (yes), before → after (as prose; in a wide table it would be a `change` cell), the other values ("Other values" column is hidden: `hidden: true`, so the alternatives from other providers are not visible in the shot), the track's current tags (only the one field's before). No way to hear the track. The recommended choice is the confidence percentage. **app** (`wide` and the hidden column) |
| E-8 | no | no failure state seen |
| E-9 | no | Space or `x` ticks a row (stack Table with `choose`) but nothing on the screen says so |
| E-10 | no | the sidebar puts "Review" in Curate and "Inbox" in Library, two screens both named for a review of something arriving; the label "Review" does not say auto-tag |
| F-2 | no | The Table is drawn as a list because its container is 720 px (< 765, V14): no leading column, no column headers, no sort mark, no columns menu (it has a hidden column, so it would draw one), no frozen acts column, and the "Change" kind cell is a line of prose. The selection bar is docked at the foot (good) but with a 956 px empty tail. With `wide` the table would show Track, Field, Change as before → after, Source, Sure and the hidden Other values. **app** (`wide`) |
| F-3 | no | windowed, total in "0 of 3 fields chosen"; no scroll jump visible at 3 rows |
| F-6 | no | "Accept by confidence" sheet has one field and no `after`: the user does not see how many fields would be accepted at 85 percent before pressing "Accept and apply" (the count is the whole point). **app** |
| F-8 | n/a | no banner |
| G-1 | yes | `actions` first stands; second (reject all) in more |
| G-3 | no | see A-1b |
| G-4 | no | the source chip carries a neutral dot on every source; "type pill with dot" is meant to carry a hue |
| G-5 | yes | Toolbar bare on the table, a filter first; no search (see E-6) |
| G-8 | yes | the Picker "Show: Waiting" draws its label |

Top three:
1. The Table is squeezed into 720 px and drawn as a list, so the before → after diff, which is the whole job of this screen, is a line of prose ("Added Tech House"), columns, sort and the hidden "Other values" are gone, and 956 px of canvas are blank (app: add `wide`).
2. Bulk acts with real consequence have no safety at the moment of the act: the foot's "Reject" over a selection (possibly all but a few of 50k) has no confirm, "Accept" writes to files with no undo hint, and "Accept by confidence" does not say how many fields it would take (app, D-2, F-6).
3. Rows are per field, not per track, with the track name repeated, no filters by source, confidence or field, and an empty state with no act and a dead "0 of 0 fields chosen" foot (app for the first two; stack Table for the dead foot).

---

## Quarantine (/_app/quarantine)
Shots read: shots/quarantine/data-1920.png, shots/quarantine/empty-1920.png
Source read: src/app/routes/_app/quarantine.tsx, fixtures (quarantine)
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | a list with no toolbar, no bands and no heading: the table drawn as a list (see F-2) |
| A-1b | no | row meta "House/Kalomi - Midnight Echo.mp3 · Days left 29" then an end "1 day": a label-and-value in the meta ("Days left 29") and an unlabelled age at the end |
| A-1c | n/a | |
| A-1d | n/a (no Section) | |
| A-2a | yes | |
| A-2b | no | restore appears twice with the same glyph: bar (x=1842) and row (x=897): the "Restore all" act and the row's restore are the same icon at two scopes |
| A-2c | yes | |
| A-2d | yes | |
| A-3a | no | |
| A-3b | no | |
| A-3c | no | row: name, path, "Days left 29", age, restore, menu: two meta parts and an age |
| A-3d | n/a (not shot) | |
| A-4a | n/a | |
| A-4b | no | "Days left 29" is a label-value in a meta line; "Was at" column is a path, "Moved" is a column; fine nouns. "Quarantine" is the vision's word |
| A-4c | no | empty.png: "Nothing here yet." says nothing about what lands here (files removed by Merge, Delete) or for how long; no act |
| A-4d | no | |
| A-5a | yes | no filled act |
| A-5b | n/a | |
| A-5c | no | |
| A-6a | no | the restore glyph (a box with an up arrow) is used for the bar's "Restore all" (confirm) and the row's "Restore <name>": two scopes, one glyph. The "..." holds the destructive "Delete now". Deleting is not marked by a trash glyph on the row |
| A-6b | yes | |
| A-6c | no | "1 day" is plain text but reads as the countdown (see D-4) |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | n/a (one part) | |
| A-8a | n/a (state not shot) | |
| A-8b | yes | empty keeps the bar's acts (the bar's "Restore all" and "..." stay live on an empty quarantine: a dead act) |
| A-8c | n/a (state not shot) | |
| A-8d | n/a (not shot) | |
| A-8e | yes | |
| A-8f | no | the faint meta "Days left 29" reads at about 4.5:1 |
| A-9a | no | beside Linear's list: (1) Linear's list carries columns and a status word per row; here a table is a one-line list with an ambiguous age (app [W]) (2) no grouping or band (by merge batch, by reason) (app) (3) whole page 244..964 [W] (app) |
| B-1 | no | [W] 956 px |
| B-2 | n/a | |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | no | |
| B-6 | n/a | |
| B-7 | yes | |
| C-1 | yes | row 52 px |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | n/a | |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | n/a | no filled act. The common task is "restore one" or "leave it": the bar's first act is "Restore all", a bulk act with a confirm, standing first |
| D-2 | yes | "Empty the quarantine" has `confirm` ("The files are removed from the disk for good. This cannot be undone."), worded as what it does, and is in the "..." menu (not the first act): right. "Delete now" per row has `confirm` and is in the row's "...". "Restore all" has `confirm`. Missing: the confirm for "Empty the quarantine" names no count or size ("every quarantined file" of how many, of how many GB), which is the number that makes it a decision. **app** |
| D-3 | no | the restore glyph's names are `Restore <label>` in source (good); the bar's first act is the Restore all, and "Empty the quarantine" is a trash act two taps away in "..." |
| D-4 | no | quarantine.tsx COLUMNS: "Days left" (number) and "Moved" (age). In the list form the header is gone, so "1 day" (the age) sits next to "Days left 29": a DJ reads "1 day" as the time before purge. On a screen whose act is permanent deletion this is a risk. In the wide table the headers resolve it. **app** (`wide`) and **stack** (the list form of a Table drops column names for age cells) |
| D-5 | no | no state word; a file about to be purged (days left near 0) has no emphasis |
| D-6 | no | "Quarantine", "Restore" (vision words), "Delete now" and "Empty the quarantine" (vision: purge) |
| D-7 | no | see A-4c |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little: one row; and too little per row (no reason, no size) |
| E-1 | no | "Quarantine" says it; nothing tells the user how long files are kept (Settings sets the days), how many files or how much space they hold. No count or size anywhere. **app** |
| E-2 | no | Main task: restore a file by mistake or empty. Per row restore is one press; but a subset cannot be chosen: the Table has no `choose` or `select`, so a user who wants to restore the 40 files of one merge has only 40 single presses or "Restore all". **app** |
| E-3 | no | Restore toasts "Restoring" (row, no `to`) and "Restoring files" with /jobs for all; the row stays until the job ends and the list refreshes (jobs-effects invalidates `files`). Failure is only on /jobs |
| E-4 | no | Preview: none needed for a restore. Undo of a delete: none (by design, the confirm says so). Visible at the act: yes for deletion. But why a file is here is not shown (merged into which keeper, removed by which rule), so restoring a duplicate loser is a blind choice and re-creates a duplicate. **app** |
| E-5 | no | no link to the batch in History, to the keeper track, or to Duplicates; the row does not open the track (no `href`, the track has left the library) |
| E-6 | no | window with a total; but no search, sort or filter: after a merge-all of exact duplicates the quarantine can hold thousands of rows. **app** |
| E-7 | n/a (no choice between candidates) | |
| E-8 | no | no failure state seen |
| E-9 | no | none hinted |
| E-10 | yes | sidebar Quarantine in Curate = Pane title. History (the undo) is in System, not next to it |
| F-2 | no | the Table is drawn as a list (container 720 < 765): no columns, no header, no sort mark, no frozen acts; "Was at" (a `source` kind column), "Days left" and "Moved" collapse into one meta line and an age. With `wide`, four columns would stand and "Days left" would be sortable (soonest to purge first). **app** |
| F-3 | no | windowed; total 1 |
| F-8 | n/a | |
| G-1 | yes | `actions` first stands (Restore all), second in more |
| G-3 | no | meta is a path plus a label-value; end group has age, act, menu in order (V9 order: age, act, more: yes) |
| G-5 | n/a (no toolbar: see E-6) | |

Top three:
1. "1 day" (age) beside "Days left 29" reads as the time before purge on the one screen where the next act is permanent deletion, and no column header says otherwise because the Table collapsed into a list at 720 px (app `wide`; stack for the list form dropping column names).
2. A restore or a purge cannot be done for a chosen subset, the rows give no reason or batch they came from, and the empty-the-quarantine confirm names no count or size: the safety net has no handles (app).
3. The screen does not say how long files stay, how many it holds, or link to History, so undo of the cleanup chain's last step is on another screen the sidebar puts in System (app).

---

## Across the group

### Inconsistencies between the group's screens (C1b, G4, D6)
- Width: all twelve shots stop at x=964 on a 1920 canvas, 956 px blank, because none sets `wide` ([W]; every shot). The two table screens (shots/review, shots/quarantine) lose their columns because of it; the section screens (shots/issues, shots/duplicates, shots/organiser, shots/rules) lose one-line rows.
- Section heading form: Organiser's TEMPLATE has a description, PRESETS and PREVIEW have none (shots/organiser); Rules' RULES has a description that wraps and a Plus (shots/rules); Issues' sections have none (shots/issues); Duplicates has no heading at all (shots/duplicates); Review and Quarantine are bare tables (shots/review, shots/quarantine). Five forms for six screens.
- Empty sentences: "Nothing to fix." (issues), "No duplicates found. Find duplicates to search the library." (duplicates), "Nothing here yet." (review, quarantine, preview tables), "No rules yet." (rules). Only Duplicates names its act and none draws it (V15, D7).
- Confirms: Duplicates, Rules, Organiser and Quarantine name Undo or "cannot be undone" in their confirms; Review's selection Reject, row Reject and Accept carry none; Duplicates' "Not duplicates" and "Keep this one instead" carry none.
- Check glyph: keeper (shots/duplicates), "use preset" (shots/organiser), "accept field" (shots/review), the sidebar's selected sign: four meanings for one glyph.
- Restore glyph: the bar's "Restore all" and the row's restore in shots/quarantine are one glyph at two scopes.
- Counting: Issues "6200" with no separator beside "30,000" (shots/issues); every other screen formats counts.
- Words: "fields" (review foot), "tags" (rules), "proposals" (review table name), "Review" (auto-tag) vs Inbox review in the sidebar; "fpcalc", "ffmpeg", "PATH" in two banners (shots/issues, shots/duplicates).
- Tone: a done-tone green strip draws an unapplied plan in shots/organiser and shots/rules.

### Stack findings (roster defects, with the fix in stack)
- Banner `act` (shots/organiser, shots/rules): drawn as a quiet button in the tone's ink; green on dark green is about 4.4:1 by eye and it is the commit act of a file-moving page. Fix: give Banner an `act` form with the Button's outlined or filled look, or a contrast floor of 4.5:1 for the tone ink on its fill.
- Table select foot with no rows (shots/review/empty): "0 of 0 fields chosen / Choose fields first. Accept Reject" over an empty list. Fix: the Table draws no selection bar while it has no rows to choose.
- Table in list form (shots/review, shots/quarantine): the list form drops column names, so an age cell ("1 day") loses its meaning, and a `change` cell becomes prose. Fix: the list form puts the column label before each non-leading cell, or `kind: "age"` draws "Moved 1 day ago".
- Row `trailing: { count }` (shots/issues): draws "6200" with no separator. Fix: format with Intl.NumberFormat in stack's row.
- Row `leading: { status }` (shots/issues): dot without its word; V9 puts the word on the meta line. Fix: draw the word, or document that the dot is not alone.
- List band (shots/duplicates): 46 px against V10's "a band at the row height"; Section heading row with an icon act wraps its description at x=653 though the sheet runs to 964 (shots/rules).
- Banner has no `tone` for "a plan waiting for you"; the vocabulary only has done, running, waiting, idle, failed, attention, active, so the app uses `done` for an unapplied preview. A `tone="active"` (news) would be the right pick and exists (`active` is the default): so this one is the app's mapping.

### UX: the chain as the user walks it (E5)
1. Issues (shots/issues): the user sees counts, opens a row into the library filtered. No row says what to do: no link to Duplicates, Rules, Organiser or Review. "Corrupt audio 0" with a green dot hides that 18,210 files are unchecked. The chain starts with a page that points nowhere and overstates health.
2. Duplicates (shots/duplicates): the user runs a search that shows nothing on this page, merges per group with a confirm that mentions Undo in History, and chooses a winner from format, bitrate and length only: no path, size, mix, tags, cues. "Not duplicates" is silent and cannot be taken back from the UI.
3. Rules (shots/rules) then Organiser (shots/organiser): both use the shared preview section. The preview is not live, can disagree with the rules or the template that will be applied, goes stale after a change and after the apply, and is drawn as a green success. The Organiser never mentions the Rekordbox relink the vision promises. The Rules' main act is an icon far from its section.
4. Review (shots/review): the diff is prose, per field, with no per-track view, and the bulk Reject and Accept carry no confirm or undo hint; "Accept by confidence" does not say how many it takes.
5. Quarantine (shots/quarantine): the files removed by step 2 land here with no reason, no batch link, no subset restore, a countdown that is easily misread, and a purge confirm with no count.
6. History/undo is in the sidebar's System group and is named in confirm sentences only; no screen of the chain links to the batch it just made, and each act's toast links to /jobs instead. The step the vision calls the safety net (principle 2) is one navigation away from where the act happened, on every screen.

Checked with limits: loading, error and not-found shots for these six screens do not exist, so C8a/C8c, D8, F9 and F10 are `n/a (state not shot)`; the Table's wide form for Review and Quarantine was judged from stack's guide and source, not from a shot; `Banner` contrast numbers are by eye from the PNGs, not measured.
