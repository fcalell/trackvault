# Acquisition (search, downloads, wishlist, import, inbox)

Global notes. Only 1920 dark was shot: items about 320, touch, light mode are n/a (not shot). Loading, error and not-found were not shot for these screens: C8a/C8c/D8/F9/F10 are "n/a (state not shot)" throughout; the one source-level remark on states is in D7. Fixture caveats (judge layout, not data): search/data equals search/empty (no search id, so the candidate Table was never drawn: the screen's decision step is unshot there; it is judged from wishlist/$wantId's Candidates and from source); import/$importId says 40 tracks and 24+13+3 but draws 3 rows; inbox/$itemId highlights row 3 (Sha & Tormar) while the record is Kalomi, whose pill reads "Needs you" while its row reads "Ready".

Shared cause of B1/C-rows/3c (affects every list page here): no Pane in `src/app/routes/**` sets `wide` (grep "wide" gives nothing). Pane's body is `*:max-w-reading` (pane/index.tsx:80), so every Table is capped at 720 px, which is below the Table's `tablet` width, so it draws its two-line row form, not its grid. At 1920 the Wishlist (8 columns), Inbox (10), Candidates (9) and Import tables are never tables: all columns collapse into one meta line and the content stops at x=964, leaving a blank band 956 px wide (56 percent of the 1700 px canvas). V17: "a list page is `wide`". Fix is app (`wide` on those Panes), plus a stack doc fix (Pane `wide` prop doc says only "a Canvas, a code Diff").

