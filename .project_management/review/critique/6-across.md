# Across all screens (consistency, information architecture, one product)

Shots read (all opened): library, library/$trackId, recent, recent/$trackId, playlists/$playlistId, index (viewport-1920x1080); settings viewport-1, viewport-2; data-1920 of inbox, inbox/$itemId, duplicates, review, issues, organiser, rules, quarantine, genres, tags, aliases, search, wishlist, wishlist/$wantId, downloads, import/$importId, devices, devices/conflicts, history, history/$batchId, jobs, backups, stats, sets, playlists, sign-in, connect/consent, connect/organization; empty-1920 of duplicates and downloads.
Source read: src/app/routes/_app/route.tsx (sidebar), every route's Pane/Section titles, lib/library.tsx, lib/playlists.tsx, and stack's Pane (`node_modules/@fcalell/plugin-react-ui/src/ui/components/pane/index.tsx`), voice.md.
Not shot / not judged: 320 px, light mode, touch (one note, not repeated). Fixture data is synthetic.

## 0. The one finding that colours everything

No route passes `wide` to its Pane (`grep wide src/app` = 0 hits). Stack's Pane caps the body at the 720 px reading measure unless `wide` is set (pane/index.tsx:271-272, `!wide && MEASURED`). voice.md V17: "a list page is `wide`". Result at 1920: every list, table, sheet and form ends at x = 964 (sidebar 220 + inset 24 + 720). Worse, the library, inbox, review, playlist and conflicts screens are `Table`s with columns (lib/library.tsx:24 LIBRARY_COLUMNS: Title, Artist, Mix, BPM, Key, Genre, Rating, Time, Energy...). At 720 px the Table collapses to two-line rows, which is why the library shows "Kalomi · BPM 120 · 8A · House · Time 5:00 · Energy 1" (the column labels are printed inside the meta line) instead of a sortable grid with a frozen name, figure columns and a columns menu. The product's headline promise (50k tracks, sort, scan by column) is not drawn at 1920. Fix: **app**, `wide` on LibraryPane, the playlist record Pane, Inbox, Review, Conflicts, Duplicates, History, Jobs, Downloads, Wishlist, Devices. Stack follow-up: **stack**, a Table inside a non-wide Pane silently becomes rows; either warn or let a Table lift the measure itself.

## 1. Information architecture (E10)

Sidebar as drawn (route.tsx:36-104, plus `usePlaylistPlaces`): 6 groups, 22 static places plus a data-driven Playlists group (3 rows in the fixture: All playlists, folder House, smart "Fresh 124 to 128").

| Group | Places | Count |
| --- | --- | --- |
| LIBRARY | All tracks, Recently added, Inbox, Set builder, Stats | 5 |
| PLAYLISTS | All playlists, folders, playlists (from data) | 1 + n |
| CURATE | Issues, Duplicates, Organiser, Review, Cleanup rules, Quarantine | 6 |
| TAGS | Genres, Custom tags, Aliases | 3 |
| DISCOVER | Search, Wishlist, Downloads | 3 |
| SYSTEM | Devices, History, Backups, Jobs, Settings | 5 |

Label = Pane title: yes for 21 of 22 (All tracks, Recently added, Inbox, Set builder, Stats, Issues, Duplicates, Organiser, Review, Cleanup rules, Quarantine, Genres, Custom tags, Aliases, Search, Wishlist, Downloads, Devices, History, Backups, Jobs, Settings). One miss: sidebar "All playlists" (lib/playlists.tsx:80) vs Pane title "Playlists" (playlists.tsx:164; shots/playlists/data-1920.png bar reads "Playlists"). **app**, rename the place "Playlists" or the Pane "All playlists".

