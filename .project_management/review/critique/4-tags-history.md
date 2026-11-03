# Tagging, history, jobs and the gates

Group: tags, genres, aliases, history, history/$batchId, jobs, sign-in, connect/consent, connect/organization.
Shots: dark, 1920 only. 320, touch and light mode are `n/a (not shot)` and not repeated per item. Loading/error/not-found are stack's shared frame forms and were not shot for these screens: answered `n/a (state not shot)`. Gate screens' `empty` shots are identical to `data` (they read nothing): said once here. The run log lists no machine finding (axe, overflow, render walk, shift) for any screen of this group. The sidebar below 'Downloads' (Devices, History, Backups, Jobs, Settings) is cut by the 800 px shot: could not check the sidebar foot.
Tags: **app** = TrackVault composition, **stack** = a roster component or a stack rule.

## Custom tags (/_app/tags)
Shots read: /home/user/trackvault/apps/hub/shots/tags/data-1920.png, tags/empty-1920.png
Source read: /home/user/trackvault/apps/hub/src/app/routes/_app/tags.tsx, routes/_app/route.tsx (places), worker/routes/tags.ts
Machine findings (from the run log): none (axe, overflow, render walk, shift: all pass)

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | yes | tags/data: bar, then one list sheet; nothing out of order (no toolbar needed for 3 rows) |
| A-1b | yes | tags/data rows: tag icon, name, '840 tracks' under it, library glyph and more at the end; same slots as the genre and alias rows |
| A-1c | n/a | no definition list |
| A-1d | n/a | the list is untitled in the Pane (tags.tsx:75), no section heading |
| A-2a | yes | no fact row with an absent value |
| A-2b | yes | no fact shown twice |
| A-2c | n/a | no count to check against rows (no heading count) |
| A-2d | yes | no row reserves room for a missing part |
| A-3a | yes | nothing truncates at 1920 |
| A-3b | yes | no word truncates |
| A-3c | yes | each row: name, one meta (count), end group (library link, more) |
| A-4a | n/a | no section description |
| A-4b | yes | 'Custom tags' noun; sentence case; term 'tag' used as in the sidebar |
| A-4c | no | tags/empty: 'No custom tags yet. Make one, then put it on tracks.' is two sentences and an instruction (V15: one sentence in the meta ink over an outlined act); no act under it, the only way to make a tag is the bare + glyph at the bar's end (x1880,y21). tags.tsx:77-79. Fix: one sentence and `empty.act` = New tag. **app** |
| A-4d | yes | no UI mechanic word ('Show X in the library' tooltip names the thing) |
| A-5a | yes | no filled act on the screen; accent only on the sidebar bar |
| A-5b | n/a | no pills |
| A-5c | yes | no colour hierarchy |
| A-6a | yes | tag glyph = a tag; library glyph = show in the library (tooltip 'Show Peak time in the library', tags.tsx:29); ... = more |
| A-6b | yes | no chevron, no lock; the library glyph is a link and says so in its tooltip |
| A-6c | yes | nothing non-pressable looks pressable |
| A-7a | n/a | one pane |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | yes | one section only |
| A-8a | n/a | state not shot; the frame's waiting form is shared (see library/loading shot) |
| A-8b | yes | tags/empty: the bar and + stand as in data; the list sheet becomes one sentence row (46 px) - the same sheet, rows gone |
| A-8c | n/a | state not shot; the frame's failed and not-found forms are shared |
| A-8e | yes | dark reads drawn: slate sidebar, sheet an edge lighter than the table |
| A-8f | no | tags/data: the meta '840 tracks' (12 px, meta ink on the sheet) is the faintest text and reads dim but passes the axe floor (log: no finding); the library glyph at x897 is lighter than its neighbour more. Low. **stack** |
| A-9a | no | Beside Linear's grouped list (voice.md anchor row 1): 1) tags/data is 3 rows and no bands, no counts at the top, no filter: a 6-row-per-screen-height list holds 3 rows in 1676 px of canvas, 956 px of it blank right of the sheet (**stack**: Pane `*:max-w-reading`, Section lists cannot be `wide` usefully); 2) rows are 50 px two-line (name over '840 tracks') where Linear's are one line with the count at the end (**stack**: row meta under title, pane/row/ROW_TEXT vs voice 9 'meta on the same line'); 3) no explanation what a custom tag does here (maps to Rekordbox My Tags and to the file per vision) (**app**) |
| B-1 | no | tags/data: sheet x244-964 (720 px = reading width); blank band x964-1920 = 956 px. V17 'a list page is wide'. A Section list inside a Pane stops at the reading width; the Pane's `wide` (pane/index.tsx `*:max-w-reading` lifted by `wide`) would stretch rows over 1676 px, which is worse for a 3-field row. **stack** (V17 and the Pane's reading cap disagree for Section lists) |
| B-2 | n/a | single pane |
| B-3 | n/a | no wide table on this screen |
| B-4 | yes | sheet left edge x244 = bar title x244 |
| B-5 | yes | bar holds one title and one glyph; no wrap |
| B-6 | n/a | no chart |
| B-7 | yes | sidebar x0-220 = 220 px; its first row 'trackvault' on y=21, the same line as the bar title; no dock shown (nothing playing), no list reaches the foot. Sidebar below 'Downloads' is cut by the 800 px shot: could not check (the footer group). |
| C-1 | no | tags/data rows pitch 50 px (y95, 145, 195), not 32: the count sits under the name. voice.md 9 says meta on the same line; structure.md 21 says 'title over its meta line': the two stack pages disagree and the render follows 21. **stack** |
| C-2 | n/a | no definition list |
| C-3 | yes | name and count are stacked, no baseline pair |
| C-4 | n/a | no section heading |
| C-5 | n/a | one pane |
| C-6 | yes | two sizes (13, 12) plus the 13/500 bar title |
| D-1 | no | no filled act: the primary task (New tag) is the + glyph at x1880,y21, a 32 px ghost icon in a 1700 px bar. D1 asks the screen's most common task to be the primary; for a page whose only create act is a bare glyph, the empty form should carry it. **app** |
| D-2 | yes | Delete is in `more`, worded 'Delete', carries confirm 'Delete Peak time?' (tags.tsx:48-53). But see E-4: the sentence 'It comes off every track that carries it.' omits the count (840 tracks) and the delete is not logged. **app** |
| D-3 | yes | library and more glyphs have tooltips and names (tags.tsx:29); + is 'New tag' |
| D-4 | no | '840 tracks' counts per row are in meta and not right-aligned; `count.format` groups digits (tags.tsx:15), ok. 'Changes 1880' elsewhere is not (see History) |
| D-5 | n/a | no status |
| D-6 | no | 'Custom tags' (sidebar group 'Tags' holds 'Custom tags') vs the page that says 'tag'; empty copy 'put it on tracks' vs track records' 'Edit tags'; glossary: tag / custom tag / My Tag not unified. Low. **app** |
| D-7 | no | tags/empty: sentence only, no act (see A-4c). **app** |
| D-8 | n/a | state not shot |
| D-9 | no | too little: 3 rows, nothing says what the tags do or where they are used; the 956 px band is dead canvas. **app/stack** |
| E-1 | no | tags/data: the screen says 'Custom tags' and three names with counts; nothing says these are the owner's own vibe/energy/venue labels, that they sync to Rekordbox My Tags, or how many tracks are untagged. Only the empty copy hints at purpose. **app** |
| E-2 | no | Main task: make a tag, then apply it. Make = 2 presses (+, type, Add = 3). Applying is not on this screen at all: the empty sentence says 'put it on tracks' but links nowhere; the only link is each tag's library glyph (opens /library?tag=). Apply happens in the library selection bar or the record. Next step hidden. **app** |
| E-3 | n/a | rename, delete and create are instant writes, no job; the toast `done` text is the feedback (rename/new have `done`, delete has none: tags.tsx:48). Delete of a tag from 840 tracks gives no done toast. **app** |
| E-4 | no | Delete tag removes the tag from every track (tags.ts:55-61 `delete(tagsTable)` plus cascade) with no batch, so it is not in History and cannot be undone; vision principle 2 says nothing destructive without preview and undo. The confirm says what but not how many (840). Fix: write a history batch (like `assign`, tags.ts:105) or at least print the count. **app** (route) |
| E-5 | no | Cleanup chain: Tags > Genres > Aliases > History. This page links forward only to /library?tag=. No link to History after a delete, no link to Genres/Aliases. The sidebar groups Tags apart from Curate and History in System. **app** |
| E-6 | no | 50k tracks: 840 / 612 / 97 per tag is fine; a library with 60 tags has no search or sort (list order is by id: Peak time, Warm-up, Closing = by use? unknown), no filter. Low until tags grow. **app** |
| E-7 | n/a | no choice between candidates |
| E-8 | n/a | no failing operation here; duplicate name is the server's 'That tag exists' in the sheet (not shot) |
| E-9 | no | no shortcut hint on the screen; + has no key; rows are not a grid. Low. **app** |
| E-10 | yes | sidebar 'Custom tags' = Pane title 'Custom tags'; sits under group 'Tags' with Genres and Aliases |
| F-1 | n/a | no player or waveform on this screen |
| F-2 | n/a | no Table |
| F-3 | n/a | no windowed table |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested place on this screen (sidebar's House folder is the shell's) |
| F-6 | n/a | no live-preview form |
| F-7 | n/a | no secret field |
| F-8 | n/a | no banner |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats cells |
| F-11 | n/a | no BarChart |
| F-12 | n/a | not a gate |
| G-1 | yes | title = sidebar label; `back={false}`; one action; no record pane |
| G-2 | no | tags.tsx:75 a list outside a titled section is its own sheet - ok; but it has `empty` with sentence only, no act (V15). **app** |
| G-3 | yes | leading tag glyph = type mark, name, meta, end group: link, more (no chevron) |
| G-4 | n/a | no pills |
| G-5 | n/a | no Toolbar (see E-6) |
| G-6 | n/a | forms only in sheets (Rename, New ...): not shot |
| G-7 | n/a | no banner |
| G-8 | n/a | no control |
| G-9 | n/a | not a gate |
| G-10 | n/a | no Card/Image/Text restyle in the source |

Top three:
1. No act for the page's one job: tags/empty says 'Make one, then put it on tracks' but the only create act is a bare + glyph, and nothing on the page leads to where a tag is put on a track (app: tags.tsx:77, add `empty.act` and a link to the library).
2. Deleting a tag from every track is not logged or undoable and its confirm omits the count (tags.ts:55-61; tags.tsx:49-52), against vision principle 2 (app).
3. 956 px of blank canvas right of a 3-row 720 px sheet and nothing says what a custom tag is for or syncs to (stack for the reading cap, app for the missing purpose line).

