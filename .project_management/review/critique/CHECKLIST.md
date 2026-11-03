# TrackVault design critique: the checklist

Shots: `~/projects/trackvault/apps/hub/shots/<screen>/<state>-dark-1920.png`, each the whole
screen at 1920 wide, dark, desktop density. Every screen has `data` and `empty`; loading, error
and notFound are stack's frame forms (identical on every screen), so they were shot only for four
representative screens (library, library/$trackId, settings, stats): answer C8a/C8c/D8/F9/F10 from
those, and `n/a (state not shot)` elsewhere. The run's log names the
machine findings (axe, overflow, render walk, shift, per-read failures) per screen:
`.project_management/review/screens-run.log`.

Sources:
- Rules: `~/projects/stack/packages/ui-core/guide/voice.md` (V#),
  `~/projects/stack/packages/ui-core/guide/structure.md` (S#),
  `~/projects/stack/plugins/react-ui/guide/rules.md` (R),
  `~/projects/stack/packages/ui-core/guide/critique.md` (C#, the stack checklist; sections A below are it).
- Screens: `~/projects/trackvault/apps/hub/src/app/routes/**`, the shared parts in
  `src/app/lib/*.tsx` and `src/app/ui/*.ts`, fixtures in `src/app/fixtures.ts`.
- Product: `~/projects/trackvault/.project_management/vision.md` (who uses it and for what).

Every item is answered `yes`, `no` or `n/a (why)`. A `no` carries evidence: the shot file and the
element (its visible text) or the source `file:line`, the observed value, the expected value from
the rule, and a one-line fix, tagged **app** (TrackVault composition) or **stack** (a roster
component: it looks wrong wherever it is used). Nothing is skipped silently. Only 1920 dark is shot:
items about 320, touch or light mode are `n/a (not shot)`; say so once, not per item.

## A. Stack's critique (C1a to C9a), at 1920 dark

Run every item of critique.md section 1 to 9 as written, except 3d and 8d (320) and the light half
of 8e/8f. At 1920, 3a ("truncates at 1280") is asked at 1920: anything that still truncates at 1920
is worse.

## B. Layout at 1920 (the widest desktop)

- B1. Does a list page use the width (V17: "a list page is `wide`")? Measure the table/sheet's right
  edge against the canvas: name any page whose content stops short and leaves a blank band, and how
  wide it is.
- B2. Does a record stand within 720 px (V17) and a Pane before another hold 340 to 520 px? With
  a record open beside a list, do both panes read as one page (no gutter of dead canvas)?
- B3. Is there exactly one horizontal scroller per wide table, inside its card, never the page?
- B4. Does every sheet's left edge share one line per pane (page inset), and every section a
  sections gap apart (C7d)?
- B5. Does any bar (Pane bar, selection bar, toolbar, Form bar) wrap, overlap or push its text
  under another part? Name the bar and the overlapping parts. (A known one: the library's selection
  bar with a record open, "Find duplicates" over "0 of N chosen".)
- B6. Does a chart fill its column, and is each bar named or every nth (R: BarChart `bar.label`),
  with the axis readable? Does a Stats row read as one band of figures?
- B7. Is the sidebar 220 px, its first row on the bar's line (V2), and the dock (player) across the
  foot without covering the last row of any list or the selection bar?

## C. Rhythm

- C1. Rows 32 px, pills in rows compact 20 px, controls 32 px, bands at row height (V5, V9, V10, V12).
- C2. The label column of every definition list in a Pane is one width (V11, C7b).
- C3. Baselines: a count beside a heading, a meta beside a name, share a baseline (S21).
- C4. Section heading form is one everywhere (C1d): uppercase 12, count faint, icon act at the end,
  one description sentence.
- C5. Vertical rhythm between panes side by side: the first rows and headings line up (C7a).
- C6. Type sizes: six at most per screen (S16), the record name 20 mono, figures 24.

## D. Interface best practice

- D1. One primary (filled) act per bar, and it is the screen's most common task (V5). Name the
  primary act of each screen and say whether it is the right one.
- D2. Destructive acts (delete, purge, reject, quarantine, replace, overwrite Rekordbox) are not the
  primary, are worded as what they do, and (from source) carry a `confirm`.
- D3. Affordance: everything that looks pressable is, and everything pressable looks it (C6c). An
  icon act has a tooltip and accessible name (source).
- D4. Figures: numbers right where they compare (a table's figure column), tabular digits,
  units stated once (column header) not per cell; durations, BPM, key, sizes, dates in one format
  across screens.
- D5. Status reads without colour alone: a dot has a word, a tone is the tone vocabulary (R: Tone).
- D6. Copy: sentence case, nouns for headings, product glossary terms used the same way on every
  screen (track/file, library/collection, inbox/review/downloads/wishlist, playlist/set/crate,
  device/agent/Rekordbox), no UI mechanics in words (C4d), no jargon a DJ would not know (fpcalc,
  ANLZ, SigV4, keyset...). Quote each.
- D7. Empty, error, not found: each its one form (V15, C4c, C8c); an empty state says what fills
  this place and offers the act that fills it.
- D8. Waiting: loaded shape painted, no second layout, no spinner over a blank page (C8a, S15).
- D9. Density: does the screen carry too much (more than a name, one meta, one end group per row,
  C3c) or too little (a page with one short list in a sea of canvas)?

## E. User experience (the weight of the review)

The user is one DJ with 50k+ tracks on a homelab hub, working from any PC, playing out of
Rekordbox on a Mac (vision.md). For each screen:

- E1. Purpose: from the shot alone, can they say in one sentence what this screen is for and what
  state their library is in? Quote what tells them, or what is missing.
- E2. The main task: name the screen's main task and count the presses from landing to done (from
  the shot plus source). Is the next step always visible, never hidden in a more menu or a second
  screen when it is the common one?
- E3. Feedback: after an act that starts a job (scan, tag write, dedupe, organise, download,
  backup, sync), where does the user see it running, finishing and failing? Is it visible from this
  screen?
- E4. Safety: can every bulk or file-moving act be previewed before and undone after (history,
  quarantine)? Is that visible at the moment of the act, not only on another screen?
- E5. Flow across screens: the acquisition chain (Search, Downloads, Inbox, Review, Wishlist,
  Import) and the cleanup chain (Issues, Duplicates, Organiser, Rules, Tags, Genres, Aliases,
  Quarantine, History) and the DJ chain (Library, Playlists, Sets, Devices, conflicts): does each
  screen link to the next step, and are the same things called the same names on each?
- E6. Scale: does the screen hold at 50k tracks (counts, windowed tables, filters and search first,
  never a screen that needs scrolling to find something)?
- E7. Decision support: where the user must choose (dupe winner, conflict side, candidate download,
  proposal accept), does the screen show the facts the choice turns on side by side (bitrate,
  format, length, source, tags), and the recommended choice?
- E8. Errors the user can fix: a failed job, a missing file, an unreachable device or slskd, a bad
  credential: does the screen say what is wrong and what to do, in their words?
- E9. Keyboard and speed: power user paths (search focus, table keyboard, play on Space) are
  discoverable from the screen (source: shortcut hints, tooltips)?
- E10. Navigation: is the screen where a user would look for it in the sidebar, is its sidebar label
  its Pane title (R), and is the sidebar's grouping (count the places) learnable?

## F. New stack components (made during this revamp): check each where it appears

- F1. **Shell player dock** and **Waveform**: dock reads as one bar (cover, title/artist mono,
  transport, waveform with played part, time, volume), no overlap with content, waveform on the
  record readable at its height, played/unplayed contrast, cue marks.
- F2. **Table** (wide): leading column frozen and the name; figure columns narrow and right/tabular;
  columns menu at the bar's end (8+ columns or a hidden one); sort mark on the sorted header; the
  active row's wash; the acts column frozen at the end, its header; the selection bar docked at
  the Pane's foot ("N of M chosen", deselect, acts), its layout with a record open (B5); range ticks.
- F3. **Window pagination** over a total: the count shown is the total (48,210), painted rows while a
  window loads, no "Show more" on a windowed table, no scrollbar jump.
- F4. **Drag and drop / reorder**: from source and shot, does a playlist row and a sidebar playlist
  read as a drop target (the menu entry "Add to …" exists in `more`), does an ordered list show its
  order (position column or numbers) and reorder in the menu?
- F5. **Nested sidebar places** (playlist folders): rails per level, fold chevron state, indent,
  counts in faint ink, current place bar + wash, ancestors in selected ink.
- F6. **Form `onChange` live preview + Sheet `after`** (bulk edit, organiser, rules): does the preview
  stand under the fields, read as before → after, and say how many tracks it reaches?
- F7. **Form `secret` control** (settings: slskd, providers, offsite keys): the masked hint "Saved,
  ends in …", the Remove act, no value shown.
- F8. **Banner / empty / description selections**: a banner that stands only with data (duplicates,
  issues, search, import, preview) — tone right, one sentence, its act; does it move the page once
  (shift log)?
- F9. **Section frames with reads**: in the per-read failure log lines, does each failed read draw
  in its own Section, and does the error shot show one form per frame, not the whole page gone?
- F10. **Stats cells as frames**: figure 24 at 500, label, failed cell mark in error shot.
- F11. **BarChart `bar.label`** (stats, sets): every bar named or every nth, not first/last only on
  buckets; the bars fill the width (B6).
- F12. **Device keys and MCP auth screens** (`connect.consent`, `connect.organization`, settings
  devices): Gate form, acts under the body, primary first.

## G. Existing stack components: usage

- G1. **Pane**: title is the sidebar label; `actions` first stands, rest in `more`; back vs close;
  `noun` for the not-found sentence ("Couldn't find this track."); a record Pane after its list.
- G2. **Section**: a titled section per part; no Section in a Section; `empty` with a sentence and
  one act; a list outside a section is its own sheet; description is one sentence on purpose.
- G3. **Rows**: leading mark meaning (type mark, dot, avatar, cover), title mono for names, meta on
  the same line, marks (status/lock/chip) on a second line, end group order (age/count, switch/pick,
  act, chevron), no chevron on a row that opens.
- G4. **Pills/chips**: type pill with dot, state pill soft fill, fact pill outlined; one meaning per
  style across all screens (keys, genres, tags, formats, qualities).
- G5. **Toolbar**: bare on the table over its list, search leading, filter chips, one row.
- G6. **Form**: groups for parted forms, field labels as questions or nouns consistently, `optional`
  marks, settings as `commit: "field"` (no bar), the label column shared.
- G7. **Banner**: tone vocabulary, one sentence, act, `until` for a timed run.
- G8. **Picker / Input / Switch**: a control placed alone draws its field label; no hand label.
- G9. **Gate** (sign-in): body prose, acts in one line under it, primary first; the mark.
- G10. **Card / Image / Text**: a Card only for non-row content at sheet inset; cover Image sizes
  and corners; Text kinds used for roles, never restyled.

## The report

Write `.project_management/review/critique/<group>.md`:

```
# <group name>

## <Screen title> (<route id>)
Shots read: ...
Source read: ...
Machine findings (from the run log): ... or none

| Item | Answer | Evidence (shot + element or file:line, observed, expected, fix, app|stack) |
| --- | --- | --- |
| A-1a | yes | ... |
...  (every item of A, B, C, D, E; F and G items that apply to the screen, the rest n/a)

Top three: the three findings that most make the screen read unfinished or slow the user, in order.
```

Then, after all screens of the group:

```
## Across the group
- Inconsistencies between the group's screens (C1b, G4, D6): each with both shots.
- Stack findings: each roster defect seen, the component, the shots, the fix in stack.
- UX: the group's flow (E5) as the user walks it, where it breaks.
```

Keep evidence specific; no generic advice. Look at every shot you list as read: open the PNG.