Where would a DJ look?
- Review: they would look in Inbox (arrivals) or Tags (it is auto-tag proposals: "Beatport / Added Tech House · Genre · Sure 93%"). It sits in CURATE next to Organiser. "Review" alone does not say what is reviewed; Settings text even says "what they agree on waits in Review" (settings.tsx, Auto-tag description). Two approval queues (Inbox: Approve; Review: Accept) live in two groups.
- Inbox: in LIBRARY, but its feeders (Search, Wishlist, Downloads) are in DISCOVER, three groups away. shots/downloads/data-1920.png "In the inbox · bassline · 29.6 MB" links to a place in another group; the acquisition chain Search > Wishlist > Downloads > Inbox > Review is split across DISCOVER, LIBRARY, CURATE.
- Downloads: DISCOVER, reasonable, but it is a transfer queue like Jobs (SYSTEM).
- Rules ("Cleanup rules"): CURATE, fine; but Genres/Aliases/Custom tags (TAGS) are the same job (normalise tags) and "Unify" is run from three screens (Genres, Aliases, Rules each have a "Preview" + banner act).
- Organiser: CURATE, fine.
- Jobs, History: SYSTEM. History is the undo log the vision promises on every act (principle 2); it is as far from the act as possible. Quarantine (the other undo) is in CURATE while History is in SYSTEM: the two safety nets are in different groups.
- Set builder: in LIBRARY, but it builds a playlist ("Save as a playlist"); belongs with PLAYLISTS.
- Stats: LIBRARY is the list of ways to see tracks; Stats is a report. Low harm.
- Devices: SYSTEM, but it carries Rekordbox sync and Conflicts, a DJ-chain task.
- Settings holds the Soulseek, Inbox, Auto-tag, Backups, Offsite sections, so "Backups" place and "Backups" settings section both exist (backups.tsx "Offsite storage is not set up. The bucket and keys are in Settings.").
- Import record (`/import/$importId`) is reachable only from Wishlist (bar "Wishlist / Warm-up Friday", shots/import/$importId/data-1920.png) while the sidebar highlights nothing, and its bar is the only one with a back arrow at 1920.