## Genres (/_app/genres)
Shots read: /home/user/trackvault/apps/hub/shots/genres/data-1920.png, genres/empty-1920.png
Source read: /home/user/trackvault/apps/hub/src/app/routes/_app/genres.tsx, lib/preview.tsx, lib/changes.ts, worker/routes/taxonomy.ts, worker/routes/previews.ts
Machine findings (from the run log): none (axe, overflow, render walk, shift: all pass)

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | yes | genres/data: bar, section 'Not in the taxonomy', 'Taxonomy', 'Unify preview' (banner then changes table): the fix order of the task (unknown values, taxonomy, preview) is sensible |
| A-1b | no | genres/data: unknown rows carry name + '14 tracks · Closest: House, Deep House' + a picker + more; taxonomy rows carry name + '5,200 tracks' + more + fold chevron; alias children carry name + 'Alias' + X. Three different end groups for 'genre-ish' rows; the preview rows carry no icon at all. Differs also from aliases (check = merge). **app/stack** |
| A-1c | n/a | no definition list |
| A-1d | no | genres/data: 'NOT IN THE TAXONOMY 2' has count + two-line description, 'TAXONOMY 2' has count + + icon act and no description, 'UNIFY PREVIEW' has neither count nor description. Form differs section to section (C1d expects one form). **app** genres.tsx:213-237 |
| A-2a | yes | no label without value |
| A-2b | no | genres/data: the preview's third row 'Sha & Tormar feat. Lio → Sha & Tormar · Artist' is an artist change on the Genres page, and appears again on aliases/data: the same preview shows on both screens (see E-1). **app** lib/preview.tsx:75 `latest.read({ kind })` ('unify' for both pages) |
| A-2c | no | genres/data: TAXONOMY count 2 = genres (Tech House, Drum & Bass) but 3 alias rows also stand; 'Not in the taxonomy 2' = 2 rows ok; banner '3 tracks would change.' = 3 rows ok but one of them is an Artist change that this page's apply (`fields: ["genre"]`, genres.tsx:250) will not write. **app** |
| A-2d | yes | alias children reserve no leading mark slot (indent rail instead); ok |
| A-3a | yes | nothing truncates at 1920 except below |
| A-3b | no | genres/data 'Minimal Tech' row: the picker reads 'Map Minimal Tech to a cl…' (x749-890): 'close' cut at 1920 because the label is a sentence used as the placeholder (genres.tsx:166). Hous row shows 'Map Hous to a close genre' whole, so the cut depends on the genre name. **app** (label should be 'Map to...'; the accessible name can be longer) |
| A-3c | no | genres/data unknown row: name, count, 'Closest: ...' suggestions, picker, more = name + two meta + two end items; the picker and its sentence label duplicate the meta 'Closest: House, Deep House'. **app** |
| A-4a | no | 'Genre values the library carries that no genre or alias names. Map one to a genre, then unify.' is two sentences, the second an instruction (genres.tsx:214). Wraps to 2 lines at the 58-char measure. **app** |
| A-4b | no | 'Unify' / 'Unify the library' / 'Map' / 'Alias' / 'Taxonomy' / 'Closest': verbs and nouns of one idea. 'Taxonomy' is jargon for a DJ (a list of genres). 'Preview unify on the library' tooltip. **app** |
| A-4c | no | genres/empty: 'Every genre in the library is known.' / 'No genres yet.' / 'Nothing here yet.' = three different sentence forms; the first two are one sentence with no act (should offer New genre / Map); the third is Table's default and says nothing (preview.tsx `none` is never shown because the read has data). Also contradictory: 'Every genre ... known' over 'No genres yet.' (fixture). **app** |
| A-4d | no | 'Preview unify on the library' (tooltip) and 'Closest:' are product words; picker label 'Map Hous to a close genre' is OK. No click/dropdown words. Low. |
| A-5a | no | genres/data: no filled primary; the real primary 'Unify the library' is the green text act inside a green banner (x844-940,y614): accent is the banner's `done` green, not the one blue accent. **app/stack** |
| A-5b | n/a | no pills |
| A-5c | no | genres/data: the banner is the `done` tone (green fill, green check) for a not-yet-run change set: colour says 'finished' where the sentence says 'would change'. lib/preview.tsx:15-21 maps a done preview job to tone `done`. Use `active` or `attention`. **app** |
| A-6a | no | genres/data glyphs: music note = genre; circled ? = value not in the taxonomy; chevron = fold; X = remove alias; ... = more; the top-right Replace glyph (x1880,y21) = 'Preview unify' but the sidebar uses the same glyph for 'Aliases' (route.tsx:80). One glyph, two meanings. **app** |
| A-6b | no | genres/data: the fold chevrons at x935 (y319, y469) draw inside a filled 32 px box that looks pressed/hovered, while every other end act (X, more) is bare. Both rows, so it is the fold act's resting look, not hover. **stack** (Section row fold) |
| A-6c | no | see A-6b: a filled box that does nothing different from a bare icon act; and the picker 'Map Hous to a close genre' with a chevron reads as a field not an act. **stack** |
| A-7a | n/a | one pane |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | yes | sections 32 px apart (heading baselines y77, 271, 578), consistent |
| A-8a | n/a | state not shot; the frame's waiting form is shared (see library/loading shot) |
| A-8b | no | genres/empty: unknown and taxonomy sections shrink to sentence rows, but the Unify preview still shows '3 tracks would change.' over an empty table, so empty is not 'data minus rows'. Fixture, but also shows the preview ignores the empty taxonomy. **app/fixture** |
| A-8c | n/a | state not shot; the frame's failed and not-found forms are shared |
| A-8e | yes | dark reads drawn; banner fill is a soft green |
| A-8f | no | genres/data: green banner act 'Unify the library' (green on dark green fill) is the page's key act and the lowest-contrast text on the page; axe passed. Low-medium. **stack** (Banner quiet act ink) |
| A-9a | no | Beside the Linear grouped list: 1) the page asks for five steps in one column (unknowns, taxonomy, preview banner, preview table) with no band counts of what each step reaches; Linear shows the count in the band and one primary at the end; 2) the key act is a green link in a banner, not a filled primary (**stack**: Banner act; **app**: no Pane-level primary); 3) 956 px blank band and 50 px rows (**stack**) |
| B-1 | no | genres/data: sheets x244-964 = 720; blank x964-1920 = 956 px. **stack** (see Tags B-1) |
| B-2 | n/a | single pane |
| B-3 | n/a | no wide table on this screen |
| B-4 | yes | all sheets and headings at x244 |
| B-5 | yes | bar: title and one glyph, no overlap |
| B-6 | n/a | no chart |
| B-7 | yes | sidebar x0-220 = 220 px; its first row 'trackvault' on y=21, the same line as the bar title; no dock shown (nothing playing), no list reaches the foot. Sidebar below 'Downloads' is cut by the 800 px shot: could not check (the footer group). |
| C-1 | no | rows are 50 px (y155 / y205 / y319 / y369 pitch 50), pills none, picker 24 px high inside (x749-912,y155): row pitch 50, expected 32. **stack** (as Tags C-1) |
| C-2 | n/a | no definition list |
| C-3 | yes | meta under names, no pair |
| C-4 | no | see A-1d. **app** |
| C-5 | n/a | one pane |
| C-6 | yes | 13, 12, 12 upper: three sizes |
| D-1 | no | No filled act. Primary of the screen = 'Unify the library' (a banner link). The page's first act in the bar is the unlabelled Replace glyph that runs the preview. **app/stack** |
| D-2 | yes | Unify is `confirm`ed ('Unify the genres?', genres.tsx:244-249); Delete genre in more, confirm 'No track changes.' (genres.tsx:135-138) - good. But the confirm says 'Every change shown is written' while the table can show artist changes that this apply does not write (see E-1). **app** |
| D-3 | no | genres/data: the bar's only act is an icon whose tooltip is 'Preview unify on the library'; the whole flow (map values, then preview, then unify) starts from a glyph that looks like the Aliases sidebar glyph. Pickers are pressable but look like a text value. **app** |
| D-4 | yes | counts grouped (5,200; 1,900) |
| D-5 | no | genres/data banner: green check + 'would change' (a tone saying done for a pending change). The tone vocabulary says `done` = ok. **app** preview.tsx:15-21 |
| D-6 | no | 'Not in the taxonomy', 'Taxonomy', 'alias', 'Map', 'Unify', 'Closest' and on Aliases 'spellings to merge', 'Merge into', toast 'Spellings mapped'. One idea, five verbs. **app** |
| D-7 | no | see A-4c; 'Every genre in the library is known.' has no act; 'No genres yet.' has no 'New genre' button under it (the + is at the heading end only). **app** |
| D-8 | n/a | state not shot |
| D-9 | no | genres/data: the page is right in density but the unknown rows carry the most: picker plus 'Closest:' plus count. Ok. The alias rows carry too little: 'Alias' says nothing; no track count. **app** |
| E-1 | no | genres/data: from the shot the user learns 2 values are unknown, 5,200 + 1,900 tracks sit under two genres, 3 tracks would change. Missing: how many tracks each alias spelling reaches (alias rows say only 'Alias': genres.tsx:144) and that this preview is shared with the Aliases page (aliases/data shows the identical three rows). **app** |
| E-2 | no | Main task: take 'Hous' (14 tracks) to House and rewrite the library. Presses: pick (1) + choose option (2) [applies at once, no toast], then the Replace glyph (3) to run the preview, wait for the job, then 'Unify the library' (4), confirm (5), lands on /jobs. The preview is not re-run after mapping, so the shown 3 tracks can be stale; the glyph is the least discoverable step. Fix: run the preview automatically after a mapping, or make 'Preview unify' a labelled act under the banner. **app** |
| E-3 | no | After 'Unify the library' the act goes `to: /jobs` (genres.tsx:252): the user leaves the page and sees a flat list in which the new 'Unify tags' job stands among everything else; the result (batch in History) is never linked. Progress is visible only on /jobs. **app** |
| E-4 | no | Preview before: yes (banner + table, windowed). Undo after: only stated in the confirm text ('Undo the batch in History'), not offered at the moment; the Unify batch is labelled 'Unify tags' and its origin shows as 'Rules' in History (history.tsx:161, unify.ts:91). Mapping a genre (mapOne) and removing an alias or a genre are direct writes with no batch. The preview shows what changes but not which files get rewritten (tags in files). **app** |
| E-5 | no | Genres has no link to Aliases (the glyph at x1880 is Preview, not a link); the cleanup chain Genres, Aliases, History is not linked either way. **app** |
| E-6 | no | 50k tracks: 'Not in the taxonomy' is a plain Section: a library of real tags has hundreds of unknown values; no search, sort, or window; the preview is a window table (good). **app** |
| E-7 | no | Choice: which genre does 'Hous' map to. genres/data shows 'Closest: House, Deep House' with counts of the unknown (14 tracks) but not the size of each target (House 8,000?). 'Minimal / Deep Tech' (a genre containing a slash) next to comma-joined suggestions reads as two genres. The best match is not marked as recommended. **app** |
| E-8 | n/a | no failing operation drawn; a failed preview job writes its error into the banner (preview.tsx:29) - not shot |
| E-9 | no | no shortcuts shown; the picker per row is the only quick path. Low. **app** |
| E-10 | yes | sidebar 'Genres' = Pane title 'Genres'; Tags group has 3 places |
| F-1 | n/a | no player or waveform on this screen |
| F-2 | n/a | no Table |
| F-3 | n/a | no windowed table |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested place on this screen (sidebar's House folder is the shell's) |
| F-6 | no | Closest to the live preview intent: the Unify preview. It stands under the data, reads before and after per track, says how many tracks (banner) - but is not live: it needs the manual glyph. **app** |
| F-7 | n/a | no secret field |
| F-8 | no | Banner is the preview's result: tone wrong (done for pending), one sentence ok, act present. It stands with data and did not shift the page (log: no shift finding). **app** |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats cells |
| F-11 | n/a | no BarChart |
| F-12 | n/a | not a gate |
| G-1 | yes | title = sidebar label; `back={false}`; one action |
| G-2 | no | genres.tsx:212-216 description is two sentences; Taxonomy has no description; empties are one sentence without an act. Three sections stacked without a rhythm of what each is for. **app** |
| G-3 | no | genres/data: alias child rows carry no leading mark and a repeated meta 'Alias'; genre rows: music glyph, name, count; unknown rows: ? glyph. Child rows indent behind a rail (good). Meta 'Alias' repeats on every child (A-2b). **app** |
| G-4 | n/a | no pills |
| G-5 | n/a | no Toolbar (see E-6) |
| G-6 | n/a | forms only in sheets (Rename, New ...): not shot |
| G-7 | no | Banner: tone `done` for a not-yet-applied change (see A-5c); the act is quiet ink inside the banner and is the screen's primary. **app/stack** |
| G-8 | no | genres/data picker (row fit): its box reads the label 'Map Hous to a close genre' as the value; with no value it never shows the chosen genre, and it fires `mapOne` on change with no confirmation or toast. **app** |
| G-9 | n/a | not a gate |
| G-10 | n/a | no Card/Image/Text restyle in the source |