## Search (/_app/search)
Shots read: search/data-1920.png, search/empty-1920.png (identical)
Source read: routes/_app/search.tsx, lib/candidates.tsx, ui/acquire.ts
Machine findings (from the run log): none (passed)

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | data: bar "Search", section FIND A TRACK, form |
| A-1b | n/a (no rows shot) | Candidates not shot; wishlist/$wantId shows the same Table in row form: "Score 95 · MP3 320 · dj_wax · free slot ..." (score first, name lacks a leading mark, unlike downloads which has a Download mark) |
| A-1c | n/a (no definition list) | |
| A-1d | no | "FIND A TRACK" description "Artist - Title (Mix) works best; a few words do too." is two clauses of advice, not what the section is for; fix: "Search Soulseek for a track." app |
| A-2a/2b | yes / yes | no empty facts, nothing doubled |
| A-2c | n/a (no counts) | |
| A-2d | yes | form row has no dead part |
| A-3a/3b/3c | n/a (no rows) / yes / n/a | |
| A-4a | no | the description above is help (4a) |
| A-4b | yes | "Search Soulseek", "What to find" |
| A-4c | n/a | no list; before a search the page is just the form, no empty sentence |
| A-4d | no | "Type a value" beside the submit (search/data-1920.png at 790,185) names the form's mechanic, and the submit looks disabled for no stated reason; fix: drop the hint, keep the submit enabled and let the field validate. app (hint is the Form's blocked text: stack could say "Say what to find") |
| A-5a | yes | no filled act (the submit is the screen's one act and is not drawn as the primary: it is a grey fill, see D1) |
| A-5b/5c | n/a | |
| A-6a/6b/6c | yes | no marks; the grey submit is a control |
| A-7a | n/a | one pane |
| A-7b | n/a | |
| A-7c | yes | field is one line |
| A-7d | yes | |
| A-8a | n/a (state not shot) | |
| A-8b | no | empty shot is the data shot: there is no empty-results form to judge; the page shows a lone form in 80 percent blank canvas (see D9) |
| A-8c | n/a (state not shot) | |
| A-8e | yes | slate sidebar, soft dark |
| A-8f | no | description and "Type a value" in the faint ink at 12 px read dim (search/data-1920.png 244,96 and 755,185); stack |
| A-9a | n/a (Linear has no comparable screen) | closest: a search form with the results already below; here the results region is missing |
| B-1 | no | form stops at x=964, 956 px blank at its right (see shared cause); app: `wide` |
| B-2 | n/a | no record |
| B-3 | n/a | |
| B-4 | yes | one left edge x=244 |
| B-5 | yes | |
| B-6 | n/a | |
| B-7 | yes | sidebar 220, first row on the bar's line; the dock was not on this shot |
| C-1 | yes | form rows 32 |
| C-2 | n/a | |
| C-3 | n/a | |
| C-4 | yes | uppercase 12 label, description under it |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | no | the screen's one task is "Search Soulseek", drawn as a grey neutral button (search/data-1920.png 889,184), never the filled primary (V5: the primary is the one act of the bar). Likely Form drawing a blocked submit; stack should keep the primary hue while blocked (disabled-looking primary reads as "not for you"). stack + app |
| D-2 | n/a | download act is not destructive; "Download anyway" carries a confirm (candidates.tsx:288) yes |
| D-3 | yes | candidates `act` has a label (accessible name) |
| D-4 | n/a (not shot) | source: Score is `kind: "number"` (right, tabular); Size hidden, "Peer" mixes `user · free slot/queue N` text |
| D-5 | yes | status by word |
| D-6 | no | "Soulseek" is the product's word (fine) but the nav calls it "Search" while the Pane title, section and button all differ: "Search", "Find a track", "Search Soulseek"; "Candidates" (the Section title) is a developer noun, a DJ says results; fix "Results". app |
| D-7 | no | no empty/first-run sentence: nothing says what fills the page (recent searches, or the wishlist that auto-searches) and no act toward it; search/empty-1920.png shows form alone. app |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little: a one-field form at 720 px in a 1700 px canvas; no recent searches, no quality filters (the vision promises "prefer lossless or 320") |
| E-1 | no | nothing says whether Soulseek is connected, how many peers, or what is queued; the "Soulseek is not set up" banner exists only when not configured (source search.tsx:40, correct per F8) but the connected state tells nothing |
| E-2 | no | task = find, pick, download. Presses: type (1), Enter (2), wait, scan the Table, press the row's Download (3). Good count. But after "Download" the toast "Asked the peer" has no `to` (candidates.tsx:273-275): the next step (Downloads) is not offered; the inbox approve act does it right (`to: "/jobs"`). fix: `to: "/downloads"`. app |
| E-3 | no | job feedback: the search job's state shows as a Banner in the Candidates section (running / done / failed), good; the download shows nowhere on this screen, and the row's act becomes "blocked: Already asked for" with no progress. fix: show the transfer state on the candidate row, or the toast link above. app |
| E-4 | n/a | nothing destructive; downloads are not undone but land in the inbox for approval |
| E-5 | no | chain: Search to Downloads (no link), Search to Wishlist (a search with no candidates has no "Add to wishlist"; `Candidates` has no empty act, and the form has no "Wishlist" link), Search to Library ("Open in the library" is only in the `more` menu of a row that already exists). Terms: sidebar "Search" / "Wishlist" / "Downloads" sit under DISCOVER but "Inbox" is under LIBRARY: a DJ walking the chain jumps between two groups. app (nav order) |
| E-6 | n/a | the candidate read is windowed |
| E-7 | no | source only (candidates.tsx:197-242): the choice turns on bitrate, format, size, length, peer, queue, score. Shown by default: Score, Quality, Library chip, Peer (user + free slot/queue N), Why. Hidden by default: Size, Time, Folder. A 12-minute DJ mix at 29 MB and a 3-minute radio edit at 8 MB look alike; the length and size are exactly what separates an extended from a radio edit. And at 720 px (row form, see wishlist/$wantId shot) hidden columns are not shown at all. No "recommended" mark: best-first order is the only signal. No peer speed. fix: show Time and Size by default, mark row one "Best match" (chip), put the rejected rows under a band "Turned down". app |
| E-8 | no | failed search: Banner shows `job.error ?? "The search failed."` (search.tsx:77): says nothing to do. The "not configured" banner says what to do and links to Settings: good. app |
| E-9 | no | no focus on the field on arrival (cannot tell from shot), no shortcut hint; the Table keyboard is stack's |
| E-10 | no | label "Search" matches Pane title; but "Search" in the sidebar is also the name of the library's search box conceptually (the library toolbar search) and the sidebar says DISCOVER > Search, a DJ looking for "Soulseek" does not find it: fix label "Find music" or "Soulseek". app |
| F-8 | yes | Banner "not configured" stands only without config (source), the results banner stands only with `s`. Not shot, not measured by shift log |
| G-1 | yes | title = sidebar label, `back={false}` |
| G-2 | no | Section "Candidates" holds a Banner then a Table (a state line stacked on a Table in one section; the Banner should be the section's `description`/status or stand over the section). app |
| G-6 | no | field label "What to find" is a question-ish phrase but other forms use nouns ("Link", "Artist"); the Form bar has a hint plus the act: fine |
| G-7 | yes | tone vocabulary |
| G-3/4/5/8/9/10 | n/a | |

Top three: (1) the decision step (candidate pick) hides length, size, folder and has no recommended mark; (2) the form sits alone in a blank page, with no recent searches, no first-run sentence, no link to the wishlist or downloads; (3) the submit reads as a disabled grey button with "Type a value".

## Downloads (/_app/downloads)
Shots read: downloads/data-1920.png, downloads/empty-1920.png
Source read: routes/_app/downloads.tsx, ui/acquire.ts
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar, list on a sheet |
| A-1b | no | row slots: mark (Download icon), name, meta "Downloading dj_wax · 41% of 14.1 MB · 469 KB/s", age, act. Compare wishlist rows (status first, chip, then counts) and inbox rows (checkbox, state, chip, reason): the status mark leads the meta here, a chip is absent. Identical kind of fact (state) is in the same slot as wishlist/inbox (first on the meta line): yes. Peer (username) stands in meta here but is a chip "From" in inbox: differs. app |
| A-1c | n/a | |
| A-1d | n/a (no section heading) | |
| A-2a | yes | |
| A-2b | no | the leading mark is a Download glyph on every row whatever the state while the state mark is a dot: row 2 "In the inbox" has a Download glyph AND an inbox act; the glyph says nothing the title does not. app |
| A-2c | n/a | |
| A-2d | yes | |
| A-3a | yes | no truncation at 1920 |
| A-3b | yes | |
| A-3c | no | row carries mark, name, status, user, size/percent, speed, error, age, act (downloads/data-1920.png row 3: "Failed slowpeer · 8.6 MB · Completed, TimedOut"). More than name, one meta, one end group; the raw slskd word "TimedOut" shows. app |
| A-4a | n/a | untitled |
| A-4b | no | "Clear finished" fine; the empty sentence in the source, "No downloads yet. Search Soulseek, or let the wishlist find what you want." is two sentences and a hint, and the shot shows the generic "Nothing here yet." instead (see 4c) |
| A-4c | no | downloads/empty-1920.png shows "Nothing here yet." (stack's default), not the source's sentence at downloads.tsx:173: the `empty` prop is not reaching the sheet when the Pane's `read={transfersLive}` is empty, or the screen's fixture drives the Pane `empty`. And it has no act (Search). Verify which; stack if `Section.empty` is ignored under a Pane read. stack or app |
| A-4d | yes | |
| A-5a | yes | no filled act |
| A-5b | n/a | |
| A-5c | yes | |
| A-6a | yes | dots: green = in the inbox, red = failed, spinner ring = downloading; each with its word |
| A-6b | no | row 2's inbox glyph at the end is an act that leads elsewhere ("Open in the inbox"): fine; but a row that opens (here a download that could open its want or its candidate) draws nothing. ok |
| A-6c | yes | |
| A-7a-d | n/a | single list; 7d yes |
| A-8a | n/a (state not shot) | |
| A-8b | no | the empty shot is a 46 px box; data has three rows: reads as data with rows gone: yes. But no toolbar in either (no filter, no band): consistent |
| A-8c | n/a (state not shot) | |
| A-8e | yes | |
| A-8f | no | meta "Failed slowpeer · 8.6 MB" in meta ink at 12 px reads fine; the age in the faint ink ok |
| A-9a | no | beside Linear's grouped list: (1) no bands (Active, In the inbox, Failed) so three states mix in one sheet; (2) no summary figures; (3) status is a dot in the meta line, not a leading column. app |
| B-1 | no | list stops at x=964, 956 px blank (shared cause). app |
| B-2 | n/a | |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | yes | bar: title left, one icon right |
| B-6 | n/a | |
| B-7 | yes | |
| C-1 | no | rows are two-line (46 px+) by design as they carry a mark: yes by V9 (a row with a mark is two lines) |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | n/a | |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | yes | no primary; the screen's most common task is watching, the common act is the row's |
| D-2 | no | "Cancel" (X icon) has no confirm (downloads.tsx:140-143): cancelling a half-done transfer is cheap, acceptable; "Clear finished" (BrushCleaning icon, bar) has no confirm and its label is only a tooltip; it forgets history. app: low |
| D-3 | no | the bar's only act is an unlabeled broom icon at the far right (downloads/data-1920.png 1880,22): "Clear finished" in the tooltip only; discoverable, but it is the only way to remove failed rows. app: low |
| D-4 | no | age "1 sec", "38 min", "1 hr" (stack) vs wishlist's `until()` "in 2 h" / "in 30 min" (app, acquire.ts:436: "h" vs "hr"). Size "14.1 MB" per row (unit per cell, acceptable in a meta line). Speed "469 KB/s" OK |
| D-5 | yes | dot + word |
| D-6 | no | "Completed, TimedOut" is slskd's raw state (downloads/data-1920.png 559,205): fix: map to "Timed out". "Finishing" for completed, "In the inbox" (matches wishlist's "In the inbox": good), "Asking" (a DJ says "Requested"). app |
| D-7 | no | empty form lacks its act (see 4c) |
| D-8 | n/a (state not shot) | |
| D-9 | yes | |
| E-1 | no | the page says what is downloading, but no count or total ("1 active · 1 in the inbox · 1 failed") and no hint that a finished file goes to the inbox on its own. The source comment states it; the screen does not. app |
| E-2 | yes | watching: 0 presses; retry: 1; open in inbox: 1 |
| E-3 | no | progress is text only ("41% of 14.1 MB"): no progress bar; the spinner ring is the only running mark. stack could draw a Row `progress`; app lacks it |
| E-4 | n/a | |
| E-5 | no | downloads rows do not name the want or search they came from, and the title does not link; only the inbox hop exists. Back-link to the want ("Wishlist: Kalomi...") is missing: a DJ cannot tell whether a download satisfied a wish. Inbox rows do not link back either. app |
| E-6 | no | `transfersLive.at(map)`: one live list with no windowing; over a long history this is an unbounded sheet; only "Clear finished" bounds it. app |
| E-7 | n/a | |
| E-8 | no | failed row says the peer and a raw error, with a retry; no suggestion ("try another candidate"). The retry repeats the same peer which timed out: the screen should offer "Pick another" back to the want's candidates. app |
| E-9 | n/a | |
| E-10 | no | sidebar label "Downloads" = title: yes; but the group DISCOVER hides it at the foot of a long sidebar: in downloads/data-1920.png the sidebar is cut at "Search" (item below the fold of an 800 px shot) |
| F-8 | n/a | no banner; consider one for "slskd unreachable" (no signal on this screen when slskd is down) |
| G-1 | yes | |
| G-2 | n/a | list outside a section: a sheet of its own: yes |
| G-3 | no | leading mark = Download glyph for all rows (a leading mark should carry meaning; here it is constant); title in sans, not mono (V9: name in the mono; shots show every row title in the sans; the mono appears only where the app passes `{code}`): stack Row default vs voice: judge with stack. End group order age, act: yes |
| G-4 | n/a | |

Top three: (1) no summary, no bands, no progress bar: the state of the queue cannot be read at a glance; (2) failed rows show slskd's raw "Completed, TimedOut" and offer only the same retry; (3) empty form is the generic "Nothing here yet." with no act (should point to Search).

## Wishlist (/_app/wishlist)
Shots read: wishlist/data-1920.png, wishlist/empty-1920.png
Source read: routes/_app/wishlist.tsx, ui/acquire.ts
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | page opens with the Imports section, then the filter, then the wants: the page's subject (the wants) is second; the filter picker stands over its list but is separated from it by a 48 px gap (data: Toolbar y=190, table y=237). Order of pattern: toolbar bare on the table: yes; but Imports first is app |
| A-1b | no | want row: "Found · [Spotify] · Searches 2 · Best match 95"; import row: icon + "24 of 40 in the library · 13 missing" and a bare age; download rows start with a dot; inbox rows start with a dot then a chip then reason. State dot + chip + counts: wishlist and inbox share it; the chip carries the source here ("Spotify") and the verdict in the inbox: the same chip slot, different facts (app) |
| A-1c | n/a | |
| A-1d | no | "IMPORTS 1" count in faint, no description; the second section (wants) has no heading at all, only a filter; headings differ across a page (one titled, one not). app |
| A-2a | yes | |
| A-2b | no | "Searches 2" and "Best match 95" show for a row that is Found; row 2 "Searches 1 · in 30 min": "in 30 min" is the "Next search" column without its label (the narrow form drops labels of non-number columns); reads as an age. Also "30 min" at the right of the import row means created 30 min ago, while "in 30 min" means in the future: same words, opposite meanings on one screen. app: format `until` and age differently |
| A-2c | no | "IMPORTS 1" counts the rows shown, but the source caps at `slice(0, 5)` (wishlist.tsx:170): with 8 imports the count says 5 or 8 (unclear) and the other 3 are unreachable from anywhere. app, real defect |
| A-2d | yes | |
| A-3a | no | wishlist rows in the row form carry state, chip, searches, next search, best match: 5 facts on one meta line at 1920 (the grid never shows, shared cause) |
| A-3b | yes | |
| A-3c | no | per above: name, status, chip, 2-3 counts, age/act, act, more |
| A-4a | n/a (no description) | |
| A-4b | no | "Every want" (filter placeholder), "Wanted", "Found", "Gave up": "want" is jargon; the title is "Wishlist": say "Every track". Row state "Found" (candidates exist, nothing downloaded) vs "Ready" (inbox): different words for "a thing awaits your yes". app |
| A-4c | yes | "Imported playlists show here." in meta ink, centred; the wants empty shows the generic "Nothing here yet." with no act (the bar's Plus is the way in). Two different empty forms on one page: one sentence is specific, one generic. Both lack the outlined act (V15). app |
| A-4d | yes | |
| A-5a | yes | no filled act |
| A-5b | no | "Spotify"/"Added by hand" chips are outlined fact chips with a dot (type pill form) where "From" is a plain source, OK; the dot colour is grey on both. State dots: Found = blue, Wanted = grey. One meaning each: yes. Mixed: the source chip has a dot while a fact pill should not (V12: dot for a type or label): acceptable |
| A-5c | yes | |
| A-6a | yes | Found blue dot, Wanted grey dot, both with words |
| A-6b | no | the Imports row opens (href) and draws no chevron: yes. The wants row opens a record and draws the search glyph + more: yes |
| A-6c | yes | |
| A-7a | n/a (no record in this shot) | with a record open see wishlist/$wantId |
| A-7b | n/a | |
| A-7c | n/a | |
| A-7d | no | gaps: Imports sheet bottom y=145 to filter y=190 (45 px), filter to table y=237 (47 px): sections gap 48 between each; the filter picker stands alone with its own gap rather than bare on the table: V3 says a control over a list stands bare on the table over its list's sheet; it is a pill 32 px high with a 48 px gap under it. Same on inbox, import. app composition (Toolbar and Table are separate siblings in the Pane body; gap is the Pane's) or stack: a Toolbar over a Table should be adjacent. stack |
| A-8a | n/a (state not shot) | |
| A-8b | yes | empty = data with rows gone; toolbar and bands stand |
| A-8c | n/a (state not shot) | |
| A-8e | yes | |
| A-8f | no | "Searches 2 · Best match 95" faint-ish at 12 px; passable |
| A-9a | no | beside Linear's grouped list: (1) no band per state (Found / Wanted / Gave up) with counts: a filter picker hides the distribution; (2) the leading column is a name without a mark (the import rows have an icon, the wants none); (3) two lists stacked with unrelated shapes. app |
| B-1 | no | 956 px blank band right (shared cause). app |
| B-2 | yes | with a record open (wishlist/$wantId): list 480 wide (x=244 to 715) and record 720 within; the record starts at x=764 and ends x=1484: leaves 436 px blank to the right; acceptable (V17 record within 720) |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | yes | |
| B-6 | n/a | |
| B-7 | yes | |
| C-1 | yes | |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | no | "IMPORTS 1" is the only heading; the want list has none, so the page has two list forms (see 1d) |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | no | bar: Plus (Add a track) is the bar's first act: icon. The page's most common task is acting on found wants and importing a playlist; "Import a playlist" is in the more menu (wishlist.tsx:121 after the first act, stack puts only the first act out). No primary. The chain entry "import a playlist" (the headline feature of the vision: wishlist and playlist import) is hidden behind "...". app: reorder or label |
| D-2 | yes | Remove: destructive + confirm; Ignore no confirm (reversible by "Take it up again"): ok |
| D-3 | yes | accessible names from labels |
| D-4 | no | see D-4 under Downloads: "in 30 min" / "30 min" / "1 hr" / `in 2 h` |
| D-5 | yes | |
| D-6 | no | "Wishlist", "want" (Pane noun "want" gives "Couldn't find this want."), "Wanted", "Found". "Imports" as a heading above tracks: a DJ imports playlists, say "Imported playlists". "Show / Every want" fine. app |
| D-7 | no | see 4c |
| D-8 | n/a (state not shot) | |
| D-9 | no | too little and too much: wants as 5-fact meta lines; the Imports section fills the first 150 px with a single row |
| E-1 | no | nothing says the hub searches on a schedule; the data shows "Searches 2", "in 30 min" without the explaining sentence the source comment has. No total counts outside the filter dropdown. app |
| E-2 | no | task: act on found wants. Press count to download a found want: open row (1), scan the candidates (2), press Download (3): ok; but the list-level "Search" icon on a Found row (wishlist.tsx:216-228: icon "Search" for wanted, found and gave-up) is not the next step for a Found want: the next step is to open its candidates; the row's one standing act searches again. app: the act of a found row should be "Review candidates" (href) |
| E-3 | no | "Search what is due" has `to: "/jobs"` and the row's search says "Searching Soulseek": the toast; progress shows in the row's state (running dot): ok partial. app |
| E-4 | no | Remove has a confirm but no undo; "Ignore" reversible |
| E-5 | no | wishlist to import: Imports rows open; import to wishlist: act `to: "/wishlist"`; want to search: no link; want to downloads: none; "downloaded" want says "In the inbox" with no link to the inbox item. app |
| E-6 | no | the want list is windowed, the Imports list is not: capped at 5 with no way to the rest (`slice(0,5)`): at 20 imports, 15 are lost. Strong finding. app |
| E-7 | n/a | |
| E-8 | no | "Gave up" state has no reason on the row; the Last search sentence is only on the record |
| E-9 | n/a | |
| E-10 | no | sidebar "Wishlist" matches; Import has no entry (reached from the bar's more menu) |
| F-2 | no | Table: row form only: sort, columns menu, frozen columns not visible at 1920 (shared cause) |
| F-3 | n/a (windowed, not shot) | |
| G-1 | yes | |
| G-2 | no | Imports Section's heading in this shot is "IMPORTS 1" with the faint count: yes; "no description": ok |
| G-3 | no | Imports row: leading icon ListMusic, name, meta, age at the end: yes. Wants: no leading mark; marks (status dot, chip) lead the meta line: yes. Title in sans (see Downloads G-3) |
| G-4 | no | one meaning per style: source chips "Spotify" and "Added by hand" are outlined with a dot: and the inbox chips "Duplicate"/"New track" are the same style meaning a verdict, with coloured dots. Same style, different meanings (source vs verdict): V12/C5b. app |
| G-5 | no | the filter is a lone picker; no search field leading the Toolbar (a 50k library's wishlist could have hundreds of wants): G5 says search leading. app |
| G-8 | yes | picker labelled by placeholder; there is no field label drawn ("Show" is only the accessible label): ok |

Top three: (1) the Imports section hides all but 5 imports with no way to the rest; (2) at 1920 the page is a 720 px column of two-line rows next to a 956 px void, the Imports row first and the wants second with no heading; (3) the found want's standing act is "search again" instead of "see the candidates", and "Import a playlist" is buried in the more menu.

## Wishlist record (wishlist/$wantId)
Shots read: wishlist/$wantId/data-1920.png, wishlist/$wantId/empty-1920.png
Source read: routes/_app/wishlist.$wantId.tsx, lib/candidates.tsx
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar "Wishlist / Kalomi - Midnight Echo (Extended Mix)", overline "Spotify", name 20, pills Found / 2 searches / Wants any copy, sections |
| A-1b | no | candidate rows: "Score 95 · MP3 320 · dj_wax · free slot · title and artist match · format mp3 320 · free slot": name, then 6-7 meta parts. The "Library" chip sits on its own second line for row 2 ("Another version in the library", green dot). Row 3 has no act, only more. Different from inbox match rows (leading Music mark, quality last, percentage at the end). Same candidate vs match concept: score "Score 95" first vs "86%" at the end. app |
| A-1c | yes | Next search / Last search values start at one column (x=866) |
| A-1d | no | "SEARCH 2": the count counts two definition rows (Next search, Last search): a count that counts fact rows means nothing (2c). "CANDIDATES" has no count though it holds 3 (the "12 candidates" of the Last search row differs from the 3 rows: 12 found, 3 kept: not explained). Description "From the last search, best first. Download one and the file lands in the inbox." is two sentences with an instruction. stack (Section counts label rows) + app |
| A-2a | yes | |
| A-2b | no | row 1: "MP3 320" and "format mp3 320"; "free slot" twice; row 2: "FLAC 16 bit 44.1 kHz" and "format flac"; "queue 12" twice; row 3: "MP3 128" and "format lossy". The "Why" reasons repeat the facts (`c.reasons.join`, candidates.tsx:231). Also pills "2 searches" / list row "Searches 2": the same fact thrice (pill, Search section is "Next search", list row). Fix: drop reasons that restate a column. app |
| A-2c | no | "12 candidates from 31 peers" (Last search) against 3 rows: unexplained; "SEARCH 2" count. app/stack |
| A-2d | yes | |
| A-3a | yes | no truncation at 1920 |
| A-3b | yes | |
| A-3c | no | candidate rows carry name, score, quality, peer, queue, reasons, chip, act, more: far more than one meta |
| A-4a | no | see 1d |
| A-4b | no | "Wants any copy" is a pill stating a setting in the app's glossary ("better copy") not shown as a switch; "Candidates" |
| A-4c | no | empty candidates: "Nothing here yet." with no act (should be "Search now") |
| A-4d | yes | |
| A-5a | yes | |
| A-5b | no | Fact pills (Found, 2 searches, Wants any copy) are outlined: yes; the state "Found" is a fact pill here but a dot-and-word state in the list: same meaning, two styles (the inbox record does the same with "Needs you"). V12: a state is a soft fill. app (`facts` take strings: stack record head only has plain pills: stack) |
| A-5c | yes | |
| A-6a | yes | |
| A-6b | no | green dot on "Another version in the library" (row 2): green means "In the library / done" elsewhere (import chip "In the library" green; "Other mix" teal in IMPORT_STATUS); the candidate column colours every library state green (`family: "green"`, candidates.tsx:217). Other version should be teal as in import, "Maybe" amber. app |
| A-6c | no | row 2's download icon is fainter than row 1's (data: x=1417 vs 1455) with no stated reason (blocked "Already asked for"? the tooltip only): a faded act with no word reads as a bug. app/stack |
| A-7a | no | list pane first row y=237 (Kalomi row top), record first section y=187: two grids; the list's rows are two-line and the record's are one-line facts. Heading baselines do not line up: "IMPORTS" y=77 equals the record overline y=77: good; below, differ |
| A-7b | yes | single label column |
| A-7c | yes | |
| A-7d | yes | |
| A-8a/8c | n/a (state not shot) | |
| A-8b | yes | candidates region becomes "Nothing here yet." with sections standing |
| A-8e | yes | |
| A-8f | no | candidate meta lines in faint at 12 px, long and dense; passable |
| A-9a | no | beside Linear's record: (1) no description and no activity; (2) candidates (the decision) are a plain list, not a comparison; (3) acts (Search, more, close) are three bare icons in the bar. app |
| B-1 | n/a | record |
| B-2 | yes | record at 720 (x=764-1484), list 480; a blank band of 436 px at the right. Both read as one page: yes. |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | yes | |
| B-7 | yes | |
| C-1 | no | candidate rows with a chip are 3-line (the chip on a line of its own, row 2), where the "Library" fact could lead the meta line (V9: marks lead the meta line): row 2 puts the chip line between name and meta: yes per V9; but its height is 70 px vs 50: uneven rhythm. app |
| C-2 | yes | |
| C-3 | yes | |
| C-4 | no | heading forms equal |
| C-5 | no | see 7a |
| C-6 | yes | |
| D-1 | no | bar: Search now (icon, first), more, Close. For a Found want the primary act is "Download the best candidate"; it is only an icon on each candidate row. No filled primary; fix: row 1's act is the recommended; label it |
| D-2 | yes | Ignore: no confirm, reversible; "Download anyway" has a confirm |
| D-3 | yes | |
| D-4 | no | "Score 95" unitless 0-100? Not stated; sizes absent; "FLAC 16 bit 44.1 kHz" vs "MP3 320" format forms differ; "queue 12" |
| D-5 | yes | |
| D-6 | no | "peers", "free slot", "queue 12", "lossy", "rejected: wrong version": Soulseek terms; "Wants any copy"; "candidates" (the DJ's word is results/files). app |
| D-7 | no | see 4c |
| D-8 | n/a | |
| D-9 | no | too much per candidate row |
| E-1 | yes | the record states the state, searches, the next search |
| E-2 | no | Download the best: 1 press from the record, 2 from the list. The recommended is not marked; the third row's rejected is explained in meta text only. app |
| E-3 | no | after Download the toast "Asked the peer" (jargon: "peer") with no `to`; the record shows no transfer state for the chosen candidate except the faint act |
| E-4 | n/a | |
| E-5 | no | download to Downloads page: no link; downloaded want to inbox item: none |
| E-6 | n/a | |
| E-7 | no | the clearest case in the group. Facts shown: score, format/bitrate, user, queue, reasons, library flag. Missing: size, length, peer speed, folder; side by side comparison with what the library already has ("Another version in the library": no bitrate of the one it has); no "recommended" mark (row 1 is only first); rejected rows indistinct (no tone, no band). app |
| E-8 | n/a | |
| E-9 | n/a | |
| E-10 | yes | |
| F-2 | no | the Table is in row form at 720 px: sort mark, columns menu, hidden Size/Time/Folder columns invisible and unreachable; the user cannot show them (the columns menu exists only in the grid). This is the stack's reason Size and Time are lost: a hidden column in row form has no way back. stack |
| G-1 | no | noun "want" gives "Couldn't find this want."; Pane within "Wishlist": yes |
| G-2 | yes | two sections |
| G-3 | no | see A-1b; end group: act, more (row 2: act faded + more) |
| G-4 | no | chip "Another version in the library" is a green outlined chip with a dot: fact chip vs state meaning (see A-6b) |
| G-10 | n/a | |

Top three: (1) the candidate list gives the choice's facts as one long meta string that repeats itself and omits size, length and speed, with no recommended mark; (2) the record's search section counts two fact rows and lists "12 candidates" against 3 drawn; (3) after Download there is no visible next step.

## Import (import/$importId)
Shots read: import/$importId/data-1920.png, import/$importId/empty-1920.png
Source read: routes/_app/import.$importId.tsx, ui/acquire.ts
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | no | order: bar, overline, name, pills, then a skipped-entries row (sheet with warning), Toolbar, Table. In the pattern the facts pills come after the name: yes; the warnings sheet sits where a banner or section would, untitled |
| A-1b | no | rows: "In the library" chip then "Kalomi - Midnight Echo (Extended Mix) · 97%"; Missing chip alone; "Not sure" chip then name · 82% and a check act. The match name is not labelled; "97%" is the confidence: a figure in a meta line with no label. app |
| A-1c | n/a | |
| A-1d | no | the untitled section (warnings) and the table have no headings; a record page with no section headings |
| A-2a | yes | |
| A-2b | no | the pills "40 tracks · 24 in the library · 13 missing · 3 not sure" and row chips "In the library / Missing / Not sure": the filter's labels ("In the library", "Missing", "Not sure", "Other mix in the library") restate them a third time; ok but 24+13+3 = 40 yet "Other mix" is folded into "missing" (acquire: `missing + otherVersion`): the pill "13 missing" includes other mixes the filter calls separate. app |
| A-2c | no | 40 tracks vs 3 rows (fixture); the pill sum 24+13+3=40 but the "2 entries skipped" are outside the 40: ok |
| A-2d | yes | |
| A-3a/3b | yes | |
| A-3c | yes | |
| A-4a | n/a | |
| A-4b | no | "Heads up" as the warning mark word; "Not sure" vs "Needs you" vs "Review" for the same notion in other screens |
| A-4c | no | import/empty-1920.png: TWO "Nothing here yet." boxes: one where the warnings row was (an untitled Section with no items draws the generic empty form, 46 px of nothing at x=244,y=179) and one for the table. In real life most imports have no warnings: this untitled box would stand on every import. F8/V15: absent facts say nothing. app: put warnings in a Banner (`tone: "attention"`, sentence) which stands only with data; stack: a Section with no title and an empty read should stand away |
| A-4d | yes | |
| A-5a | yes | no filled act in the bar (see D-1) |
| A-5b | no | result chips: In the library green, Missing red, Not sure amber, Other mix teal: four hues for a state in a column called "Result" in chip form; elsewhere state is a dot and word (wishlist "Found", inbox "Ready"). The same kind of fact in two forms across the chain. app |
| A-5c | yes | |
| A-6a | yes | warning triangle = heads up |
| A-6b | no | the Check glyph in the not-sure row is an act "Same track" (label only in the tooltip): a check could read as "is OK" (state) rather than "confirm". app |
| A-6c | no | row 3's check and more: as acts: yes |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7d | no | gaps: pills to warnings 24 px (y=155 to 179), warnings to filter 46, filter to table 47: uneven; stack's Toolbar gap as on the wishlist |
| A-8a/8c | n/a (state not shot) | |
| A-8b | no | empty shot keeps the pills "40 tracks" while rows read "Nothing here yet.": inconsistent fixture; and see 4c |
| A-8e | yes | |
| A-8f | yes | |
| A-9a | no | beside Linear's record: (1) its facts as pills but no description; (2) the table has no band per result (In the library / Missing / Not sure) with counts and an "add all" act per band; (3) record acts are three icons in the bar. app |
| B-1 | no | record, but the table is 720 px (shared cause); the table's Track / Result / Library track columns never show |
| B-2 | yes | |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | yes | |
| B-7 | yes | |
| C-1 | yes | |
| C-4 | no | see 1d |
| C-6 | yes | |
| D-1 | no | the two acts that finish this screen, "Add the missing tracks to the wishlist" and "Make a playlist from what the library has", are an icon (ListMusic at 1842,22) and an item in the more menu; the user lands, reads the counts, and must guess. The primary should be a filled "Add 13 missing to the wishlist" (the chain's next step), standing in the bar or as a banner act. app/stack: Pane `actions` only draws the first as an icon: a record Pane has no way to stand a labelled act, stack |
| D-2 | yes | Delete this import: destructive + confirm |
| D-3 | no | the bar's first icon (ListMusic) is "Make a playlist", but the icon `ListMusic` is also the Imports row mark and "Open playlists": a playlist glyph for an act that creates is ambiguous; no text. app |
| D-4 | no | confidence "97%" unlabeled; elsewhere (inbox) "86%" at the end; candidates "Score 95": three ways to say a match quality. app |
| D-5 | yes | chip carries the word |
| D-6 | no | "Not sure" (here) vs "Needs you" (inbox) vs "Review" (sidebar CURATE/Review, inbox pill) vs "uncertain" (code); "Other mix" chip vs "Other mix in the library" filter vs "Another version" (inbox match) vs "Another version in the library" (candidates): four names for a different mix. app |
| D-7 | no | see 4c |
| D-8 | n/a | |
| D-9 | yes | |
| E-1 | yes | pills give the verdict of the import in one line |
| E-2 | no | task: turn a pasted list into a playlist and a wishlist. Presses: open the bar's "more" (1), choose "Add the missing tracks to the wishlist" (2); playlist: icon (1). The next step is hidden in a menu. Resolve uncertain: 1 each; no "confirm all". app |
| E-3 | yes | acts `to: "/wishlist"` and `to: "/playlists"`; parsing state is a row |
| E-4 | no | "Delete this import" has a confirm; the wishlist add and playlist make have no preview or undo, and the result page does not say what the playlist will contain. app: low |
| E-5 | no | import to wishlist yes (act); import to the wants made from it: the wishlist doesn't filter by import; missing rows have no "Search Soulseek now". app |
| E-6 | yes | windowed (`imports.items.window`) |
| E-7 | no | uncertain matches are the decision: the row shows the library's match name and 82% but not the two side by side (the pasted line vs the library track's quality, length, BPM), and "Same track" is a check icon only. app |
| E-8 | no | `each.error ?? "The import failed"` has no next step |
| E-9 | n/a | |
| E-10 | no | the Import page has no sidebar entry (acceptable, it belongs to Wishlist); "within: Wishlist": yes |
| F-8 | no | warnings are an untitled Section in place of a Banner (see 4c); the real Banner ("A playlist was made from this list.") stands only with data: yes, tone `active` (accent). One banner's tone "active" for a done state: the tone vocabulary for done is `done`/green. app |
| F-2 | no | Table in row form (shared cause) |
| G-1 | yes | noun "import" |
| G-2 | no | see 4c |
| G-3 | no | chip leads the second line, then match: fine; title in sans |
| G-4 | no | see A-5b |
| G-5 | no | toolbar has no search |
| G-7 | no | tone "active" |

Top three: (1) the two acts that complete an import hide in an icon and a more menu; (2) an empty untitled "Nothing here yet." box stands wherever there are no warnings (every normal import); (3) four overlapping words for "not an exact match" and chip colours for a state across the chain.

## Inbox (inbox)
Shots read: inbox/data-1920.png, inbox/empty-1920.png
Source read: routes/_app/inbox.tsx, ui/acquire.ts
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar, filter bare, rows on a sheet, selection bar docked |
| A-1b | no | row: checkbox, name, state dot+word, verdict chip, reason, quality, time, source, target, age, act, more. State then chip: yes; versus downloads/wishlist the chip carries source or verdict. The age sits left of the act here and "1 hr" at the end: ok. app |
| A-1c | n/a | |
| A-1d | n/a (no section) | |
| A-2a | yes | |
| A-2b | no | inbox/data-1920.png row 2: dot "Duplicate" AND chip "Duplicate"; row 3: "Needs you" AND "Review"; row 1: "Ready" AND "New track", and reason "new track" a third time (meta line "new track · MP3 320 ..."). Two classification systems (State, Verdict) say the same thing in the same row. fix: drop the chip, keep the state dot; show the verdict reason only. app |
| A-2c | no | "0 of 3 files chosen": matches rows; ok. yes |
| A-2d | yes | |
| A-3a | no | row 1 wraps: the target path "Tech House/Kalomi - Midnight Echo (Extended Mix).mp3" runs onto a second meta line (inbox/data-1920.png 294,211): at 1920 in a 720 px pane. 1 of 3 rows. |
| A-3b | yes | |
| A-3c | no | row 1 carries state, chip, reason, quality, time, source, target, age, act, more |
| A-4a | n/a | |
| A-4b | no | "Needs you" (state) is a phrase about the user, the others describe the file; "Keep it anyway" fine; "Time 6:12" is a label "Time" for a length: should be "Length" or bare |
| A-4c | no | "Nothing here yet." no act (should say "Drop files in the Inbox folder, or search for music") and the Approve row is still drawn. app |
| A-4d | no | "Choose files first." (inbox/data-1920.png 560,778) a UI instruction and a blocked text shown permanently; fix: omit the text. app |
| A-5a | no | selection bar shows "Approve" as the only filled-looking button: grey (blocked), the others outlined. A bar of four always-visible acts with the primary last. app |
| A-5b | no | state pills are dots+words (Ready, Duplicate, Needs you); the chip beside them is a fact chip with a coloured dot: green "New track", grey "Duplicate", amber "Review": the chip colours are a state vocabulary. Two systems (see 2b). app |
| A-5c | yes | |
| A-6a | yes | |
| A-6b | no | the Check at row 1 end is Approve; row 2,3 have only more: acts differ per row: ok |
| A-6c | yes | |
| A-7a | n/a | |
| A-7b | n/a | |
| A-7d | no | filter to table gap 46 (the same Toolbar spacing as wishlist) |
| A-8a/8c | n/a (state not shot) | |
| A-8b | yes | the selection bar stands in empty; "0 of 0 files chosen": a bar with nothing to choose. app/stack: the bar should hide when there is no row |
| A-8e | yes | |
| A-8f | no | disabled acts "Keep it anyway / Try again / Reject" ink-disabled: by design; the bar's information is low |
| A-9a | no | beside Linear's grouped list: (1) no groups by state with counts (Ready 1, Needs you 2): one flat list; (2) no leading avatar/mark, so the dense meta line is read first; (3) rows too heavy (3 lines, 10 facts). app |
| B-1 | no | 956 px blank band (shared cause); app |
| B-2 | no | see record |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | no | the selection bar: data (no record): "0 of 3 files chosen · Select all · Choose files first. [Keep it anyway] [Try again] [Reject] [Approve]" one line, no overlap, but "Select all" (a mobile act, below tablet) is shown at 1920: it should stand only below `tablet` per rules.md ("below `tablet`, a select-all act"); here it stands at 1920. stack or app (the bar draws it with `choose`) |
| B-6 | n/a | |
| B-7 | no | selection bar at the foot spans x=220-1920 (a full width tint) while content is 720 wide; the dock was not shot |
| C-1 | no | three-line rows (row 1: 88 px) vs 52 px: uneven rhythm |
| C-2 | n/a | |
| C-3 | yes | |
| C-4 | n/a | |
| C-5 | n/a | |
| C-6 | yes | |
| D-1 | no | the bar's first act is the double-check icon "Approve everything that is ready" (1842,22), a bulk approve with a confirm, with no count: the DJ's most common act ("file what is ready") is an unlabeled icon; in the selection bar the "Approve" is blocked and last. app |
| D-2 | yes | Reject destructive + confirm, sentence says where the file goes; not primary. But "Reject" sits beside "Approve" without space; both standing as outlined buttons |
| D-3 | yes | |
| D-4 | no | "MP3 320", "FLAC 980" (a bitrate without unit; library shows "kbps"); "Time 6:12" labelled while the age is not; "10 min / 1 hr / 2 hr" (stack) vs "in 2 h". app |
| D-5 | yes | |
| D-6 | no | "Needs you", "Keep it anyway" (a DJ: "Keep both"?), "Verdict", "Goes to", "Dropped" (source, said as a state), "Device", "Ready" (here) vs "Found" (wishlist) vs "Filed". "Review" is both a sidebar page (auto-tag proposals) and this screen's pill: two meanings. app |
| D-7 | no | see 4c |
| D-8 | n/a | |
| D-9 | no | too much per row; too little page |
| E-1 | no | nothing states "3 files, 1 ready"; the counts are inside the dropdown (counts as option descriptions: `description: String(each[value])`). The first look is a list with no summary. app: bands with counts |
| E-2 | no | main task: approve what is clean, decide the rest. Presses to file one ready file: 1 (the check). To file all ready: 1 plus confirm (icon, unlabeled). To decide a duplicate: open record (1), find the match (2), open its menu (3), Replace (4), confirm (5); Keep and Reject are also in menus. app |
| E-3 | no | approve has `to: "/jobs"` (done toast leads to Jobs): progress is on another screen; the list refreshes. Check the inbox says "Looking in the inbox" with no result. app |
| E-4 | yes | Approve everything: confirm sentence "Undo the batch in History" visible at the act; Reject: "waits in the quarantine's folder until its days are up": excellent, visible at the moment |
| E-5 | no | inbox to library: after a file is filed no link to its track (`approved` row: "Filed" with no href to /library/<id>); inbox to review proposals: none; inbox to downloads: the downloads row links to the item but the item doesn't link back to its want/download. app |
| E-6 | yes | window read; but the 4-act bar and a per-row path meta at 50 items: ok |
| E-7 | no | for a duplicate row the list shows only "same song, no better"; the facts the choice turns on (the library's copy's bitrate/length) appear only in the record. The row says "MP3 192" for the incoming file; the library copy is not shown. app |
| E-8 | no | failed state: "Try again" in the menu; the row's reason shown as "Why": ok; error text is the record's Error row only |
| E-9 | no | "Select all" here as text; no shortcut hints; selection by Space is stack's |
| E-10 | no | "Inbox" stands under LIBRARY while Search, Wishlist, Downloads are under DISCOVER (acquisition chain split into two groups); "Review" under CURATE |
| F-2 | no | row form; no sort, columns menu invisible; selection bar docked: yes; "Select all" shown at 1920 (stack rule) |
| G-1 | yes | |
| G-3 | no | checkbox, name, meta, state; the acts column: age, check, more: end group order age, act: yes |
| G-4 | no | see A-5b |
| G-5 | no | no search field in the toolbar; a filter picker "Everything open" only |
| G-8 | yes | |

Top three: (1) State and Verdict double every row ("Duplicate"+"Duplicate", "Needs you"+"Review") and rows run to three lines; (2) the page has no summary and the fast path ("approve everything ready") is an unlabeled icon with no count, while the selection bar permanently shows four disabled acts and "Choose files first."; (3) deciding a duplicate means opening the record and a menu.

## Inbox record (inbox/$itemId)
Shots read: inbox/$itemId/data-1920.png, inbox/$itemId/empty-1920.png
Source read: routes/_app/inbox.$itemId.tsx, ui/acquire.ts
Machine findings (from the run log): none

| Item | Answer | Evidence |
| --- | --- | --- |
| A-1a | yes | bar, overline "Soulseek · dj_wax", name 20, pills, sections |
| A-1b | no | the match row: leading Music mark, name, meta "Same artist and title · Same version · MP3 192", "86%" at the end, more. Candidates in wishlist: no leading mark, score first. app |
| A-1c | yes | label column: Decision, Goes to, Spectrum share x=866... plus the Tags and Pipeline sheets are not labelled |
| A-1d | no | "VERDICT 3" counts three fact rows; "PIPELINE 4" counts steps (ok); "TAGS" no count; "IN THE LIBRARY 1": mixed. The first is a fact count (see Wishlist record). stack/app |
| A-2a | yes | |
| A-2b | no | pills "Needs you · MP3 320 · 6:12 · 14.1 MB" and the Verdict row "possible duplicate, not certain" and chip "Review": state (pill), chip (decision) and sentence say one thing; the target path appears once. The list row shows "MP3 320 · Time 6:12" in the same pane: twice on screen. app |
| A-2c | no | "VERDICT 3" with three rows: but Decision/Goes to/Spectrum only when the data has them; ok. "PIPELINE 4" matches 4 rows: yes |
| A-2d | no | the Decision row reserves two lines for the chip below its text (inbox/$itemId/data-1920.png 853,240): the chip stands under the sentence rather than leading; ok |
| A-3a | no | 'Tags' before/after rows show whole strings: ok; no truncation |
| A-3c | yes | |
| A-4a | no | "IN THE LIBRARY" description: "Tracks this file matches. Replace one to swap this copy in: playlists, tags and rating move over." two sentences, an instruction, wraps to two lines at x=1208 (a 58-character measure) |
| A-4b | no | "Verdict", "Pipeline" (developer words; a DJ reads "What the hub found", "Steps"); "Goes to"; "Spectrum" "content reaches 20.0 kHz, in line with 320 kbps" |
| A-4c | yes | specific sentences ("Nothing in the library matches this file."): good; but Pipeline and Tags empty show the generic "Nothing here yet." (inbox/$itemId/empty-1920.png): three empty forms in one record |
| A-4d | no | Pipeline step "Fingerprint: Idle needs fpcalc (Chromaprint) on the hub": jargon and a CLI name (D6) |
| A-5a | no | no filled act; the bar's Approve is a faint check |
| A-5b | no | the state ("Needs you") is an outlined fact pill in the head while a dot-and-word state in the list; the decision chip "Review" is a soft-filled chip. same facts two styles |
| A-5c | yes | |
| A-6a | no | Pipeline dots: hollow ring = Idle, green = Done, grey = Waiting: hollow vs grey: two "not started" marks with no legend; "Idle" and "Waiting" differ by a ring only. app (STEP_TONE: pending is waiting, skipped is idle) |
| A-6b | no | the library match row opens the track (href) and draws a more menu: yes |
| A-6c | yes | |
| A-7a | no | list pane and record: list first row y=137 (top 137), record first section y=187: unrelated grids |
| A-7b | no | two label columns: the Verdict facts (Decision/Goes to/Spectrum, x=866) while the Tags sheet and the Pipeline rows carry labels in a different form (field name over text): fine; one grid in Verdict |
| A-7c | yes | |
| A-7d | yes | |
| A-8a/8c | n/a (state not shot) | |
| A-8b | no | empty shot shows the record's data (Verdict standing) with Pipeline/Tags empty: not a clean empty; fixture |
| A-8e | yes | |
| A-8f | yes | |
| A-9a | no | beside Linear's record: (1) no cover, no waveform, no preview (a DJ cannot hear the file before filing: `preview.tsx` exists in lib but the record does not use it); (2) four sections of equal weight where one (the library match) is the decision; (3) acts in the bar are icons: approve faint, "..." |
| B-1 | n/a | |
| B-2 | yes | list 480, record 720 starting x=764; right band blank 436 px |
| B-3 | n/a | |
| B-4 | yes | |
| B-5 | no | the selection bar with a record open (inbox/$itemId/data-1920.png y=859, empty y=778): "0 of 3 files chosen / Choose files first. / Select all" are drawn on top of each other in a single garbled text ("0 of3 files chosen first Select all"), then "Keep it anyway" is partly covered. This is the known library bug (B5) here in the inbox: the bar's left side wraps nothing and overlaps. Cause: stack's selection bar has no wrap/priority when the pane is 480 px (stack); contributing: the app passes a long `blocked` text ("Choose files first.") and four acts (app) |
| B-7 | no | the bar sits at y=859 below a record whose last section ends y=857: the shot is 881 tall, the bar covers the foot of the list pane only: ok |
| C-1 | yes | |
| C-2 | yes | |
| C-3 | no | "86%" at the end vs name; baselines ok |
| C-4 | yes | |
| C-5 | no | see A-7a |
| C-6 | yes | |
| D-1 | no | the record's most common act, Approve, is a faint icon (blocked "Not ready yet"); for a duplicate the act is Replace or Keep; none is primary. app: state-driven primary (a labelled Replace / Keep both / Reject triple under Verdict) |
| D-2 | no | Replace this track (menu on the match row, with confirm: "the old file goes to the quarantine": good); Reject: confirm. But the replace is under "..." on a row of the match list, where a DJ looks for "Keep this one". Wording "Replace this track" is fine. |
| D-3 | no | the match row's more menu is the only way to act; icon-only; no tooltip visible in the shot |
| D-4 | no | "86%" vs "Score 95" vs "97%"; "MP3 192" vs "MP3 320"; "14.1 MB" ok; "20.0 kHz" |
| D-5 | yes | |
| D-6 | no | "Verdict", "Decision", "Spectrum", "Fingerprint ... fpcalc (Chromaprint)", "Hash", "Replace" vs "Better copy" (DECISION) vs wishlist "better copy": ok; "Same audio / Sounds the same / Same artist and title": good plain words |
| D-7 | no | see A-4c |
| D-8 | n/a | |
| D-9 | no | one record with four sections; the match, the decision, is last and below the fold of a 1080 px screen |
| E-1 | no | the record leads with the pipeline's status and not with "what to do": the question "Is this a duplicate of what I own, and which is better?" is answered in Verdict (a sentence) and the match row (below). app |
| E-2 | no | duplicate: 3 presses: the match row's menu (1), "Replace this track" (2), confirm (3); keep: bar more (1), "Keep it anyway" (2); reject: more (1), Reject (2), confirm (3). The three commonest decisions hide in two different menus. app |
| E-3 | no | after Replace the toast "Running the pipeline again" (wording says nothing about replacing) with no `to`; after Reject `to: "/inbox"`. app |
| E-4 | yes | Replace and Reject confirms state the quarantine and the moves; History noted on the bulk approve |
| E-5 | no | no link from the record to the download it came from or the want it satisfied; none to the resulting library track; the Pipeline has no link to Jobs. app |
| E-6 | n/a | |
| E-7 | no | the choice between the incoming file and the library's copy: incoming (pills at top) MP3 320, 6:12, 14.1 MB; library (match row meta) "Another version · MP3 192", 86%: no length, size, tags, cues, playlist count of the existing track (what "playlists, tags and rating move over" would move: unknown); no side-by-side; recommended not marked (the decision's `better-than-existing` chip exists but this verdict is "Review"); preview: none. The spectrum row ("content reaches 20.0 kHz, in line with 320 kbps") is a good fact. app |
| E-8 | no | a failed step has the reason in meta; the only fix is "Try again" in the bar's more menu |
| E-9 | no | no shortcuts shown (a for approve, r for reject) in a screen made of repeated decisions; the list's keyboard is stack's |
| E-10 | no | see inbox |
| F-2 | yes | Tags Table: Tag / In the file, and filed as: kind change: before to after |
| F-6 | yes | tags preview reads before to after: "Genre Tech-House to Tech House" under Tags; it does not say how many tracks (one file): n/a |
| G-1 | no | noun "file": "Couldn't find this file." fine; bar: Approve first, Keep, Try again, Reject in more: Approve stands blocked while the decision act is hidden |
| G-2 | no | the Tags Section holds a Table inside a Section: allowed ("a table's rows"): yes |
| G-3 | no | Pipeline rows: leading icon (Hash, Fingerprint, Copy, Wand), name, then dot+word+reason on the second line: yes V9; the Hash glyph "#" is also the type mark for a tag in the voice (`#`): two meanings for `#`. app |
| G-4 | no | see A-5b |

Top three: (1) the decision (Replace / Keep / Reject) is in two menus with no side-by-side of the incoming file against the library copy, and the match is the last section; (2) the selection bar's text overlaps itself when a record is open (inbox/$itemId/data-1920.png 244-380,859); (3) jargon ("Fingerprint: needs fpcalc (Chromaprint) on the hub", "Verdict") and fact counts on definition lists ("VERDICT 3").

## Across the group

Inconsistencies between the group's screens (C1b, G4, D6)
- Two or three words for "something here needs you": inbox state "Needs you" with verdict chip "Review" (inbox/data-1920.png row 3, inbox/$itemId/data-1920.png), import "Not sure" (import/$importId/data-1920.png), wishlist "Found" (wishlist/data-1920.png), and the sidebar page "Review" (auto-tag proposals, every shot's sidebar). "Review" means a different thing on each.
- Four names for a different mix: import chip "Other mix", import filter "Other mix in the library", inbox match "Another version", candidates chip "Another version in the library".
- State is a dot-and-word on lists (wishlist "Found", inbox "Ready", downloads "Failed") but a soft-filled chip with four hues on import (import/$importId/data-1920.png "In the library / Missing / Not sure") and an outlined fact pill on records ("Found" in wishlist/$wantId/data-1920.png, "Needs you" in inbox/$itemId/data-1920.png). Source and verdict share the same outlined chip with a dot ("Spotify" in wishlist, "Review" in inbox).
- Match quality in four shapes: "Score 95" (candidates, first in meta), "86%" (inbox match, at the end), "97%" (import, after the name), "Best match 95" (wishlist row).
- Relative time: stack's age "30 min", "1 hr" against the app's `until()` "in 30 min", "in 2 h" (ui/acquire.ts:436); the wishlist row shows both meanings on one screen ("30 min" age on the import row, "in 30 min" next search on a want row, unlabeled).
- The same fact-stack rows: downloads shows the peer as plain meta, inbox as the "From" chip, candidates as "dj_wax · free slot".
- Empty forms: only the Imports empty and the inbox match empty carry a specific sentence; all others use "Nothing here yet." and none carries the outlined act the form requires (V15).
- Acquisition nav is split: Inbox under LIBRARY, Search / Wishlist / Downloads under DISCOVER, Review under CURATE.

Stack findings
- Pane (pane/index.tsx:80 `MEASURED`): every list page without `wide` caps its body at the reading width (720), which pushes a Table below its `tablet` width so it renders only as rows; the prop's doc names only "a Canvas, a code Diff". All five list pages here show it (shots: search, downloads, wishlist, inbox, import data). Fix in stack: make a Pane with a Table child wide automatically (V17 "a list page is `wide`") or document `wide` for Tables; app then sets `wide`.
- Table in row form hides hidden columns with no way back: the Size, Time and Folder of the candidates (candidates.tsx:233-241) and Last search/Added of wants are unreachable below `tablet` (columns menu exists only in the grid). Fix: the row form gets the columns menu, or `hidden` applies to the grid only.
- Table `select` bar: with a record open (pane 480 px) its "N of M chosen", the `blocked` message and "Select all" overlap (inbox/$itemId/data-1920.png at 244-380,859). The bar needs to wrap or drop the message when narrow; it also draws "Select all" at 1920 and draws itself with "0 of 0 files chosen" on an empty table (inbox/empty-1920.png), where it should not stand.
- Section counts rows that are facts (`VERDICT 3`, `SEARCH 2`): the count should skip definition rows (no count where the rows are labels).
- Section with no title and no items draws the generic "Nothing here yet." (import/$importId/empty-1920.png top box): absent facts should say nothing; an untitled warning Section should draw away.
- Toolbar over a Table: a 46-48 px gap with the picker on its own band (wishlist/data, inbox/data, import/data), not bare on the table (V3).
- Form blocked submit draws as a neutral grey button, not the primary dimmed (search/data-1920.png 889,184); the blocked reason "Type a value" sits left of it.
- Row titles draw in the sans; V7/V9 ask the mono for names and the shots show the mono only where the app passes `{ code }` (the "Goes to" path in inbox/$itemId/data-1920.png). Confirm with the owner whether the voice or the component is right.
- Record Pane `actions`: only the first act stands, as an icon, so a record with a primary next step (import, inbox duplicate) cannot show a labelled act; the next step lives in the more menu.
- `facts` on a record head are always plain pills, so a state cannot be drawn as its state pill.

UX: the chain as the DJ walks it (E5), where it breaks
1. Want a track: Wishlist's bar offers "Add a track" (icon); "Import a playlist" is behind "...". Search has no link to the wishlist and its first-run state is a lone form.
2. Search: the form works in two presses; the candidate Table (not shot) hides size and length by default, has no recommended mark, repeats facts in "Why", and after Download offers no next step (no `to`).
3. Downloads: the queue shows state and progress as text, no summary, raw slskd error ("Completed, TimedOut"); the finished row's inbox icon is the one forward link; the row does not name the want.
4. Inbox: no summary of "N ready / N need you"; every row repeats state and verdict; fast approve is an unlabeled double-check icon without a count; the selection bar shows four disabled acts and "Choose files first." permanently, and overlaps itself beside a record.
5. Deciding a duplicate: the record leads with pipeline steps and the library match is last; Replace, Keep and Reject sit in two menus; there is no side-by-side of incoming file against the library copy, and no preview.
6. After filing: no link to the new library track; the want that began the chain is not marked in the record or Downloads.
7. Import to wishlist: the result page's two finishing acts are an icon and a menu item; only 5 imports are listed on the wishlist and the rest are unreachable; missing rows have no direct "search now".

Not checked: loading, error and not-found frames for these screens (not shot), the search results Table and its job Banner (search/data has no `s`), the dock, 320/touch/light, and the shift log for banners; no PNG of the library was readable at its size so B1 was confirmed from source (no Pane sets `wide`) and these screens' shots.