Verdict: the grouping has real problems, two of them structural (the acquisition chain is cut into three groups; the two safety nets are in two groups; Review's meaning is hidden). Proposed (same 6 groups, 22 places, no new surface):

| Group | Places |
| --- | --- |
| LIBRARY | All tracks, Recently added, Stats |
| PLAYLISTS | Playlists (all), the tree, Set builder |
| ACQUIRE | Search, Wishlist, Downloads, Inbox (in pipeline order; Inbox carries the count of files waiting) |
| CLEAN UP | Issues, Duplicates, Organiser, Cleanup rules, Quarantine |
| TAGS | Genres, Custom tags, Aliases, Auto-tag review (today "Review") |
| SYSTEM | Devices, Jobs, History, Backups, Settings |

Why: it follows the vision's own chains (acquisition, cleanup, DJ) and puts Review next to what it fills. Tag **app** (PLACES array only). Also **stack**: the sidebar draws no count or badge for work waiting (Inbox 3, Review 3, Conflicts 3, Duplicates 2 are all invisible until opened); a `PlaceSpec` count would make the sidebar the dashboard the product lacks. No landing page: `/` redirects to /library (routes/index.tsx), so "what state is my library in" is never answered on one screen; Stats is the nearest.

## 2. Consistency matrix (C1b, C1d, G3, G4, D4, D6)

### 2a. Per screen

| Screen | Page title | Primary (filled) act visible | Section heading form | Empty sentence form (source) |
| --- | --- | --- | --- | --- |
| All tracks / Recently added | All tracks / Recently added | none filled; bar: Scan now (icon); foot: "Edit tags" soft | none (Toolbar + Table) | n/a (library empty shot not opened) |
| Library record | "All tracks / Lunar Ritual (Extended Mix)" | none; Play icon | UPPERCASE: WAVEFORM, COVER, ANALYSIS 4, ISSUES (count only on some) | "Nothing to fix." |
| Inbox | Inbox | foot "Approve" (disabled-looking soft, 0 chosen) | none | "No ..." |
| Inbox record | Inbox / name | tick icon | VERDICT 3, PIPELINE 4, TAGS, IN THE LIBRARY 1 + description | "The duplicate check has not run yet." |
| Duplicates | Duplicates | none; icon search | list bands "Same audio - 2 tracks 2" (count twice) | "No duplicates found. Find duplicates to search the library." (shots/duplicates/empty: sentence only, no button) |
| Review | Review | foot "Reject" soft; "Accept" soft | none | n/a |
| Issues | Issues | none (play icons) | BY ISSUE 4, HEALTH CHECKS 2 | "Nothing to fix." |
| Organiser | Organiser | **"Preview" filled blue** (inside the Template form) | TEMPLATE + description, PRESETS 5, PREVIEW (no count) | n/a |
| Cleanup rules | Cleanup rules | none; banner link "Apply to the library" (green text) | RULES 2 + 2-line description, PREVIEW | "No rules yet." |
| Quarantine | Quarantine | none | none | n/a |
| Genres | Genres | none; banner "Unify the library" | NOT IN THE TAXONOMY 2 + description, TAXONOMY 2, UNIFY PREVIEW | "Every genre in the library is known." / "No genres yet." |
| Custom tags | Custom tags | none; + icon | none | "No custom tags yet. Make one, then put it on tracks." |
| Aliases | Aliases | none; banner "Unify the library" | ARTIST SPELLINGS TO MERGE 1, ARTIST ALIASES 1, LABEL SPELLINGS TO MERGE 1, LABEL ALIASES 1, UNIFY PREVIEW | "No artist is spelled two ways." / "No artist aliases yet." |
| Search | Search | "Search Soulseek" soft (disabled) | FIND A TRACK + description | n/a |
| Wishlist | Wishlist | none; + icon | IMPORTS 1 | "Imported playlists show here." |
| Want record | Wishlist / name | search icon | SEARCH 2, CANDIDATES + description | n/a |
| Downloads | Downloads | none | none | shot: "Nothing here yet." (stack default) although source has "No downloads yet. Search Soulseek, or let the wishlist find what you want." (downloads.tsx:87) |
| Import record | Wishlist / Warm-up Friday | none | none | n/a |
| Devices | Devices | none; + icon | none | "No devices yet. Pair a machine ..." |
| Conflicts | Conflicts | foot "Keep TrackVault" soft | none | n/a |
| History | History | none | none | n/a |
| Jobs | Jobs | none | none | "No jobs yet. A scan of the library shows here while it runs." |
| Backups | Backups | none | NOW 2 + description, SCHEDULE 2, ON THIS HUB 3 + 2-line description, OFFSITE 2 + 2-line description | "Nothing running. The next backup is ..." |
| Stats | Stats | none | charts: TEMPO / "44.1K tracks" (heading + value line); lists: GENRES 6, FORMATS 3 | "Plays arrive from Rekordbox." |
| Set builder | Set builder | none; save icon | FIND 3, ENERGY / "21 energy", SET 3, NEXT 3 | "Search the library to add a track." |
| Playlists | Playlists | none; + icon | none (tree sheet) | "No playlists yet. Make one, then drag ..." |
| Playlist record | Peak time | none; pencil icon; foot "Remove from playlist" soft | none | n/a |
| Settings | Settings | none (field commits) | LIBRARY, SOULSEEK, INBOX, AUTO-TAG ... + one-sentence description each | n/a |
| Sign-in | Sign in (h1 in page) | "Continue" soft (disabled) | n/a | n/a |
| Connect consent | Connect a client | **"Allow" filled** | n/a | n/a |
| Connect organization | Choose an organization | none (row is the act) | n/a | "You belong to no organization." |

Findings from 2a:
- Primary act (D1): only Organiser "Preview" and consent "Allow" are filled in the shots. The three screens whose whole point is one act (Rules "Apply to the library", Genres/Aliases "Unify the library", Organiser "Move the files") draw it as green banner text, not the primary; the Organiser has a filled "Preview" and a text-link "Move the files" in the same page, i.e. the wrong one is filled (the preview is the safe step, the move is the real act). **app**: shots/organiser/data-1920.png vs shots/rules/data-1920.png.
- Section heading form (C1d): uppercase 12 with a faint count is the form, but (1) count present on some and absent on others in one screen (Organiser: TEMPLATE, PRESETS 5, PREVIEW; Settings none); (2) Stats chart headings are a second form, uppercase label then a bold value line "44.1K tracks", "50K tracks", "21 energy" (a total that is not the count of anything: "Tracks added per month ... 8,526 tracks" while the header cell says 50,000 tracks); (3) Duplicates and Genres use list bands with the count twice ("Same audio - 2 tracks  2"); (4) descriptions are one line on some, two wrapped lines at 440 px on others (Rules, Genres, Backups OFFSITE) because the description column is narrower than the sheet; (5) Settings' descriptions repeat as sentences ("Where the hub finds your music.") whereas other screens have none.
- Empty sentences: four forms. "No X yet." (rules, genres, aliases) / "No X yet. Do Y." (playlists, devices, downloads, backups, tags, jobs) / "X show here once Y" (stats genres: "Genres show here once tracks carry them.") / "Plays arrive from Rekordbox." / bare "Nothing to fix." And stack's default "Nothing here yet." appears in shots/downloads/empty-1920.png in place of the app's sentence. voice V15: one sentence over its act as an outlined button, centred: none of the shots opened shows the act button (duplicates empty: "Find duplicates to search the library." as plain text; the act is up in the bar as an icon). **app** wording, **stack** for the missing button when `empty` has no act.

### 2b. Track row (G3)

| Where | Leading | Title | Meta (in order) | End group |
| --- | --- | --- | --- | --- |
| Library, Recently added (library/data, recent/data) | checkbox | "Title (Mix)" only | Artist · BPM 120 · 8A · House · Time 5:00 · Energy 1 | age ("3 sec"), Play icon |
| Library record pills | none | name 20 mono, artist as overline | pills: MP3 320, 5:03, 123 BPM, 11B, Deep House | - |
| Playlist record (playlists/$playlistId) | checkbox | "Title (Mix)" | same as library | age, "..." more (no Play icon) |
| Set builder FIND/SET/NEXT | note glyph (Find, Next, Set numbered "1.") | "Title" (no mix) | Artist · 125 BPM · 9A · Energy 6 (+ "86% from the last", reasons) | + / x / ... , % score |
| Stats most/least played | note glyph | "Title" | Artist | play count |
| Inbox | checkbox | "Artist - Title (Mix)" | state dot+word, kind pill, then "new track · MP3 320 · Time 6:12 · Soulseek · Tech House/Kalomi - ... .mp3" (wraps to 3 lines) | age, tick, more |
| Duplicates | tick (keeper) / copy glyph (duplicate) | "Artist - Title" | MP3 320 · 6:12 · Keeper: kept higher bitrate (320 vs 192 kbps) | more |
| Review | checkbox | "Artist - Title (Mix)" | provider pill, "Added Tech House · Genre · Sure 93%" | tick, more |
| Wishlist | none | "Artist - Title (Mix)" | state dot+word, source pill, "Searches 2 · Best match 95" | search, more |
| Candidates | none | file name | "Score 95 · MP3 320 · dj_wax · free slot · title and artist match · format mp3 320 · free slot" | download, more |
| Import record | none | "Artist - Title" | state pill (In the library / Missing / Not sure), match "... · 97%" | tick, more |
| Downloads | download glyph | "Artist - Title" | spinner/dot + state, user · "41% of 14.1 MB · 469 KB/s" | age, x / inbox / retry |
| Quarantine | none | "Artist - Title" | "House/Kalomi - Midnight Echo.mp3 · Days left 29" | age ("1 day"), restore, more |
| Conflicts | checkbox | "Artist - Title (Mix)" | source pill, "House -> Disco · Genre · DJ Mac" | age |
| Organiser / Rules / Genres / Aliases / History batch previews | none | "Artist - Title (Mix)" | "Tech-House -> Tech House · Genre" | none |

Inconsistencies (each with both shots):
1. Title form: library/recent/playlist/set builder/stats split "Title" + artist-in-meta; inbox/duplicates/review/wishlist/import/downloads/quarantine/conflicts/previews join "Artist - Title". Same track "Midnight Echo": shots/library/viewport-1920x1080.png "Midnight Echo (Extended Mix)" over "Kalomi · ..." vs shots/inbox/data-1920.png "Kalomi - Midnight Echo (Extended Mix)" vs shots/sets/data-1920.png "Velvet Signal" with no mix. Set builder and stats drop the mix name, so "Velvet Signal (Original Mix)" and "(Extended Mix)" are indistinguishable (sets Next rows list "Velvet Signal" twice). **app** (one `trackRow()` helper in lib/).
2. Leading mark: checkbox (library, inbox, review, conflicts, playlist), nothing (wishlist, quarantine, import, previews), note glyph (sets, stats), download glyph (downloads), tick/copy (duplicates). Voice V9: type mark, dot, avatar or cover; the library shows no cover though `hasArt` exists (the dock has the art). **app**.
3. Meta order and labels: library "BPM 120 · 8A · House · Time 5:00 · Energy 1" (column label prefixed, "Time" for duration); set builder "125 BPM · 9A · Energy 6" (unit suffixed, no genre, no time); inbox "MP3 320 · Time 6:12"; duplicates "MP3 320 · 6:12" (bare); pills "5:03" and "123 BPM". Duration: "Time 5:00" / "5:00" / "5:03" / "6:12". BPM: "BPM 120" / "123 BPM" / "125 BPM" / "126 to 127 bpm" (lowercase, sets Next reasons) / "100 BPM" (stats axis). **app** (and the "BPM 120" form is a **stack** artefact of collapsed Table cells printing "Label value").
4. End group order: library = age + Play; playlist = age + more (no play); inbox = age + tick + more; review = tick + more (no age); wishlist = search + more (no age); duplicates = more only; quarantine = age + restore + more; downloads = age + act. Age is present or absent without logic; "Play" exists only on library rows although a DJ plays from playlists, inbox, set builder and duplicates (E9). **app**.
5. Row heights: inbox rows 3 lines (88 px), duplicates rows 2 lines, library 2 lines: C3c "a name, one meta, one end group". The inbox row carries state + kind pill + 4 facts + the target path; the path wraps to a third line. **app**.

### 2c. Pills and chips (G4)

| Style | Used for | Where |
| --- | --- | --- |
| Outlined fact pill, no dot | facts of a record | library/recent record (MP3 320, 5:03, 123 BPM, 11B, Deep House), inbox record, want record ("Found", "2 searches", "Wants any copy"), import record ("40 tracks", "24 in the library") |
| Outlined pill with dot (compact) | a source/provider | review "Beatport", wishlist "Spotify", conflicts "TrackVault"/"Rekordbox", history "You"/"Scan"/"Rules" (the actor) |
| same compact pill with dot | a decision/kind | inbox "New track", "Duplicate", "Review" |
| same compact pill with dot | a match status | import "In the library" (green), "Missing" (red), "Not sure" (amber); candidate "Another version in the library" (green) |
| Bare dot + word (no pill) | a state | inbox "Ready"/"Needs you"/"Duplicate", wishlist "Found"/"Wanted", history "Applied"/"Undone", devices "Online"/"Offline"/"Revoked", jobs, downloads, backups "Checked" |
| Soft-filled state pill | none seen | (V12 says a state is a soft-filled pill; no shot has one) |

Inconsistencies: (a) the dotted compact pill means source in Review/Wishlist/Conflicts/History, kind in Inbox, status in Import; (b) a state is a bare dot+word on every list but a pill in Import ("Not sure"), and a fact pill in the record ("Found" in want record = outlined, no dot, whereas the list row has a blue dot "Found"); (c) inbox row shows "Duplicate" twice, once as state ("Duplicate", amber dot) and once as kind pill ("Duplicate", grey dot) in shots/inbox/data-1920.png; (d) dots vary in hue for the same state word: inbox "Ready" blue, wishlist "Found" blue, downloads "In the inbox" green, jobs "Done" green. Fix: one meaning per style: fact = outlined no dot; state = bare dot+word in lists, soft pill in records; source/actor = outlined with the provider's glyph. **app** for the choices, **stack** for the missing soft state pill.

### 2d. Figure formats (D4)

| Figure | Forms seen |
| --- | --- |
| BPM | "BPM 120" (library rows), "123 BPM" (record pill), "125 BPM" (sets), "126 to 127 bpm" (sets Next), "100 BPM" (stats axis), "126 BPM" (record Analysis "Tempo") |
| Key | "8A" Camelot everywhere; stats label "Tracks by Camelot key", heading "KEYS"; sets reasons "8A to 9A: adjacent" |
| Duration | "Time 5:00" (library), "5:03" (pill), "Time 6:12" (inbox), "6:12" (duplicates), "4,583 hours" (stats), "range 5.2 LU" |
| Size | "14.1 MB", "29.6 MB", "31 MB", "383.7 GB free", "21.4 GB left", "550 GB" (stats, with unit as a separate small cell label "GB") |
| Bitrate | "MP3 320" (everywhere, good), "320 vs 192 kbps" (duplicates), "64 kbps more" and "kbit/s" and "kbps" (settings: "kbit/s", "kbps"), "FLAC 16 bit 44.1 kHz", "MP3 128" |
| Counts | "48210" (library bar "0 of 48210 tracks chosen") vs "48,210" (issues "of 48,210 checked", sets); "6200", "1900", "211" (issues); "9000", "41000", "6000" (stats lists) vs "50,000", "8,200" (stats cells); "Changes 1880" (history). Each route re-declares `new Intl.NumberFormat("en")` (genres, playlists, devices, backups, organiser, tags, aliases, rules: 8 copies) and issues/stats/history/library do not use it. **app**: one `count` in lib/. |
| Ages | "3 sec", "10 min", "1 hr", "1 day", "2 days", "3 mths" (abbreviated "mths" next to "days"), "30 sec" |
| Dates | backups only absolute: "Tue, Nov 3, 06:48", "Next backup Wed, Nov 4, 06:48" (no year); stats "2025-01" / "2025-12" ISO; everywhere else relative ages |
| Scores/percent | "Sure 93%", "97%", "86% from the last", "Score 95" (no %), "Best match 95" (no %), "92%" (sets), "Lowest score to download 75" (settings), "(88% sure)" (record) |

Right-aligned tabular figures (D4): none can be judged in the library because it is not drawn as columns (see 0). Issues/Stats counts are right-aligned and unformatted.

## 3. Width use at 1920 (B1, B2)

Canvas = 1920 - 220 sidebar = 1700 px.

| Screen | Content right edge | Blank beside it | Should be wide? |
| --- | --- | --- | --- |
| All tracks, Recently added (no record) | 964 | 956 px (56% of canvas), toolbar and "Sort" also stop at 964 | **Yes, the main case**: full-width Table with columns |
| Library/Recent record open | list pane 220-740, record content 1484 | 436 px right of the record, list pane 520 px | list pane should be wide-table narrow list OK; record fine at 720 |
| Inbox | 964 | 956 | Yes (table with columns Track, State, Format, Length, Source, Target) |
| Inbox record | list 715, record 1484 | 436 | record OK |
| Duplicates | 964 | 956 | Yes (the comparison "keeper vs duplicate" wants columns: bitrate, size, tags side by side) |
| Review | 964 | 956 | Yes (Table already declares COLUMNS: Track, Field, Change, Source) |
| Issues | 964 | 956 | no (short list) |
| Organiser | 964 | 956 | preview list yes (before/after path columns) |
| Cleanup rules, Genres, Aliases, Custom tags, Quarantine | 964 | 956 | no, except Quarantine and the previews |
| Search, Wishlist | 964 | 956 | Wishlist list and Search results yes |
| Want record | list 715, record 1484 | 436 | OK |
| Downloads | 964 | 956 | yes (progress, speed, peer, size as columns) |
| Import record | 964 | 956 | yes (a 40-row match table) |
| Devices | 964 | 956 | no |
| Conflicts | list 715, conflicts 1484 | 436 | yes, before/after need width |
| History, history batch | 964 / list 715 + 1484 | 956 / 436 | batch (1880 changes) yes |
| Jobs | 964 | 956 | no |
| Backups | 964 | 956 | no |
| Stats | 964 (cells), charts end at 736 | 956; charts leave a further 228 px unused inside their own 964 column | cells: yes (one band of figures could span 1700); charts should fill the column |
| Set builder | 964 | 956 | yes: Find / Set / Next side by side is the product's natural 3-column layout |
| Playlists | 964 | 956 | no |
| Playlist record (`$playlistId`) | list 715, tracks 1484 | 436 | the track list is a Table: yes |
| Settings | 964 | 956 | no (forms stay narrow) |
| Sign-in / consent / organization | centred 400 px column (760-1160) | 760 left and right | fine (Gate) |

B2: with a record open beside a list, the Panes are list 520 + record 1180 with the record's content stopping at 720 inside it: the right 436 px is dead canvas on library, recent, inbox, want and history. A third Pane never opens at 1920 although voice V17 gives three from `wide`.
B5: the library selection bar with a record open overlaps ("Find duplicates" drawn over "0 of 48210 tracks chosen", shots/library/$trackId/viewport-1920x1080.png and recent/$trackId); the inbox record overlaps three texts ("0 of 3 files chosen" / "Choose files first." / "Select all" / "Keep it anyway" garbled in shots/inbox/$itemId/data-1920.png at the foot). **stack** (selection bar does not wrap at 520 px).

## 4. Glossary (D6)

Domain terms on screens and sidebar, with flags:

| Term (where) | Flag |
| --- | --- |
| track / file (Inbox "Choose files first", "0 of 3 files chosen" vs library "tracks chosen"; Quarantine "Quarantined files"; Duplicates "Same audio - 2 tracks") | a DJ's word is track; "file" is right only before it is filed. Quarantine rows are tracks that left the library but the Pane says files. Consistent rule needed: file until approved, track after. |
| library / hub / collection ("Library folder", "the hub's PATH", "On this hub", "the library") | hub is jargon for the server; Backups says "ON THIS HUB", Settings "Browse the hub's folders", Duplicates banner "on the hub's PATH". Say "this server" or "TrackVault"; "PATH" is developer jargon. |
| Inbox / Review / Downloads / Wishlist / Import / Want | "want" (Wishlist filter "Every want", route `$wantId`, "Wants any copy", "Wants a better copy"): jargon, say "wish" or "track on the list". "Imports" section on Wishlist vs "Playlist import" (Settings) vs "Import a playlist" (act) vs "Imported playlists show here." |
| Review | the sidebar word vs content ("Proposals", "Accept", "Reject every waiting field?") : a DJ hears "Review" as a general queue; it is Auto-tag. Settings calls it "Auto-tag" and "Review" in one sentence. |
| Custom tags vs Tags vs Tag | sidebar "Custom tags", group "TAGS", Pane "Custom tags", row "Tag renamed"/"Tag added", Rules "Tags it touches"/"Set a tag"/"Tag to set", Jobs "Tag write", "Edit tags", Library bar "Edit tags", settings "Tag new files in the inbox". "Tags" means ID3 metadata in Rules/Jobs/Library and Peak time/Warm-up in Custom tags. Two meanings in one group heading (TAGS contains Genres and Aliases, which are metadata tags, and Custom tags, which are DJ labels). Vision calls them "My Tags". |
| Cleanup rules vs Rules | Pane "Cleanup rules" (route /rules), Section "RULES 2" inside it, Jobs "Cleanup rules", Library bar "Apply rules", banner "Apply the cleanup rules?", PREVIEW banner "Apply to the library". Three names for one thing. |
| Unify / Unify preview / Unify tags / Unify the library | jargon verb; the user's thought is "merge spellings" / "tidy genres". Used in Genres, Aliases, Jobs ("Unify tags"). Aliases sections "ARTIST SPELLINGS TO MERGE" vs "ARTIST ALIASES" read as the same thing. |
| Taxonomy ("NOT IN THE TAXONOMY", "TAXONOMY") | jargon; "Genre list" / "Genres not in your list". |
| Aliases | "Alias" is jargon for "spelling that maps to". Genres screen shows "Tech-House / Alias" rows and also exists as a place called Aliases (artist/label only): two meanings of Aliases. |
| Organiser / Organise (Jobs, Library bar) | British spelling in the UI with American "organization" in Connect ("Choose an organization") and "Analyse" (library bar, settings "Analyse new tracks"): pick one. |
| Quarantine | good but unfamiliar; "Days left 29" (days left before purge) read as a label with a number, no unit "days". |
| Keeper (duplicates "Keeper: kept higher bitrate") | fine, but "Keeper:" prefix then "kept" is a double. |
| Fingerprint / fpcalc / Chromaprint / ffmpeg / spectrum / "Measure the spectrum" / "Decode every file" / "Fake bitrate" | DJ-unknown jargon: Duplicates banner "Without fpcalc on the hub's PATH ..." (shots/duplicates/data-1920.png), Inbox record "Idle needs fpcalc (Chromaprint) on the hub", Issues "ffmpeg could not decode the file to its end", "The audio ends where a lower bitrate's does", Library record "The waveform is drawn after a scan, with ffmpeg on the hub." Name the effect ("Similar-sounding tracks are not found until fpcalc is installed") and leave tool names to Settings. |
| Replica / agent / Devices / DJ Mac / "Rekordbox writes wait for verification" / "41 tracks not matched" / "darwin", "win32" | "replica" and raw OS ids ("darwin · djs-macbook", "win32 · booth", shots/devices/data-1920.png) are jargon; DJ says "copy" and "Mac"/"Windows". Device meta is a 3-line wrap of 6 facts. "Revoked" vs "Forget" acts. |
| Playlist / Set / Smart / Crate | Playlists vs Set builder: "Save as a playlist" turns a set into a playlist; "Fresh 124 to 128" smart playlist is "Smart" kind; no "crate" (good). A set is a draft playlist; the place is "Set builder" and the record is "Set". |
| Energy ("Energy 7", "Energy: Keep the energy", "Energy along the set") | fine; 1-10 scale shown without a max. "Mix score 64 %", "Weak steps", "clash", "adjacent" = unexplained. |
| Camelot ("Tracks by Camelot key" chart label; "KEYS" heading; "Key") | fine to a DJ; just use one. |
| Candidates / Score / Best match / "free slot" / "queue 12" / "bassline" (a peer name) / "slowpeer" / "Completed, TimedOut" | Soulseek jargon and a raw status string leaks: shots/downloads/data-1920.png "Failed slowpeer · 8.6 MB · Completed, TimedOut". |
| Proposals / "Sure 93%" | "Sure" is odd for confidence; "Auto-tag" Section labelled "Proposals" in source, not in shot. |
| Filters: "Everything open" (inbox), "Show: Waiting" (review), "Every want" (wishlist), "Every track" (import) | four formulas for an all-states picker. |
| "Choose ... first." foot text: "Choose tracks first." / "Choose files first." / "Choose fields first." / "Choose conflicts first." | consistent but "fields" (Review) is jargon: it is a proposed change. |

Terms that differ from the sidebar: "Library" (group) vs "All tracks" (place) vs "the library"; "Wishlist" place vs "wants"; "Cleanup rules" place vs "Rules" section vs "Apply rules"; "Custom tags" place vs "Tags"; "Review" place vs "Auto-tag"/"Proposals"; "Set builder" place vs "Set"; "Discover" group vs "Search" place that finds on Soulseek only (library search is the box on All tracks; "Search" next to "Find a track" and "Search Soulseek" is three names for two searches) ; "Devices" vs "agent" vs "machine" ("Pair a machine"); "Backups" place vs "Backups" settings section.

## 5. The three changes that most make it read as one finished product

1. Lift every list Pane to `wide` and let the library draw as the Table it is (app, plus a stack lint). Today the app's strongest screen is 720 px of two-line rows beside a 956 px black void at 1920 and the vision's 50k-track sort/scan story is invisible. This single prop changes 14 screens (section 3) and removes the selection-bar overlap on record open for most.
2. One track row, one figure vocabulary (app). Extract `trackRow()` and `figures()` in `src/app/lib/` : "Artist - Title (Mix)" or title + artist everywhere (not both), one leading mark, one meta order (key, BPM, duration, genre, quality), one count formatter, one age/date form, and one meaning per pill style (state = dot+word, source = outlined, fact = fact pill). Fixes section 2b-2d in about eight files.
3. Re-cut the sidebar around the three chains and name the places in a DJ's words (app, one array): ACQUIRE (Search, Wishlist, Downloads, Inbox), CLEAN UP, TAGS with "Auto-tag review" replacing "Review", Set builder under PLAYLISTS, History beside Jobs; rename Cleanup rules/Rules and Custom tags/Tags to one name each; drop jargon (hub PATH, fpcalc, taxonomy, unify, replica, want, darwin/win32). Add counts to Inbox, Review, Conflicts in the sidebar (stack `PlaceSpec`) so the product answers "what needs me" without opening each place.

## 6. Other findings (ranked after the three)

4. Primary act is wrong or missing on the safe-act screens (app): Organiser fills "Preview" and leaves "Move the files" as green text; Rules/Genres/Aliases "Apply/Unify" are banner text. Fill the one act that changes the library, and say what undoes it (the confirm text says "Undo the batch in History" but History is the last-but-three sidebar place).
5. Stats (stack): charts fill 736 of their 964 px column and are capped at 12-ish bars with every-nth labels ("100 BPM ... 140 BPM"; "Last month / 3 to 6 months / Over a year" skip 3 of 6 bars in shots/stats/data-1920.png); the heading form "TEMPO / 44.1K tracks" is a second section form; the 5-cell band stops at 964. Stack: BarChart should take the column; label every bar or tick every nth bar.
6. Selection bars (stack): wrap and overlap at 520 px (library record, inbox record), and disabled acts ("Add to playlist ... Organise") stand as 8 soft buttons with no primary; "Choose tracks first." hint stands under them.
7. Empty states (stack/app): V15 says sentence over an outlined act; shots show a sentence alone ("No duplicates found. Find duplicates to search the library." with the act in the bar), and Downloads shows stack's default "Nothing here yet." instead of the app sentence (shots/downloads/empty-1920.png vs downloads.tsx:87; check whether the empty fixture bypasses `empty`).
8. Raw backend strings leak (app): "Completed, TimedOut" (downloads), "darwin"/"win32" (devices), "zstd" (backups: "29.9 MB · 50,000 tracks · zstd · Offsite"), "Changes 1880" (history), "queue 12 · format mp3 320 · free slot" (candidates), "fpcalc", "PATH", "ffmpeg".
9. Playlists place label "All playlists" vs Pane "Playlists" (app, route lib/playlists.tsx:80).
10. Record pages are not one form: library record has no actions beyond play/more and shows a 400 px empty Cover card and an empty-waveform sentence ("The waveform is drawn after a scan, with ffmpeg on the hub.") in the viewport; inbox/want records carry a "state" in the pills; import record has a back arrow instead of a close; playlist record title is the bare name "Peak time" with no "Playlists /" crumb while library/inbox/wishlist records show "All tracks / name" crumbs (shots/playlists/$playlistId/viewport vs library/$trackId/viewport). App.

## 7. Machine/notes

Library `data-1920.png` etc. whole-screen shots (10,000 px) were not opened as instructed; sizes were taken from the viewport shots. Sign-in and consent screens are Gate forms, fine; "Type a value" under an empty Email field is UI-mechanics copy (C4d) shown on sign-in, Search ("Type a value" next to "Search Soulseek") and likely every disabled form bar: **stack**, the disabled reason should name the field ("Enter an email").