Top three:
1. The Unify preview is one shared `kind: 'unify'` read: the Genres page shows the artist change 'Sha & Tormar feat. Lio → Sha & Tormar · Artist' and counts it in '3 tracks would change', while its apply writes only genres (preview.tsx:75, genres.tsx:250); the confirm promises 'Every change shown is written'. The same three rows appear on Aliases (app).
2. The flow's key steps are a bare Replace glyph (run preview, same glyph as the Aliases sidebar place) and a green, done-toned banner link 'Unify the library' for a change that has not happened; the preview is not re-run after mapping so it can be stale (app; the quiet Banner act is a stack side).
3. Alias rows say only 'Alias': no count of tracks each spelling reaches, so the user cannot judge what a unify at 50k tracks touches before it runs (genres.tsx:141-150; app); mapping by picker applies at once with no toast.

## Aliases (/_app/aliases)
Shots read: /home/user/trackvault/apps/hub/shots/aliases/data-1920.png, aliases/empty-1920.png
Source read: /home/user/trackvault/apps/hub/src/app/routes/_app/aliases.tsx, lib/preview.tsx, worker/routes/taxonomy.ts
Machine findings (from the run log): none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | yes | aliases/data: bar; 4 sections (suggestions, aliases) x artist/label; Unify preview last: same order as genres' task |
| A-1b | yes | suggestion rows: merge glyph, name, spellings, check; alias rows: arrow glyph, name, 'is X', X. Slots consistent on this page; differs from genres' unknown rows (picker) for the same intent 'make two spellings one'. **app** |
| A-1c | n/a | no definition list |
| A-1d | no | aliases/data: 'ARTIST SPELLINGS TO MERGE 1' (count, no act), 'ARTIST ALIASES 1' (count + + act), 'UNIFY PREVIEW' (neither). Counts and acts differ by section; no descriptions on any, while Genres has one. **app** |
| A-2a | yes | no label without value |
| A-2b | no | aliases/data: the Artist and Label blocks show the same row twice ('Kalomi / KALOMI (12) · kalomi (3)' at y109 and y333; 'Sha and Tormar is Sha & Tormar' at y223 and y447) and the preview rows repeat Genres'. Fixture; but a real page repeats a section pair for two kinds that could be one list with a kind pick. **app** |
| A-2c | yes | counts 1/1/1/1 match rows; banner 3 = 3 rows |
| A-2d | yes | no reserved empty parts |
| A-3a | yes | nothing truncates |
| A-3b | yes | no short word truncates |
| A-3c | yes | name, one meta, one end act per row |
| A-4a | n/a | no section descriptions at all: the user is not told what 'spellings to merge' vs 'aliases' are. **app** |
| A-4b | no | 'Artist spellings to merge' is a phrase not a noun; 'Aliases', 'Merge', 'Map' (toast 'Spellings mapped', aliases.tsx:49) and 'Unify' name the same operation. **app** |
| A-4c | no | aliases/empty: four one-sentence empties ('No artist is spelled two ways.', 'No artist aliases yet.' ...) each a full 46 px sheet, no act under them; the preview 'Nothing here yet.' is Table's default. Four sheets of sentences for an empty page. **app** |
| A-4d | yes | no UI mechanics words |
| A-5a | no | as Genres: no filled primary; 'Unify the library' is a green banner link. **app/stack** |
| A-5b | n/a | no pills |
| A-5c | no | green `done` banner for a pending change (as Genres). **app** |
| A-6a | no | aliases/data: Merge glyph (leading) = a spelling group; check glyph at the end = Merge into X (a check usually means 'done/accept'); arrow = alias; X = remove; Replace glyph in the bar = Preview, same as the sidebar's Aliases glyph. Check for 'merge' is ambiguous. **app** |
| A-6b | yes | no chevron on rows that open; arrow glyph is leading decoration, not a link |
| A-6c | yes | nothing non-pressable looks pressable |
| A-7a | n/a | one pane |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | yes | sections 32 px apart |
| A-8a | n/a | state not shot; the frame's waiting form is shared (see library/loading shot) |
| A-8b | no | aliases/empty keeps headings and + acts, but 'Artist spellings to merge' loses its count and the preview again says '3 tracks would change.' above 'Nothing here yet.' (fixture + shared preview). **app/fixture** |
| A-8c | n/a | state not shot; the frame's failed and not-found forms are shared |
| A-8e | yes | dark reads drawn |
| A-8f | no | green banner act contrast as Genres A-8f. **stack** |
| A-9a | no | Beside the Linear grouped list: 1) five stacked one-row sections (y93-733) where Linear groups with bands inside one sheet; 2) no counts of tracks reached per merge (only per-spelling counts), no primary; 3) 956 px blank band, 50 px rows. **app/stack** |
| B-1 | no | aliases/data: sheets x244-964; blank 956 px right. **stack** |
| B-2 | n/a | single pane |
| B-3 | n/a | no wide table on this screen |
| B-4 | yes | x244 for all |
| B-5 | yes | no bar problem |
| B-6 | n/a | no chart |
| B-7 | yes | sidebar x0-220 = 220 px; its first row 'trackvault' on y=21, the same line as the bar title; no dock shown (nothing playing), no list reaches the foot. Sidebar below 'Downloads' is cut by the 800 px shot: could not check (the footer group). |
| C-1 | no | 50 px rows (y119, 233, 333, 447). **stack** (as Tags C-1) |
| C-2 | n/a | no definition list |
| C-3 | yes | no pair |
| C-4 | no | see A-1d. **app** |
| C-5 | n/a | one pane |
| C-6 | yes | three sizes |
| D-1 | no | Primary of the screen: merge the suggestions then 'Unify the library'; neither is a primary act. **app** |
| D-2 | no | aliases/data: the ✓ at x935,y119 writes mappings at once (aliases.tsx:38-49, no `confirm`); the X at x935,y233 removes an alias with no confirm, and neither is logged in History (taxonomy.ts remove). Both are cheap to undo by hand, but vision says previews and undo. Unify has a confirm (aliases.tsx:135-139). **app** |
| D-3 | no | check glyph = 'Merge into Kalomi' only in the tooltip; looks like 'approve'. **app** |
| D-4 | yes | counts grouped, in parentheses '(12)' |
| D-5 | no | banner tone `done` for pending (see Genres). **app** |
| D-6 | no | merge/map/alias/unify; 'spellings' (aliases) vs 'values' (genres). **app** |
| D-7 | no | see A-4c: none of the four empties offers an act ('Add a artist alias' lives on the heading glyph). **app** |
| D-8 | n/a | state not shot |
| D-9 | no | too sparse for the width and too long for scanning: five sheets for five rows. **app** |
| E-1 | no | aliases/data: shows what spellings exist; not why 'Kalomi' is canonical when the listed spellings are 'KALOMI (12)' and 'kalomi (3)', nor which tracks. The preview below is the same one as Genres (A-2b). **app** |
| E-2 | no | Main task: merge spellings then unify. ✓ (1) per row, glyph (2), unify (3), confirm (4): 4 presses, but the preview is a separate, manual step and is not refreshed after a merge. **app** |
| E-3 | no | As Genres E-3: act goes to /jobs; no running state on this page, no link to the batch. **app** |
| E-4 | no | Preview yes (shared, see Genres); undo only in prose; merge via ✓ and alias add/remove are direct, unlogged. **app** |
| E-5 | no | No link to Genres or History; artist aliases here and genre aliases on Genres are the same concept on two screens. **app** |
| E-6 | no | 50k tracks: artist spellings that differ by case could be hundreds; the Section has no window, search or 'merge all'. **app** |
| E-7 | no | Decision: which spelling is canonical. aliases/data shows the canonical as the row title but it is not among the listed variants (KALOMI, kalomi); there is no way to choose another winner except add an alias by hand. Counts per variant help ('(12)', '(3)'). **app** |
| E-8 | n/a | no failing operation drawn |
| E-9 | no | no shortcuts; no merge-all. **app** |
| E-10 | yes | sidebar 'Aliases' = Pane title; Replace icon doubles as the preview glyph |
| F-1 | n/a | no player or waveform on this screen |
| F-2 | n/a | no Table |
| F-3 | n/a | no windowed table |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested place on this screen (sidebar's House folder is the shell's) |
| F-6 | no | The unify preview stands under the lists with before and after per track and a count (banner), but is manual and shared with Genres. **app** |
| F-7 | n/a | no secret field |
| F-8 | no | Banner: tone wrong, one sentence, act present; did not shift. **app** |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats cells |
| F-11 | n/a | no BarChart |
| F-12 | n/a | not a gate |
| G-1 | yes | title = sidebar label, `back={false}`, one action |
| G-2 | no | four sibling sections with no description and no act in empty (V15). **app** |
| G-3 | yes | leading mark, name, meta, end act, no chevron |
| G-4 | n/a | no pills |
| G-5 | n/a | no Toolbar (see E-6) |
| G-6 | n/a | forms only in sheets (not shot); labels 'Spelling' / 'Name to use' (aliases.tsx:81-82) |
| G-7 | no | as Genres G-7. **app/stack** |
| G-8 | n/a | no control |
| G-9 | n/a | not a gate |
| G-10 | n/a | no Card/Image/Text restyle in the source |

