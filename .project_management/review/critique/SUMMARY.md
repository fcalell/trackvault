# TrackVault design critique: consolidated

Run: one `stack screens test --all --state data,empty --mode dark --width 1920 --shots shots`
(35 screens, 70 shots, all machine floors passed), one narrow run for loading/error/notFound on
library, track record, settings and stats, and 1920x1080 viewport plus interaction shots (ticked
rows, playing) from one `stack screens dev`. Shots: `~/projects/trackvault/apps/hub/shots/`
(gitignored). Checklist: `CHECKLIST.md`. Group reports, item by item: `1-library.md`,
`2-acquire.md`, `3-cleanup.md`, `4-tags-history.md`, `5-system.md`, `6-across.md`.

Verified by the orchestrator against source/shots: S1, S2, S4, S5, S6; A1; the unify preview
sharing (A9); settings "Optional" (S4); chart width (S6).

## Stack: structural fixes (each clears findings on many screens)

| # | Finding | Evidence | Fix in stack |
|---|---|---|---|
| S1 | A list page never gets the width. `Pane` caps its body at the 720 px reading measure unless `wide`, and `wide` is undocumented in rules/reference (the doc names Canvas/Diff only), while voice 17 says "a list page is `wide`". At 1920 every list ends at x=964 beside a 956 px blank band, on all ~25 list screens. | `pane/index.tsx:271`; every data shot | A Pane whose body is a list (a `Table`, or an untitled list `Section`) is wide by the rule, not by an app prop, or at least `wide` is documented and the screens test flags a Table in a measured Pane. |
| S2 | The Table never draws its grid in TrackVault. The grid starts at 768 px of its own width, so (a) at 720 it is list rows: no headers, sort marks, columns menu, BPM/key columns ("BPM 120 · 8A · House · Time 5:00 · Energy 1"); (b) beside an open record the list Pane is 520 px, so even with S1 the library loses its grid whenever a track is open. | `table/index.tsx:355`; library, review, inbox, history, quarantine, conflicts shots | A compact grid form for narrow containers (frozen title + the leading figure columns) from about 440 px, or a record that opens over a wide table rather than beside it. Decide with the owner; this is the library's core. |
| S3 | The selection bar breaks. With a record open its acts wrap over "N of M chosen" and "Select all" (library, inbox); alone with 9 acts it is three rows, 107 px. It draws "0 of 0 chosen" and "Select all" at 1920 over an empty table, and four disabled acts with "Choose files first." | `library/$trackId/ticked-1920x1080.png`, `inbox/$itemId/data` | The count keeps its width (the acts wrap under it or fold into the more menu by the "first stands" rule); no bar over an empty table; formatted counts ("48,210"). |
| S4 | Form marks every optional field "Optional". In a `commit: "field"` settings form every field is optional by construction, so 53 labels carry the word and each one-line control costs an 80 px row (settings is 5400 px). | `form/index.tsx:496`; `settings/viewport-*.png` | Do not mark optional in a field-commit form (or mark required instead where most are optional). |
| S5 | A Pane's empty overrides its Section's. A Pane that holds the read draws the generic "Nothing here yet." in place of its body when the read is empty, so the Section's own sentence never shows (Downloads: "No downloads yet. Search Soulseek, or let the wishlist find what you want." is lost). | `downloads.tsx:69-88`; `downloads/empty-1920.png` | A Pane with no `empty` of its own lets its children draw (a Section given a selection of the Pane's read draws its `empty`), or the type requires the Pane's `empty` when it holds a collection read. |
| S6 | BarChart does not fill its column (736 of 964 px, about 492 of 720 of plot) and units in a Stats cell stand at the cell's end ("4,583 ··· hours"). Fewer bar names fit as a result. | `stats/data-1920.png` | Chart fills its container; the unit follows the figure. |
| S7 | Banner act ink: a commit act in a Banner is quiet text in the tone's hue (green on a "done" strip, about 4.4:1), so "Move the files" / "Unify the library" read as a note, not the act. | organiser, rules, genres shots | A Banner's act is the outlined act (or the bar's primary), never tinted text. |
| S8 | Sidebar: the footer group is not pinned and falls off the bottom when a folder is open at 1080; no counts of work waiting (Inbox, Review, Conflicts, Duplicates). | `library/viewport-1920x1080.png` | Pinned `end` group with internal scroll for the middle; a place `count` that is a selection (it exists: use it in the app, S8 is half app). |
| S9 | Smaller: row `status` draws a dot with no word in some rows; Section count counts fact rows ("VERDICT 3"); a band 46 px vs the row height; the not-found form on a place with `back={false}` ("Couldn't find this." + Back to nowhere); stats loading shape 208 px taller than loaded; the error state of a Pane holding no read draws one "This didn't load." per Section (7 on settings, 14 on stats). | group reports 3, 5 | Each per the report. |

## App: cross-cutting

| # | Finding | Fix |
|---|---|---|
| A1 | No route sets `wide` (0 hits). | Every list Pane `wide` (until S1 makes it the rule). |
| A2 | One track drawn ~10 ways: "Title" + artist meta on library/sets/stats, "Artist - Title (Mix)" on inbox, duplicates, review, wishlist, quarantine, previews; mix dropped on sets/stats; leading mark checkbox / none / note / download / tick; end group age+Play vs age+more vs nothing. | One `toTrackRow()` / one track column set in `ui/track.ts`, used by every screen. |
| A3 | Figures in four formats: "BPM 120" / "123 BPM" / "126 to 127 bpm"; "Time 5:00" / "5:03"; "48210" beside "48,210" and "50K"; eight routes declare their own `Intl.NumberFormat`; "3 mths" beside "2 days"; "Formats: MP3 / mp3". | One `ui/figures.ts` (count, bpm, key, duration, size, bitrate, age, date). |
| A4 | Primary acts inverted or missing: Organiser fills "Preview" and leaves "Move the files" as banner text; Rules/Genres/Aliases the same; the library bar's filled act is "Edit tags", not "Add to playlist"; most bars have no filled act. | Per screen: the commit act is the primary; preview runs on change (A7). |
| A5 | Jargon and raw values: fpcalc, PATH, ffmpeg, slskd, taxonomy, unify, replica, want, ISRC, AES-256-GCM, "darwin"/"win32", "Completed, TimedOut", "restore-offsite.mjs". | Glossary pass; raw enums mapped to words in `ui/`. |
| A6 | Naming drift: "Cleanup rules" / "Rules" / "Apply rules"; "Custom tags" / "Tags"; "Review" (auto-tag proposals) vs inbox "Review"/"Needs you"/"Not sure"; "All playlists" vs "Playlists"; filters worded four ways; "Decline" vs "Deny". | One glossary in `.project_management/`, applied. |
| A7 | Empty states: generic sentence, no act, on most screens (part S5). | Each empty says what fills the place and offers that act. |
| A8 | Sidebar IA: 6 groups, 22 places. Acquisition is split across DISCOVER, LIBRARY (Inbox) and CURATE (Review); the safety nets (Quarantine, History) are split; Set builder belongs with Playlists; `/` lands on the library and nothing says what needs attention. | Regroup: Library / Playlists (+ Set builder) / Acquire (Search, Wishlist, Downloads, Inbox) / Clean up (Issues, Duplicates, Organiser, Rules, Auto-tag review) / Tags / System (Devices, Jobs, History, Quarantine, Backups, Settings); counts on places with work waiting. |

## App: per flow (UX)

**Library and playlists**
- Record is a tall tower: a 690x400 cover and a placeholder waveform push Tags below the fold, 436 px blank beside it; two BPMs and keys (tags 123/11B vs analysis 126/8A) with no way to resolve; no sections for playlists-in, duplicates, history.
- Playlist detail: no position numbers, no total length, no play act on rows, opening a track leaves the playlist; a smart playlist shows a selection bar with zero acts.
- Dock from a list play has no waveform (the list's `toTrack` passes no peaks); the playing row has no mark.
- No track total, no visible active sort/filter; BPM/key filters two or three presses deep.

**Acquisition**
- Candidate pick: size, length, folder are hidden columns (and list form cannot show hidden columns at all); "Why" repeats facts; no recommended mark; after a download no step to Downloads.
- Inbox duplicate decision: Replace in a row menu, Keep/Reject in the bar's more menu (3 to 5 presses), the match section last, no side-by-side of incoming vs library copy, no preview play.
- Inbox rows say each fact two or three times ("Duplicate" dot + chip, "new track" x3); no bands or summary ("N ready / N need you"); approve-all-ready is an unlabelled icon.
- Wishlist imports capped at five; "Import a playlist" buried in more; a found want's act is "search again", not "see candidates"; chain links missing (search → wishlist/downloads, download → its want, filed item → new track).

**Cleanup**
- Duplicates choice shows format, bitrate, length only; path, size, mix are returned by the server but not drawn; tag completeness, cues, playlist membership missing; "Not duplicates" / "Keep this one instead" have no confirm, no toast, no undo.
- Organiser and Rules preview is stale: not invalidated by a template, preset or rule change, carries no age, stays "done" after apply (offers "Move the files" after they moved); an unapplied plan draws as a green "done" strip.
- Issues: "Corrupt audio 0" with a green dot while 30,000 of 48,210 were decoded; no links to the fixes.
- Review: Reject (row and bulk) without confirm; Accept writes files with no undo hint; one row per field with the track name repeated; no source/confidence filter.
- Quarantine: "1 day" beside "Days left 29" with no column header (list form), reads as time before purge on the permanent-delete screen; no subset restore/purge; the purge confirm names no count or size.
- Undo only in History (System group); toasts link to /jobs, never to the batch just made.

**Tags, history, jobs, gates**
- Genres and Aliases share one unify preview (`kind: "unify"`): Genres shows an Artist change and counts it, then its apply writes genres only, and both confirms say "Every change shown is written" — wrong.
- History: Undo glyph on scan batches (`undoable: false`) and on already-undone batches, refused by the server after the confirm; every batch "Applied"; the batch pane has no facts; change rows don't link to the track.
- Aliases show no per-spelling track count; alias and tag deletes write with no confirm, no history, no undo (tag delete from 840 tracks), against vision principle 2.
- Jobs: a failed job has no retry and no link to the fix; progress is text only and printed twice in two formats; sorted by created so long runs sink.
- Gates: sign-in leads with a quiet passkey act above email and a grey disabled Continue; the email step never says where the code goes; consent words "It" before naming the client; the organization step is mandatory for a single-owner product.

**Devices, backups, settings, stats, sets**
- Conflicts: no base value (the 3-way ancestor is not stored or returned: `devices.ts:244`), "214 tracks in order → 214 tracks in order", resolving writes into Rekordbox without confirm.
- Devices: offline/stale has no sentence or warning tone; raw "darwin"/"win32"; "41 tracks not matched" links nowhere; Sync now in more.
- Backups: no "last good backup" line although the status read returns it; restore is a script name in a description; an unreachable bucket shows as an empty state.
- Settings: 5400 px, no jump list or grouping by task; secrets draw "••••••••ab12" in the box with a red trash at rest rather than the "Saved, ends in…" hint; jargon.
- Stats: Tempo and Added use `bar.at` and name 2 of 9 and 2 of 12 bars (use `bar.label`).
- Sets: "Next" (the act pressed for every add) sits under Find, the score strip, the chart and the set; reasons are a run-on sentence, not BPM/key/energy deltas; energy chart named by key; empty shows "Mix score 64%" over 0 tracks.

## Suggested order

1. Stack S1 + S2 (width and the Table grid beside a record): decide the form with the owner; it changes every list.
2. Stack S3, S4, S5, S7 (selection bar, optional marks, empty precedence, Banner act): small, broad.
3. App A2 + A3 (one track row, one figure module) and A1 (wide).
4. App safety: stale previews, unify preview per kind, confirms on Reject/dismiss/delete, undo glyph only on undoable batches, undo link in the act's toast.
5. App decisions: dupes facts side by side, inbox match side by side, candidate columns, conflicts base value.
6. App IA and words: sidebar regroup with counts, glossary, empty states with acts, jargon.