Top three:
1. The preview under the aliases is the same shared read as Genres (identical three rows incl. a Genre change), and the merge check, alias add/remove and the unify act run with no refreshed preview (app: aliases.tsx:125, preview.tsx:75).
2. Five sibling sections with no description, four of them empty-with-no-act; Artist and Label are duplicated blocks instead of one list with a kind (app).
3. The merge act is a bare check glyph writing immediately, the canonical name is not among the shown spellings and cannot be chosen (aliases.tsx:38-49; app).

## History (/_app/history)
Shots read: /home/user/trackvault/apps/hub/shots/history/data-1920.png, history/empty-1920.png (empty is Table's generic sentence)
Source read: /home/user/trackvault/apps/hub/src/app/routes/_app/history.tsx, lib/changes.ts, worker/routes/history.ts, server/jobs/unify.ts
Machine findings (from the run log): none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | yes | history/data: bar then one Table sheet (no toolbar) |
| A-1b | no | history/data rows: name 'Edit tags', then meta '● Applied [● You] Changes 3', age '1 hr' at the end. The rows hold a state mark, a chip and a labelled count in the meta line: marks lead the line as V9 says, but the labelled number 'Changes 3' puts the column label before the figure; the Jobs rows put state first then detail. Orders match on the marks (state first) but History adds a chip, Jobs none. **app/stack** |
| A-1c | n/a | no definition list |
| A-1d | n/a | no section heading; the Table's `label` 'Batches' is not drawn |
| A-2a | yes | no label without value |
| A-2b | yes | history/data: no fact twice (origin in the chip, state as dot + word, count once) |
| A-2c | no | history/data: no count is drawn anywhere (no 'Batches 3', no total); 'Changes 3' counts fields, not tracks: a batch of 3 field writes could touch 1 track. The user cannot tell. **app** |
| A-2d | yes | no reserved empty parts |
| A-3a | yes | nothing truncates at 1920 |
| A-3b | yes | no short word truncates |
| A-3c | no | history/data: name + (state, chip, count) + age: three meta items on one line. V9 allows marks plus one meta. **stack/app** |
| A-4a | n/a | no description |
| A-4b | no | 'History' noun ok; row meta 'Changes 3' is a label then figure (read '3 changes'); batch labels 'Edit tags', 'Library scan', 'Cleanup rules' are the job names, not what happened. **app** |
| A-4c | no | history/empty: 'Nothing here yet.' is Table's default (history.tsx:217-226 passes no `empty`): says not what fills this place (every change to the library lands here, and can be undone) and offers no act. **app** |
| A-4d | yes | no UI mechanics words |
| A-5a | yes | no filled act; green dot only on state |
| A-5b | no | history/data: the origin chip 'You'/'Scan'/'Rules' is an outlined 20 px pill with a grey dot inside the compact form; the dot says nothing (family neutral). Reads as a button in a fact row (C6c). **app** (`family: neutral`, history.tsx:182) / **stack** (chip compact form) |
| A-5c | yes | no colour hierarchy; green/hollow dot is state |
| A-6a | yes | green dot + 'Applied'; hollow dot + 'Undone'; grey dot in the chip is decoration (word beside the dot each time) |
| A-6b | yes | history/data: rows open the batch (href) and draw no chevron; the open row carries the 3 px accent bar (history/$batchId left row, x246); no lock |
| A-6c | no | history/data the chips 'You', 'Scan', 'Rules' look pressable (bordered box in the row); they are not. **stack/app** |
| A-7a | yes | history/$batchId: both panes' first rows at y69; one grid |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | yes | one section per pane |
| A-8a | n/a | state not shot; the frame's waiting form is shared (see library/loading shot) |
| A-8b | no | history/empty: sheet with one sentence in place of rows; no band/toolbar to keep: ok. Same as data minus rows; but the sentence is not the empty form (V15, no act). **app** |
| A-8c | n/a | state not shot; the frame's failed and not-found forms are shared |
| A-8e | yes | dark reads drawn |
| A-8f | yes | meta 12 px readable; axe passed |
| A-9a | no | Beside Linear's list with bands (anchor row 1): 1) History is one flat list with no bands by day or origin and no counts (Linear groups with counts); 2) the row hides the information the decision needs (what changed: fields, tracks) behind the generic label 'Edit tags'; 3) a wide Table drawn as a 720 px list with no columns (**app**: missing `wide`, history.tsx:216) |
| B-1 | no | history/data: Table in a 720 px sheet (x244-964), 956 px blank. V17 'a list page is wide'; this is a Table, so `wide` is right and the app did not pass it (history.tsx:216). With `wide` the columns What/By/Changes/State/When draw as a real grid. **app** |
| B-2 | no | history/$batchId: left pane x220-740 (list 470), right pane x740-1920 with the sheet at x764-1484 (720): dead band x1484-1920 = 436 px; the panes read as list + record but the record's table is capped at the reading width. **app** (`wide` on the batch Pane) |
| B-3 | no | history/data: no horizontal scroller because the Table collapsed to list form (container under 765 px), so no wide table is drawn at all. **app** |
| B-4 | yes | x244 left list, x764 right sheet; consistent per pane |
| B-5 | yes | history/$batchId bar: title, undo glyph, close glyph; no wrap |
| B-6 | n/a | no chart |
| B-7 | yes | sidebar x0-220 = 220 px; its first row 'trackvault' on y=21, the same line as the bar title; no dock shown (nothing playing), no list reaches the foot. Sidebar below 'Downloads' is cut by the 800 px shot: could not check (the footer group). |
| C-1 | no | history/data rows pitch 52 px (y95, 147, 199) with a 20 px chip: 52 not 32 (two-line list form). **stack/app** |
| C-2 | n/a | no definition list |
| C-3 | yes | state dot, chip, 'Changes 3' share one baseline (y106) |
| C-4 | n/a | no section heading |
| C-5 | yes | history/$batchId: first rows y69 both panes |
| C-6 | yes | three sizes |
| D-1 | no | history/$batchId: Undo is the pane's only act, a bare Undo2 glyph (x1842,y21) beside Close; not filled, not worded. The screen's most common task (undo a batch) is an unlabelled icon; first fold in narrow bars. Acceptable by the roster (icon acts), but a destructive act next to Close is easy to hit. **app/stack** |
| D-2 | yes | Undo batch has `confirm` 'Undo this batch?' (history.$batchId.tsx:259-265), worded as what it does. Missing: count and what 'unless it has changed since' will skip (E-4). |
| D-3 | yes | Undo2 glyph: tooltip 'Undo batch' (history.$batchId.tsx:260) |
| D-4 | no | history/data: 'Changes 1880' has no thousands separator, while counts elsewhere group digits ('5,200 tracks' on genres, '18,400 of 50,000' on jobs). history.tsx:191 returns the raw number for `kind: 'number'`. **stack** (a number cell should format) / **app** |
| D-5 | yes | state has dot + word 'Applied'/'Undone'; the 'Undone' hollow dot is the `idle` tone (history.tsx:198) |
| D-6 | no | origin 'Rules' for a Unify batch (unify.ts:91 writes origin 'rule'); 'Changes' vs 'tracks' vs 'fields' across screens; 'Edit tags' covers any manual write. **app** |
| D-7 | no | see A-4c. **app** |
| D-8 | n/a | state not shot |
| D-9 | no | too little per row: the user cannot tell batches apart; 1 hr for every row in the fixture. **app** |
| E-1 | no | history/data: says three batches exist, one undone. Missing: which fields/tracks (label is the job name), exact time (only '1 hr'), total number of batches, a filter by origin. **app** |
| E-2 | no | Main task: find a change and undo it. Presses: open row (1), read the change table, Undo glyph (2), confirm (3). Finding it is the hard part: no search or filter by track/field/origin and no date, at 50k tracks and months of batches. **app** |
| E-3 | no | Undo goes `to: /jobs` (history.$batchId.tsx:268): the user leaves the batch and cannot see it become 'Undone' in the list without coming back; no running state on this screen. **app** |
| E-4 | no | Undo exists and is confirmed (good). Not shown at the moment of the original act (Edit tags toast / Tags delete); scan batches are not undoable (history.ts:57 `undoable: false`) yet the list marks them 'Applied' like the rest and the batch Pane always offers Undo (the action has no `blocked`): after confirming, the server answers 'A scan is not undone' (history.ts:187-192). The undone batch (Cleanup rules, 1880 changes) still offers Undo. **app** |
| E-5 | no | History is in System at the foot of the sidebar, far from Genres/Aliases/Cleanup rules whose confirms say 'Undo the batch in History'; no link from a finished unify/rules/organiser job to its batch; a change row does not link to its track (CHANGE_ROW has no href, changes.ts:63). **app** |
| E-6 | no | window table (good) but no search, filter or sort and no count; 1880-change batches and a 412-change scan list fine; a year of batches is a scroll. **app** |
| E-7 | no | Decision: undo this batch? Facts shown: before and after per field (good). Missing: which rows changed since (would be skipped), how many tracks, and by what rule. **app** |
| E-8 | n/a | no failing operation drawn |
| E-9 | no | no keyboard hint; the Table is a keyboard grid only when drawn as a grid (it is a list at 720). **app** |
| E-10 | no | sidebar 'History' = Pane title (yes) but in System, not with the cleanup chain (Curate/Tags). **app** |
| F-1 | n/a | no player or waveform on this screen |
| F-2 | no | history/data: Table not drawn as a table: no header row, no sort mark on 'When', no columns menu, no frozen leading column; it is the list form at a 720 px container (stack rule: under 765 px a row takes two lines). The opened row has the wash and 3 px bar (good, history/$batchId). The only frozen/sorted behaviour is lost. **app** (missing `wide`) |
| F-3 | no | history/data: windowed by `history.list.window({})` but the shot shows no total (no 'N batches') and the label 'Batches' is not drawn; cannot judge 'count shown is the total'. **app/stack** |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested place on this screen (sidebar's House folder is the shell's) |
| F-6 | n/a | no live-preview form |
| F-7 | n/a | no secret field |
| F-8 | n/a | no banner |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats cells |
| F-11 | n/a | no BarChart |
| F-12 | n/a | not a gate |
| G-1 | yes | title 'History' = sidebar label, `back={false}`; the batch Pane `back='/history'` draws Close, `noun='batch'` |
| G-2 | n/a | no Section |
| G-3 | no | history/data: row = name + marks (state dot+word, chip) + count on one meta line + age at the end: V9 puts marks on their own line and the count in the end group; here all share the meta line. **stack/app** |
| G-4 | no | history/data chips: neutral outlined 20 px with a grey dot ('You', 'Scan', 'Rules'); state pills are bare dots + words, not soft-filled pills. One meaning (who/what) per style: ok, but 'Applied' is a dot not a state pill. **stack** |
| G-5 | no | no Toolbar at all: no search/filter over a list that grows without bound. **app** |
| G-6 | n/a | forms only in sheets (Rename, New ...): not shot |
| G-7 | n/a | no banner |
| G-8 | n/a | no control |
| G-9 | n/a | not a gate |
| G-10 | n/a | no Card/Image/Text restyle in the source |

Top three:
1. Undo is offered where it cannot work and hidden where it matters: scan batches (`undoable: false`) and the already undone batch still show the Undo glyph, the server refuses after the confirm; and the list says 'Applied' for both (app: history.$batchId.tsx:257-269 needs `blocked`, history.tsx:195 a third state).
2. A Table in a 720 px list: no `wide`, so no header, sort, columns or 'When'; the user sees '1 hr' and 'Changes 3' and cannot tell which batch is which; labels are job names ('Edit tags', origin 'Rules' for Unify) (app: history.tsx:216, 161).
3. No way to find a batch at 50k scale: no search/filter by track, field, origin or date, no total, and a change row does not link to its track (app).

## One batch (/_app/history/$batchId)
Shots read: /home/user/trackvault/apps/hub/shots/history/$batchId/data-1920.png, history/$batchId/empty-1920.png
Source read: /home/user/trackvault/apps/hub/src/app/routes/_app/history.$batchId.tsx, lib/changes.ts, worker/routes/history.ts
Machine findings (from the run log): none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | no | history/$batchId data: bar (title 'Edit tags', undo, close) then the changes table directly. Record order (bar, kicker, name, pills, description, sections) is not followed: no facts (state, by, count, when) in the record at all. G1 `record` head unused (history.$batchId.tsx:252). **app** |
| A-1b | no | change rows: track name over 'before → after · Genre'; the field is last in the meta line and reads as a suffix to the value. Slot order differs from History's rows (name, marks, count). **stack** (change cell list form)/ **app** |
| A-1c | n/a | no definition list |
| A-1d | n/a | no section heading (Table label 'Changes' not drawn) |
| A-2a | yes | no label without value |
| A-2b | yes | no fact shown twice |
| A-2c | no | history/$batchId: no count drawn; left row says 'Changes 3', the right table shows 3 rows; the match cannot be seen (no 'Changes 3' over the table). **app** |
| A-2d | yes | no reserved parts |
| A-3a | yes | nothing truncates |
| A-3b | yes | no short word truncates |
| A-3c | yes | track name, one meta line |
| A-4a | n/a | no description |
| A-4b | no | Pane title is the batch's label 'Edit tags' only; 'Batch' is the noun in the not-found sentence, 'History' in the list. Title does not say which batch (no date). **app** |
| A-4c | no | history/$batchId/empty: right pane 'Nothing here yet.' (Table default) with the pane title 'Edit tags': a batch with zero change rows says nothing. Fixture, but the form is the same generic sentence. **app** |
| A-4d | yes | no mechanic words; confirm text is plain |
| A-5a | yes | no filled act |
| A-5b | n/a | no pills in this pane |
| A-5c | yes | no colour hierarchy (the `change` cell shows before → after in text) |
| A-6a | yes | → = becomes; Undo2 = undo; X = Close (a Pane's close) |
| A-6b | no | X in the bar = Close here, Remove on Genres and Aliases, Cancel on Jobs: one glyph, three meanings (all with tooltips). **stack/app** |
| A-6c | yes | nothing non-pressable looks pressable |
| A-7a | yes | first rows of both panes at y69 |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | yes | one section |
| A-8a | n/a | state not shot; the frame's waiting form is shared (see library/loading shot) |
| A-8b | no | history/$batchId/empty: both panes show only the sentence sheet; the bar keeps the undo act on an empty batch. Same shape as data minus rows. Undo on an empty batch is meaningless. **app** |
| A-8c | n/a | state not shot; the frame's failed and not-found forms are shared |
| A-8e | yes | dark reads drawn |
| A-8f | yes | axe passed; meta ink readable |
| A-9a | no | Beside Linear's record (anchor row 2: name, facts, description, sub-list, activity): 1) no record head: the batch has no name block, no facts (by You, 1 hr ago, 3 changes, Applied); 2) the sub-list has no header or count; 3) rows do not link to the tracks. **app** |
| B-1 | n/a | record pane, not a list page |
| B-2 | no | history/$batchId: list pane x220-740 (470), record sheet x764-1484, blank x1484-1920 (436 px): dead canvas; V17 says a record's parts stand within 720, so the cap itself is right but the changes table is a list, which V17 wants wide. **app/stack** |
| B-3 | n/a | no wide table on this screen |
| B-4 | yes | both panes inset 24 px |
| B-5 | yes | bar: title and two glyphs (x1842, x1880) no overlap |
| B-6 | n/a | no chart |
| B-7 | yes | sidebar x0-220 = 220 px; its first row 'trackvault' on y=21, the same line as the bar title; no dock shown (nothing playing), no list reaches the foot. Sidebar below 'Downloads' is cut by the 800 px shot: could not check (the footer group). |
| C-1 | no | change rows pitch 50 px (y95, 145, 195). **stack** |
| C-2 | n/a | no definition list |
| C-3 | yes | no pair |
| C-4 | n/a | no section heading |
| C-5 | yes | y69 both |
| C-6 | yes | three sizes |
| D-1 | no | Undo is the only act: a bare glyph beside Close (x1842 vs x1880, 38 px apart): a destructive-ish act next to a dismiss glyph. **app/stack** |
| D-2 | yes | `confirm`: 'Undo this batch?' + 'Each field goes back to what it was, unless it has changed since; files are tagged and moved back to match.' (history.$batchId.tsx:259-265): worded as what it does; lacks the count. |
| D-3 | yes | Undo2 and X have tooltips/names |
| D-4 | yes | no figures |
| D-5 | n/a | no status in this pane |
| D-6 | no | 'Undo batch' (tooltip), 'Undo this batch?', job 'Undo batch' (jobs.tsx:306) vs 'Undone' (list); 'batch' is a UI-internal word for a DJ; the list says 'Edit tags'. **app** |
| D-7 | no | see A-4c. **app** |
| D-8 | n/a | state not shot |
| D-9 | no | too little: no facts above the table. **app** |
| E-1 | no | history/$batchId: the pane says 'Edit tags' and three track rows with before → after. It does not say who/when/how many/Applied or Undone (those are only in the list row to its left, which folds away below the wide place). **app** |
| E-2 | no | Main task: confirm what happened, then undo. Undo = 2 presses (glyph, confirm); the evidence is good (before → after per track and field). **app** |
| E-3 | no | after confirm: 'Undoing the batch' and to /jobs (history.$batchId.tsx:267-268): leaves the page; no state change visible here; the batch only becomes 'Undone' in the list after the job. **app** |
| E-4 | no | see History E-4: Undo always offered, no `blocked` for `undoable: false` or already undone (history.ts:57, 187-192); no preview of which fields were edited since (the confirm warns 'unless it has changed since' but cannot show it). **app** |
| E-5 | no | change rows are not links to the track (changes.ts:63 `CHANGE_ROW` has no href); a user who sees 'Kalomi - Midnight Echo' cannot open it. **app** |
| E-6 | yes | changes is a window (`history.changes.window`), good for a 1,880-change batch |
| E-7 | no | see E-4: no side-by-side of current value vs the value undo would write. **app** |
| E-8 | n/a | no failing operation drawn; the server refusal ('A scan is not undone') would surface as a toast after confirm |
| E-9 | no | no shortcut; list is not a grid at 720. **app** |
| E-10 | no | History is under System. **app** |
| F-1 | n/a | no player or waveform on this screen |
| F-2 | no | history/$batchId: same as History F-2: changes Table drawn as a 720 px list, no header, no sort, no columns. **app** (`wide`) |
| F-3 | no | no total drawn above the window. **app** |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested place on this screen (sidebar's House folder is the shell's) |
| F-6 | n/a | no live-preview form |
| F-7 | n/a | no secret field |
| F-8 | n/a | no banner |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats cells |
| F-11 | n/a | no BarChart |
| F-12 | n/a | not a gate |
| G-1 | no | title = batch label ('Edit tags') not a name of a record; `record` head (bar slash + name + facts) unused; `back='/history'` draws Close (good); `noun='batch'` ok. **app** |
| G-2 | n/a | no Section |
| G-3 | yes | track name over before → after |
| G-4 | n/a | no pills |
| G-5 | n/a | none |
| G-6 | n/a | forms only in sheets (Rename, New ...): not shot |
| G-7 | n/a | no banner |
| G-8 | n/a | no control |
| G-9 | n/a | not a gate |
| G-10 | n/a | no Card/Image/Text restyle in the source |

Top three:
1. The batch has no head: no by, when, how many, applied or undone, though that is the evidence for 'undo with confidence'; they live only in the list row beside it (app: use Pane `record` facts, history.$batchId.tsx:252).
2. Undo is a bare glyph beside Close, always enabled; after the confirm the server may refuse (scan, already undone), and the confirm cannot say which fields changed since (app, history.ts:187).
3. Change rows cannot open their track and the table is a no-header 720 px list with the field as an afterthought ('Tech-House → Tech House · Genre') (app: `wide`, href; stack: change list form).

## Jobs (/_app/jobs)
Shots read: /home/user/trackvault/apps/hub/shots/jobs/data-1920.png, jobs/empty-1920.png
Source read: /home/user/trackvault/apps/hub/src/app/routes/_app/jobs.tsx, lib/live.ts, lib/jobs-effects.ts, routes/_app/route.tsx, fixtures.ts (JOBS), worker/routes/jobs.ts
Machine findings (from the run log): none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | yes | jobs/data: bar, one list sheet; no toolbar |
| A-1b | yes | every row: kind glyph, title, status mark+word + detail on the second line, age, cancel only while active: the same slots as History's state-first meta |
| A-1c | n/a | no definition list |
| A-1d | n/a | untitled list (jobs.tsx:363) |
| A-2a | yes | no label without value |
| A-2b | no | jobs/data 'Offsite upload' row: '412 of 3100 files · 21.4 GB left · 4.2 MB/s · 412 of 3,100': the done/total appears twice, once from the server's message (unformatted '3100') and once appended by `detail()` (jobs.tsx:336-338, formatted '3,100'). **app** |
| A-2c | yes | 18,400 of 50,000 matches the fixture; no band counts to check |
| A-2d | yes | no reserved empty parts (finished rows reserve no cancel) |
| A-3a | yes | nothing truncates |
| A-3b | yes | no short word truncates |
| A-3c | no | jobs/data offsite row: name + status + message + done/total + speed + age + cancel: dense. Others are fine. **app** |
| A-4a | n/a | no description |
| A-4b | no | kind titles: 'Library scan', 'Tag write', 'Offsite upload', 'Database backup' (nouns, ok) vs 'Edit tags', 'Quarantine', 'Restore', 'Undo batch' (verbs/imperatives) in KINDS (jobs.tsx:295-319); 'Fingerprints', 'Integrity check', 'Bitrate check' read as machine terms; 'Soulseek search'. **app** |
| A-4c | no | jobs/empty: 'No jobs yet. A scan of the library shows here while it runs.' two sentences (V15 one) and no act ('Scan the library' exists on the library only). **app** jobs.tsx:365-368 |
| A-4d | yes | no mechanic words |
| A-5a | yes | no filled act; accent only on running spinner (tone `running`), red dot on the failed row |
| A-5b | n/a | no pills |
| A-5c | yes | colour only on state dots |
| A-6a | yes | spinner = running (+ word 'Running'), green dot = Done, red dot = Failed (+ words); X = cancel (tooltip 'Cancel', jobs.tsx:356) |
| A-6b | yes | no chevron; no row opens (see E-2 for the absent detail page) |
| A-6c | yes | nothing non-pressable looks pressable |
| A-7a | n/a | one pane |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | yes | one list |
| A-8a | n/a | state not shot; the frame's waiting form is shared (see library/loading shot) |
| A-8b | no | jobs/empty: the bar stays; the list is one sentence sheet; no act. **app** |
| A-8c | n/a | state not shot; the frame's failed and not-found forms are shared |
| A-8e | yes | dark reads drawn |
| A-8f | yes | axe passed; meta ink readable |
| A-9a | no | Beside Linear's list with bands: 1) no bands: running, failed and finished jobs are one flat newest-first list (live.ts:137 sorts by createdAt: the 25-minute offsite upload sits under a finished 40-minute tag write); 2) a running row shows 'Running · Reading files · 18,400 of 50,000' as text only: no bar, no percent (37%), no ETA, where Linear shows progress as a ring; 3) 956 px blank band right of the sheet. **app** (1), **stack** (2: no progress mark on a row), **stack** (3) |
| B-1 | no | jobs/data: sheet x244-964; blank x964-1920 = 956 px; 5 rows. **stack** |
| B-2 | n/a | single pane |
| B-3 | n/a | no wide table on this screen |
| B-4 | yes | x244 |
| B-5 | yes | no bar problem |
| B-6 | n/a | no chart |
| B-7 | yes | sidebar x0-220 = 220 px; its first row 'trackvault' on y=21, the same line as the bar title; no dock shown (nothing playing), no list reaches the foot. Sidebar below 'Downloads' is cut by the 800 px shot: could not check (the footer group). |
| C-1 | no | rows pitch 50 px (y95..295). **stack** as Tags C-1 |
| C-2 | n/a | no definition list |
| C-3 | yes | spinner/dot, word and detail share one baseline (y105) |
| C-4 | n/a | no section heading |
| C-5 | n/a | one pane |
| C-6 | yes | three sizes |
| D-1 | no | no primary and no act to start anything; the only act is the row's X (cancel). The page is passive. Fine for a log, but the failed row (jobs/data, 'Library scan Failed') has no act either. **app** |
| D-2 | no | Cancel of a running 3,100-file offsite upload or the 50,000-file scan has no `confirm` (jobs.tsx:352-358) and the X is 32 px next to the age: a misclick cancels. Jobs are 'safe to run twice' (CLAUDE.md) so the cost is time. **app** |
| D-3 | yes | X has tooltip 'Cancel' |
| D-4 | no | jobs/data: '412 of 3100 files' vs '412 of 3,100' vs '18,400 of 50,000' vs history's 'Changes 1880' = four number formats; ages '2 min', '40 min', '5 hr' relative only (no absolute time or duration). **app/stack** |
| D-5 | yes | every state has a mark and a word (Running/Done/Failed); queued, cancelled would be Waiting/Idle |
| D-6 | no | 'Jobs' (place) vs 'Library scan' title vs the user's 'scan'; Genres confirm 'Unify the genres?' creates a job titled 'Unify tags'; 'Tag write' (writes tags into files) vs 'Edit tags'. **app** |
| D-7 | no | see A-4c. **app** |
| D-8 | n/a | state not shot |
| D-9 | no | history of 24 kinds in one list with no filter: scale problem (E-6); each row is fine. **app** |
| E-1 | no | jobs/data: it says what runs and has run and one failure reason. Missing: a 'Running 2 · Failed 1' summary at the top, and the library state. **app** |
| E-2 | no | Main task: see that my action is running and know when it finishes, or see why it failed. Landing here is 1 press from the sidebar or automatic (`to: '/jobs'` after acts). A failed row ends there: no retry, no link to Settings (where the library root lives). **app** |
| E-3 | no | Running: yes, live (spinner, word, 'Reading files · 18,400 of 50,000'). Finishing: row turns Done with a one-line result. Failing: red dot + reason. Not visible from other screens: the sidebar 'Jobs' place has no running count (route.tsx PLACES has no `count`), so a user who started a scan and went to Library sees nothing; the only cue is the `done` toast. Not progress-barred. **app** |
| E-4 | n/a | jobs do not move files themselves; the undo/preview story is on the History and preview screens |
| E-5 | no | jobs/data: no row leads to its result: 'Unify tags' done does not link to its History batch, 'Tag write 12 written' does not link to the tracks, a failed scan does not link to Settings. Chain stops here. **app** |
| E-6 | no | jobs/data: 50k scale = many jobs: unbounded list from `jobsLive` snapshot (live.ts:141), no window, no filter by state/kind, no clear, oldest never leave; running jobs can sink below finished ones. **app** |
| E-7 | n/a | no choice to make |
| E-8 | no | jobs/data: 'The library folder cannot be read: /music' is the one actionable reason on the page (says what and where, good). Missing the next step ('Check the folder in Settings, then scan again') and any retry. Other kinds show whatever string the job threw. **app** |
| E-9 | no | no shortcuts, no keyboard path to cancel. **app** |
| E-10 | no | sidebar 'Jobs' = Pane title; it sits last of System with History, Backups, Devices, Settings, below the fold at 800 px; running work has no badge. **app** |
| F-1 | n/a | no player or waveform on this screen |
| F-2 | n/a | no Table |
| F-3 | n/a | no windowed table |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested place on this screen (sidebar's House folder is the shell's) |
| F-6 | n/a | no live-preview form |
| F-7 | n/a | no secret field |
| F-8 | n/a | no banner on this page; a running job could be a `Banner` with progress per the roster, but the page uses rows |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats cells |
| F-11 | n/a | no BarChart |
| F-12 | n/a | not a gate |
| G-1 | yes | title 'Jobs' = sidebar label; `back={false}`; no actions |
| G-2 | no | jobs.tsx:365-368 `empty` sentence plus a second sentence, no act. **app** |
| G-3 | yes | type glyph, mono? title, status + detail meta, age then act at the end, no chevron; marks lead the meta line. Order matches V9 |
| G-4 | n/a | no pills |
| G-5 | n/a | no Toolbar (see E-6) |
| G-6 | n/a | forms only in sheets (Rename, New ...): not shot |
| G-7 | n/a | no banner |
| G-8 | n/a | no control |
| G-9 | n/a | not a gate |
| G-10 | n/a | no Card/Image/Text restyle in the source |

Top three:
1. Failure has a reason but no way out: the failed 'Library scan' says 'The library folder cannot be read: /music' with no retry, no link to Settings, and the router has only `jobs.cancel` (jobs.ts:42; app).
2. Progress is text: '18,400 of 50,000' with no bar, percent or ETA, the offsite row prints done/total twice in two formats, and the list is newest-created-first so a long-running job sinks (jobs.tsx:332-340, live.ts:137; app, stack for a row progress mark).
3. Nothing outside this page shows that a job runs: the sidebar 'Jobs' place has no count, results do not link to History or the tracks (route.tsx; app).

## Sign in (/sign-in)
Shots read: /home/user/trackvault/apps/hub/shots/sign-in/data-1920.png, sign-in/empty-1920.png (identical: a gate reads nothing)
Source read: /home/user/trackvault/apps/hub/src/app/routes/sign-in.tsx, lib/oauth.ts
Machine findings (from the run log): none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | yes | sign-in/data: lockup, title 'Sign in', passkey act, one Email field with Continue under it (Gate order) |
| A-1b | n/a | no rows (one form row 'Email') |
| A-1c | n/a | no definition list |
| A-1d | n/a | no sections |
| A-2a | yes | no label without value |
| A-2b | yes | no fact twice |
| A-2c | n/a | no counts |
| A-2d | yes | no reserved parts |
| A-3a | yes | nothing truncates |
| A-3b | yes | no short word truncates |
| A-3c | n/a | no list row |
| A-4a | n/a | Gate has no section |
| A-4b | yes | 'Sign in' is a verb as title (a Gate title is an action); sentence case |
| A-4c | n/a | no empty state: sign-in/empty equals data (same shot) |
| A-4d | no | sign-in/data 'Type a value' (x773,y469) over the disabled Continue is a UI mechanic and says nothing ('Enter your email'). Default blocked reason of the Form (stack) since the app sets none (sign-in.tsx:244-251). **stack** (default text) / **app** (set the field's description) |
| A-5a | no | sign-in/data: no filled primary: Continue renders grey (disabled until typed), so the page shows no accent act; accent appears only on the focused field's edge. Expected: one primary. It is the empty-form disabled state, not a defect of colour. **stack** (disabled primary looks like the ghost) |
| A-5b | n/a | no pills |
| A-5c | yes | no colour hierarchy |
| A-6a | yes | lockup mark = the product |
| A-6b | n/a | no chevrons |
| A-6c | no | sign-in/data 'Use a passkey' (x772-856,y370) is a quiet button with no edge: reads as a caption, not an act; Continue below is grey and edged, so the less important act looks more pressable. **stack** (quiet Button affordance) |
| A-7a | n/a | one pane |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | no | sign-in/data vertical rhythm: title y325, passkey y370 (45 px), form sheet y403-529: 33 px under the passkey, then the form's hint y469 and Continue y499: the passkey stands in the gap between title and form as a third element; spacing is even but the order is wrong (see G-9). **app** |
| A-8a | n/a | state not shot |
| A-8b | n/a | sign-in/empty = sign-in/data; gate reads little (stated) |
| A-8c | n/a | state not shot |
| A-8e | yes | dark reads drawn: slate-grey canvas (not pure black), lockup mark soft blue |
| A-8f | yes | axe passed; body copy meta ink 12-13 px readable |
| A-9a | no | Beside Linear's login (not pinned in voice.md; the nearest is Settings: a titled column): 1) Linear puts the one primary first and the alternatives under it; here the passkey alt is above the email field; 2) no sentence under the title saying what happens next (a code goes to the hub's log); 3) disabled Continue is grey with a 'Type a value' hint, no focus on the primary. **app/stack** |
| B-1 | n/a | not a list page |
| B-2 | n/a | gate |
| B-3 | n/a | no table |
| B-4 | yes | mark, title, body and field/acts share one left edge x760 |
| B-5 | yes | no bar |
| B-6 | n/a | no chart |
| B-7 | n/a | Gate has no sidebar or dock |
| C-1 | yes | Email field 32 px (y410-440), Continue 32 px (y484-516) |
| C-2 | yes | one label 'Email' |
| C-3 | n/a | none |
| C-4 | n/a | none |
| C-5 | n/a | one column |
| C-6 | yes | three sizes: 20 title, 13 body, 12 meta |
| D-1 | no | Primary act: Continue (email step). Right in principle but it is the grey disabled ghost, the passkey sits first. The most common path for this owner (email code, vision: any PC) is the second act. **app** |
| D-2 | n/a | no destructive act |
| D-3 | no | 'Use a passkey' is pressable and looks like a label (A-6c). **stack** |
| D-4 | n/a | no figures |
| D-5 | n/a | no status |
| D-6 | no | 'Sign in', 'Email', 'Continue' fine; the next step (sign-in.tsx:222) reads 'The code was written to the hub's log for <email>': 'log' is jargon and the Email step promises nothing about it, so a user waits for mail that will never come. **app** |
| D-7 | n/a | no empty state; first run is the Gate itself |
| D-8 | n/a | state not shot |
| D-9 | yes | right amount: one field, one act, one alternative; the 1920 canvas holds a 400 px column |
| E-1 | no | sign-in/data: says 'Sign in' and an Email field. It does not say that no email is sent, that the code is in the hub's log, or that the owner is alone (vision: one owner). **app** |
| E-2 | no | Main task: sign in with a code: Email, Continue (type email, Enter: 2), Code step, Verify (3). The code lives in the hub's log (sign-in.tsx:222): the owner opens a terminal or docker log (not from a phone or a second PC). No 'send me the code another way'. Passkey is the fast path but is offered before enrolment. **app** |
| E-3 | n/a | no job |
| E-4 | n/a | no bulk act |
| E-5 | no | MCP sign-in resumes the consent flow (`oauthQuery`, sign-in.tsx:227,230): the page does not say it will return to the client's connection; the gate looks identical for a plain sign-in and a connecting-client sign-in. **app** |
| E-6 | n/a | no scale |
| E-7 | n/a | no choice |
| E-8 | no | A failed passkey throws 'That passkey did not work' (sign-in.tsx:211) and a wrong code the form's error: not shot; a user without an enrolled passkey gets an error from the first act on the page. **app** |
| E-9 | yes | the Email field has focus on load (accent ring at x822-1147,y409-440): Enter submits |
| E-10 | n/a | gate has no sidebar |
| F-1 | n/a | no player |
| F-2 | n/a | no Table |
| F-3 | n/a | no window |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested places |
| F-6 | n/a | no live preview |
| F-7 | n/a | no secret field |
| F-8 | n/a | no banner |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats |
| F-11 | n/a | no chart |
| F-12 | n/a | sign-in is not one of connect.consent/connect.organization/devices |
| G-1 | n/a | not a Pane |
| G-2 | n/a | no Section |
| G-3 | n/a | no rows |
| G-4 | n/a | no pills |
| G-5 | n/a | no Toolbar |
| G-6 | yes | Form 'Email' label left in its column, no bar; submit is the Form's own act; single field so no `optional` mark |
| G-7 | n/a | no banner |
| G-8 | yes | Email is a Form field (label inside its row, not a hand label) |
| G-9 | no | sign-in/data: the Gate has no body prose; the passkey act is a child that Gate draws before the form (above the field), and Continue sits inside the form sheet: acts are split above and below the field, the primary is second, nothing under the body in one line. Mark: lockup ok. The consent page does it right (`acts` under the description). Fix: give the Gate no children, pass the passkey as `acts`, or hide it until a passkey is enrolled. **app** (sign-in.tsx:253) |
| G-10 | n/a | no Card/Image |

Top three:
1. Acts are split around the field: 'Use a passkey' (a borderless, label-looking quiet button) above Email and a grey disabled Continue below, so the page has no clear primary and the passkey comes first even for an owner who never enrolled one (sign-in.tsx:253, G9; app, quiet Button look stack).
2. The email step promises a mail that never comes: the code is written to the hub's log, said only after Continue, in the word 'log' (sign-in.tsx:222; app).
3. The disabled-form hint reads 'Type a value' (stack Form blocked reason) in place of 'Enter your email'.

## Connect a client (/connect/consent)
Shots read: /home/user/trackvault/apps/hub/shots/connect/consent/data-1920.png, connect/consent/empty-1920.png (identical)
Source read: /home/user/trackvault/apps/hub/src/app/routes/connect.consent.tsx, lib/oauth.ts, worker/mcp.ts:9
Machine findings (from the run log): none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | no | connect/consent data: lockup, title 'Connect a client', a 3-line paragraph, then the 'Client Claude https://claude.ai' sheet, then Allow/Decline. 'It' in the paragraph has no antecedent until the sheet below it; who asks should come before what it may do. connect.consent.tsx:287,295. **app** |
| A-1b | yes | one row: label 'Client' in its column, name, URL meta (V9 fact row) |
| A-1c | yes | value starts at the value column x826 |
| A-1d | n/a | no section heading |
| A-2a | yes | no label without value |
| A-2b | yes | no fact twice |
| A-2c | n/a | no counts |
| A-2d | yes | no reserved parts |
| A-3a | yes | nothing truncates |
| A-3b | yes | no short word truncates |
| A-3c | yes | label, name, one meta |
| A-4a | no | Gate description 'It can search your library, read tracks, playlists and stats, build playlists, and queue auto-tag, analysis and cover jobs. It cannot edit tags or delete files.' is two sentences of 25 and 7 words, wrapping to 3 lines: help text not a one-line purpose. Accurate against mcp.ts:9 but 'cover jobs', 'auto-tag' are internal terms. **app** |
| A-4b | no | 'Connect a client': 'client' is jargon for an owner, who thinks 'Claude'; 'Allow' is generic. Organization page says 'Deny' while this says 'Decline'. **app** |
| A-4c | n/a | no empty state (consent/empty = data) |
| A-4d | yes | no UI mechanic words |
| A-5a | yes | one filled primary 'Allow' (accent), 'Decline' quiet |
| A-5b | n/a | no pills |
| A-5c | yes | no colour hierarchy |
| A-6a | yes | lockup mark = product |
| A-6b | n/a | no chevrons |
| A-6c | yes | the client sheet is a non-pressable row and does not look pressable |
| A-7a | n/a | one pane |
| A-7b | yes | one label |
| A-7c | n/a | no text area |
| A-7d | yes | description y365-401, sheet y427-477, acts y494-526: even gaps |
| A-8a | n/a | state not shot |
| A-8b | n/a | consent/empty = data |
| A-8c | n/a | state not shot |
| A-8e | yes | dark reads drawn: slate-grey canvas (not pure black), lockup mark soft blue |
| A-8f | yes | axe passed; body copy meta ink 12-13 px readable |
| A-9a | no | Beside a Linear permission dialog: 1) the permissions are one sentence of prose, not a list of rows of what is read vs what is written; 2) the client's name and URL come after the claim; 3) no statement of how long the grant lasts or where to revoke it (Settings devices lists grants). **app** |
| B-1 | n/a | not a list page |
| B-2 | n/a | gate |
| B-3 | n/a | no table |
| B-4 | yes | mark, title, body and field/acts share one left edge x760 |
| B-5 | yes | no bar |
| B-6 | n/a | no chart |
| B-7 | n/a | Gate has no sidebar or dock |
| C-1 | yes | Allow 32 px (y494-526) |
| C-2 | yes | one label |
| C-3 | n/a | none |
| C-4 | n/a | none |
| C-5 | n/a | one column |
| C-6 | yes | three sizes: 20 title, 13 body, 12 meta |
| D-1 | yes | Allow is the one primary and the page's task. Allow first, Decline second. |
| D-2 | no | Allow grants an outside program access to the library on one press with no confirm and 'Allow' alone does not name the client ('Allow Claude'); it is reversible (revoke grant). **app** |
| D-3 | yes | both acts are labelled buttons |
| D-4 | n/a | no figures |
| D-5 | n/a | no status |
| D-6 | no | 'client', 'auto-tag', 'cover jobs', 'Allow/Decline' here vs 'Deny' on the previous step; organisation page 'organization' vs a DJ's 'library'. **app** |
| D-7 | n/a | no empty state |
| D-8 | n/a | state not shot |
| D-9 | yes | a single column of 400 px at the centre of 1920: right amount |
| E-1 | no | connect/consent data: says an unnamed 'it' may do things, then 'Client Claude / https://claude.ai'. Good: the URL lets the owner check the client. Missing: that the grant stays until revoked and where. **app** |
| E-2 | yes | Main task: Allow or Decline: 1 press, both visible, no scroll |
| E-3 | n/a | no job |
| E-4 | no | no preview/undo language; the copy states what it cannot do (edit tags, delete files) which is the useful safety; revoke path is not stated. **app** |
| E-5 | no | Step 2 of the flow (organization is step 1 per the source comment, connect.organization.tsx:321) but no step mark and no 'back' to change the organization. **app** |
| E-6 | n/a | no scale |
| E-7 | no | Decision: allow this client. Facts: name and URL (shown), capabilities (prose). Missing: write scope as a list (build playlists = writes), the organization chosen in step 1. **app** |
| E-8 | n/a | no failing operation drawn |
| E-9 | no | no focus shown on Allow on load (no ring in the shot): Enter does not confirm; Tab order unknown. Could not check. **app** |
| E-10 | n/a | gate |
| F-1 | n/a | no player |
| F-2 | n/a | no Table |
| F-3 | n/a | no window |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested places |
| F-6 | n/a | no live preview |
| F-7 | n/a | no secret field |
| F-8 | n/a | no banner |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats |
| F-11 | n/a | no chart |
| F-12 | no | Gate form: acts under the body (yes), primary first (yes), the mark (yes). Not met: the body states capabilities in prose before naming who asks; the 'Client' row is a Section inside the Gate (fine). **app** |
| G-1 | n/a | not a Pane |
| G-2 | yes | one fact Section with a single item, no title |
| G-3 | yes | label column, name, URL meta; no chevron |
| G-4 | n/a | no pills |
| G-5 | n/a | no Toolbar |
| G-6 | n/a | no Form |
| G-7 | n/a | no banner |
| G-8 | n/a | no control |
| G-9 | yes | body prose, acts in one line under it (Allow, Decline), primary first, lockup mark: connect/consent/data |
| G-10 | n/a | no Card/Image |

Top three:
1. The page says what 'it' may do before saying who asks: three lines of prose about an unnamed 'it', the Claude row after it (connect.consent.tsx:287-305; app). Put the client in the title ('Allow Claude to use your library?').
2. No term or way out: how long the grant lasts and where to revoke it are not said; Allow is generic and has no confirm (app).
3. Copy is internal ('client', 'auto-tag', 'cover jobs') and the sister page says 'Deny' where this says 'Decline' (app).

## Choose an organization (/connect/organization)
Shots read: /home/user/trackvault/apps/hub/shots/connect/organization/data-1920.png, connect/organization/empty-1920.png (identical)
Source read: /home/user/trackvault/apps/hub/src/app/routes/connect.organization.tsx, lib/oauth.ts
Machine findings (from the run log): none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app/stack) |
| --- | --- | --- |
| A-1a | yes | connect/organization data: lockup, title, one sentence, a one-row sheet 'Studio →', quiet 'Deny' |
| A-1b | no | row: building glyph, 'Studio', arrow at the end: only the arrow is the act (connect.organization.tsx:355-363); the bordered row looks like a pressable choice, with no hint the whole row works. Could not check press area. **app/stack** |
| A-1c | n/a | no definition list |
| A-1d | n/a | no section heading |
| A-2a | yes | no label without value |
| A-2b | yes | no fact twice |
| A-2c | n/a | no counts |
| A-2d | yes | no reserved parts |
| A-3a | yes | nothing truncates |
| A-3b | yes | no short word truncates |
| A-3c | yes | glyph, name, act |
| A-4a | no | 'The client will work in the library of the one you choose.' - 'the one you choose' is awkward and 'the client' is not named (the consent step names it later). One sentence, but not for the owner's words. **app** |
| A-4b | no | 'Choose an organization': the product is single-owner (vision: not multi-tenant); the only choice is 'Studio'. 'organization' is auth-plugin vocabulary, not a DJ's. 'Deny' vs 'Decline' on the next page. **app/stack** |
| A-4c | no | empty sentence 'You belong to no organization.' (connect.organization.tsx:368) is an error dead end with no act; shot (empty) = data, so not reached. Could not check. **app** |
| A-4d | yes | no mechanic words |
| A-5a | no | no filled act: the page has two quiet acts (the row arrow, 'Deny'); the single useful move is an arrow icon. Gate expects a primary first. **app** |
| A-5b | n/a | no pills |
| A-5c | yes | no colour hierarchy |
| A-6a | yes | building glyph = organization; arrow = go on (leads elsewhere) |
| A-6b | yes | arrow = leads elsewhere, no chevron |
| A-6c | no | the whole row is bordered like a button but only the arrow act is wired; 'Deny' is borderless (reads as a label). **stack** (Section row with an act inside a Gate) |
| A-7a | n/a | one pane |
| A-7b | n/a | no definition list |
| A-7c | n/a | no text area |
| A-7d | yes | gaps even (y392, y417-450, y483) |
| A-8a | n/a | state not shot |
| A-8b | n/a | organization/empty = data |
| A-8c | n/a | state not shot |
| A-8e | yes | dark reads drawn: slate-grey canvas (not pure black), lockup mark soft blue |
| A-8f | yes | axe passed; body copy meta ink 12-13 px readable |
| A-9a | no | Beside a Linear workspace picker: 1) it is a mandatory step for an owner with exactly one organization ('always asked, the active one too', connect.organization.tsx:322); 2) the quiet 'Deny' sits 33 px under the list: a user who deny-clicks leaves the whole flow with no confirmation; 3) no step mark. **stack** (plugin-auth forces the step) / **app** (could auto-continue with one org) |
| B-1 | n/a | not a list page |
| B-2 | n/a | gate |
| B-3 | n/a | no table |
| B-4 | yes | mark, title, body and field/acts share one left edge x760 |
| B-5 | yes | no bar |
| B-6 | n/a | no chart |
| B-7 | n/a | Gate has no sidebar or dock |
| C-1 | yes | connect/organization: the Studio row y417-450 = 33 px, controls at the control height |
| C-2 | n/a | no definition list |
| C-3 | n/a | none |
| C-4 | n/a | none |
| C-5 | n/a | one column |
| C-6 | yes | three sizes: 20 title, 13 body, 12 meta |
| D-1 | no | No primary: the one choice ('Studio') is a bordered row with an arrow glyph, 'Deny' a quiet text. For a single organization the primary should be 'Continue with Studio'. **app** |
| D-2 | no | 'Deny' ends the authorization with one press, no confirm; it is also the only labelled act on the page. Not destructive of data. **app** |
| D-3 | no | the row's arrow has tooltip 'Use Studio' (source :357); the row itself does not read as the act. **app/stack** |
| D-4 | n/a | no figures |
| D-5 | n/a | no status |
| D-6 | no | 'organization' vs the product's 'library' (the sentence says both); 'Deny' vs 'Decline' (consent.tsx:291). **app** |
| D-7 | no | 'You belong to no organization.': dead end with no act (connect.organization.tsx:368). **app** |
| D-8 | n/a | state not shot |
| D-9 | no | too little for a step that has one option: 3 pieces of content on a full screen. **app** |
| E-1 | no | connect/organization data: nothing names the client asking; the user only sees 'The client will work in the library...'. **app** |
| E-2 | no | Main task: pick the organization (1 press on the arrow, row not confirmed to be wholly pressable) then land on consent. With one organization this is a pure click-through. **app** |
| E-3 | n/a | no job |
| E-4 | n/a | no bulk act |
| E-5 | no | No step 1 of 2, no Back; flows to consent. **app** |
| E-6 | n/a | no scale |
| E-7 | no | Decision with no facts: only the name 'Studio'; no library size or role. **app** |
| E-8 | no | empty form ('You belong to no organization.') leaves the user nowhere (no Deny shown differently, no create act). Could not check (not shot). **app** |
| E-9 | no | no focus ring on first load; Enter does nothing visible. Could not check. **app** |
| E-10 | n/a | gate |
| F-1 | n/a | no player |
| F-2 | n/a | no Table |
| F-3 | n/a | no window |
| F-4 | n/a | no drag |
| F-5 | n/a | no nested places |
| F-6 | n/a | no live preview |
| F-7 | n/a | no secret field |
| F-8 | n/a | no banner |
| F-9 | n/a | state not shot |
| F-10 | n/a | no stats |
| F-11 | n/a | no chart |
| F-12 | no | Gate: body (one sentence) yes; acts under it: the choice is in the list sheet and 'Deny' under it; primary first: there is no primary, the arrow row stands first; mark yes. **app** |
| G-1 | n/a | not a Pane |
| G-2 | yes | one Section of rows without title; `empty` has a sentence, no act (see D-7) |
| G-3 | yes | leading glyph, title, end act; no chevron |
| G-4 | n/a | no pills |
| G-5 | n/a | no Toolbar |
| G-6 | n/a | no Form |
| G-7 | n/a | no banner |
| G-8 | n/a | no control |
| G-9 | no | connect/organization: body prose yes, mark yes; the acts are the list row and a quiet 'Deny' under it, no filled primary first, no `step`. The stack Gate offers `step` (rules.md 'a Gate's step') and the page does not use it. **app** |
| G-10 | n/a | no Card/Image |

Top three:
1. A mandatory step for a single-owner product with one choice ('Studio'), worded in auth's 'organization' not a DJ's 'library'; no primary 'Continue' (connect.organization.tsx:322-370; stack forces the ask, app could skip with one organization).
2. Nothing names the client asking, no step mark though it is step 1 of 2 (the Gate's `step` is unused) and 'Deny' differs from consent's 'Decline' (app).
3. The bordered row reads as a button while only its arrow glyph is the act, and 'Deny' is a borderless label (stack row/quiet look; app).

## Across the group

- Inconsistencies between the group's screens (C1b, G4, D6):
  - The Unify preview is one read (`previews.latest({ kind: 'unify' })`, lib/preview.tsx:75) drawn on both Genres and Aliases: genres/data-1920.png and aliases/data-1920.png show the identical three rows, one of them an Artist change on the Genres page. Each page applies only its own fields (genres.tsx:250 `['genre']`, aliases.tsx:140 `['artist','label']`), so 'Every change shown is written' (both confirms) is false on both.
  - One idea, five verbs: Genres 'Map ... to a close genre' / 'Add an alias'; Aliases 'Merge into' with toast 'Spellings mapped'; both banners 'Unify the library'; job title 'Unify tags'; History origin 'Rules' for that same batch (unify.ts:91, history.tsx:161). The glossary needs one verb.
  - The Replace glyph is the Aliases place in the sidebar (route.tsx:80) and the 'Preview unify' act in the bar of Genres and Aliases (genres.tsx:205, aliases.tsx:95); the X glyph is Close (history/$batchId), Remove (genres, aliases) and Cancel (jobs).
  - Numbers: '1880' (history/data), '5,200' (genres/data), '18,400 of 50,000' and '412 of 3100 files ... 412 of 3,100' (jobs/data): four formats.
  - Empty states: Tags 'No custom tags yet. Make one, then put it on tracks.' (two sentences), Genres 'Every genre in the library is known.', History and the preview table 'Nothing here yet.' (stack default), Jobs 'No jobs yet. A scan of the library shows here while it runs.' (two sentences): no screen has the sentence over an outlined act (V15).
  - Gate verbs: 'Decline' (connect/consent) vs 'Deny' (connect/organization).
  - Section headings: Genres 'NOT IN THE TAXONOMY 2' (count + description), 'TAXONOMY 2' (count + act), 'UNIFY PREVIEW' (none); Aliases counts on four, no description anywhere.
- Stack findings (roster defects, one line each):
  - Pane reading cap vs V17 'a list page is wide': every Section list of this group stops at 720 px and leaves 956 px blank (tags, genres, aliases, jobs, history/data-1920.png); `wide` exists only for Table-like content. Either V17 or the cap should change (a list sheet at `wide` over 1676 px is also wrong), so state a third form: a list page keeps a sheet and puts a side panel or summary in the band.
  - Row pitch is 50 px for every Section row with a meta line (all list shots) while voice.md 9 says meta on the same line and 32 px rows; structure.md 21 says title over meta. The stack pages disagree; the render follows 21.
  - Banner act (quiet ink inside a tinted banner) is the screen's primary on Genres and Aliases and reads as the weakest text of the page (genres/data-1920.png 'Unify the library', green on dark green).
  - Section row fold act draws inside a filled 32 px box at rest (genres/data-1920.png, both chevrons at x935), unlike every other end act.
  - No row progress mark: a running Job row can only print numbers (jobs/data-1920.png); `Banner until` covers a deadline, not a fraction.
  - Table `number` cell prints a raw number ('Changes 1880' in the list form), age shows relative only ('1 hr' on all three rows), the origin chip in the compact form reads as a button (history/data-1920.png).
  - Quiet Button without an edge reads as a caption (sign-in/data-1920.png 'Use a passkey'; connect/organization 'Deny') while the grey disabled primary under it is the edged one; the form's disabled hint is the generic 'Type a value'.
  - A Table in a container under 765 px draws as a list with no header, so a `wide`-less History loses its columns (history/data-1920.png): the stack's fallback is silent.
- UX: the group's flow (E5) as the user walks it:
  1. Genres: the user sees 'Hous' (14 tracks), picks House from a row picker (applies at once, no toast), then has to find the unlabelled Replace glyph to run a preview that is not refreshed after the mapping, wait, read a green 'would change' banner, press 'Unify the library', confirm, and is thrown to /jobs.
  2. Jobs: a 'Unify tags' job runs as text; when done, nothing links to its result. The user must remember 'Undo the batch in History' (from the confirm) and go to System > History (far from Tags and Curate).
  3. History: three batches named by job ('Edit tags', 'Unify tags' shown as origin 'Rules'), relative age only, no filter, no track link. Open one: before and after per track is good, Undo is a glyph beside Close; for a scan or an already undone batch it is offered then refused after the confirm.
  4. Back on Jobs the undo is one more flat row. Failure on any job ends with a reason and no retry.
  The gates are the cleanest: consent follows G9 but names the client after the claim; sign-in splits its acts around the field and says nothing about the code living in the hub's log; the organization step is a click-through with one choice.
