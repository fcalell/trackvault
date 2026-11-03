# Fix plan: design critique, table grid, stack UI audit

Sources (all in `review/`):
- `critique/SUMMARY.md` and its six group reports, plus `CHECKLIST.md`: the design critique of every hub screen at 1920 dark.
- `board-1-problems.png` and `board-2-fixes.png`: the table-grid problem and its prototypes.
- `audit/REPORT.md` and its five family reports: the audit of stack's UI from `364a2c5` to `98bd7f7`.
- `mobbin.md`: stack's components against Mobbin's references, at stack `97af0933`. Every item from it says *Mobbin*.

The items are checked against stack `97af0933`. The critique and the audit name older lines.

The owner made every decision below. Where an item says *default*, the owner was not asked and the plan picks the option that follows stack's principles; change it before that phase starts if needed.

IDs: **K** is stack, **T** is TrackVault. The goal for stack is that it stays a shared design system: no prop, branch or word that exists for one app's use case, and structural fixes over local overrides. Already done: every component prop is in stack's guide (stack `98bd7f7`: `frames.md`, `controls.md`, `content.md` and `blocks.md`, web and native).

## Decisions

| Topic | Decision |
|---|---|
| List width | The app sets `wide` on a list Pane. `stack screens test` flags a `Table` inside a measured (not `wide`) Pane. No automatic rule. |
| Table form | 2a + 2b. The grid draws at any desktop width (list rows only on touch or below `tablet`), and a `wide` Pane takes the spare room while the record beside it holds the list width. |
| Selection bar | Form a, the docked foot (`mobbin.md`): count, Select all and clear at the start, the more menu then the filled primary at the end. It is an `ActionBar` with `chosen` in the Pane's `foot`, given by the route. |
| Pane widths | `list`, `region-min` and `reading` are in `ch`, so they follow the `size` knob. `dialog`, `popover` and `toast` are a separate decision; breakpoints stay. |
| Failure forms | Each read fails and retries in its own frame, as `rules.md` says. A place draws no single form over its Sections. |
| Field rows | Voice 3 changes: in a field-commit row the control stands at its own measure. |
| Native player | K4.9 is built; K4.12 is deferred. |
| Player | Composition, not a plugin. The Shell gets a generic `foot` region; the app writes `<Shell foot={<Dock />}>`. Dock, Waveform, `createPlayer` and the queue become neutral roster parts that nothing mounts by default. The `Output` seam exists; the engine is passed in from outside the Shell: the browser's audio element on the web; on native an adapter at `@fcalell/plugin-native-ui/audio/expo`, with `expo-audio` an optional peer. native-ui drops the `expo-audio` dependency and its config plugin. |
| Player words | Stay in `Words`, worded neutrally (`playFailed` and the rest). No plugin-owned words. |
| Player fields | Delete `Track.headers` and `Track.markers`/`Marker` now; re-add neutral marks when cues land. Rename `artwork` to `image`. `meta` is already `line`, which stays. |
| `server` option | Moves from `nativeUi` to plugin-api, for web and native. plugin-auth exposes "this server has auth" through a slot. |
| Phone Table | The phone's Table has `choose` with ids. `Picked` and the row `act`, `more` and `drop` slots are marked web-only in the roster, like `drag`. |
| Optional mark | A field-commit form marks nothing (no "Optional", no "Required"). |
| Empty precedence | A Pane with no `empty` of its own lets its Sections draw their own. |
| Section `read` | Dropped from a Section with `items`. A real second read is held by the Pane or an enclosing Section. |
| Tree Space | Space does nothing on a sidebar tree row; Enter navigates. |
| Same-label drops | Name them by path when labels clash ("Sets › Warm-up", "Archive › Warm-up"). Never merge them. |
| rules.md length | Leave it. |
| Library primary | Add to playlist, as the bar's last act, which is the filled one. |
| Sidebar | Groups by job: **Library** (All tracks, Inbox, Stats) · **Playlists** (the tree, Set builder) · **Get music** (Soulseek, Wishlist, Downloads) · **Clean up** (Issues, Duplicates, Organiser, Rules, Auto-tag review) · **Tags** (Genres, Aliases, Tags) · **System** (Devices, Jobs, History, Quarantine, Backups, Settings). Places with work waiting show counts. *Default:* Inbox stays in Library, because it is where new music lands. |
| Landing | `/` stays the library, with a Banner when something needs the owner (inbox waiting, conflicts, a failed backup, a failed job). |
| Renames | Review → Auto-tag review · Custom tags → Tags · Cleanup rules → Rules · Search → Soulseek. |
| Duplicate places | Playlists becomes the page that manages playlists. Recently added stops being a place and becomes a sort (Added, newest first) of All tracks. |
| Track record | Waveform first, then Tags. The big cover goes; a compact one stands beside the facts. |
| BPM and key | Replace the analysis with Essentia (essentia.js, WASM, AGPL). |
| Conflicts | Two sides only, with a confirm before writing to Rekordbox. No base value and no schema change. |
| Organization step | Skipped when the user has exactly one organization. Stack does this. |
| Settings | One page per area. |

## Stack

### K1 Layout and the Table
- **K1.1** The screens test (`plugin-screens`) fails a screen whose `Table` stands in a measured Pane, naming the route and the Pane. The `wide` documentation is already done.
- **K1.2 (2a)** Built on stack's local `196b8914`, unpushed. The Table chooses grid or list rows by the input device, not by its own width. It draws the grid at every width from `tablet` up when the pointer is fine. List rows are for coarse pointers or below `tablet`. A narrow container scrolls sideways under the frozen title column, which already exists. This replaces `useWide` and its measure, and takes "the Table's own width" off rule 7's list.
- **K1.3 (2b)** Built on stack's local `3f4e2b9f`, unpushed. In the Place's row, a `wide` Pane takes all the spare room and the record beside it holds the list width (`w-list`, floor 340). Today the pane before the last holds the list width. The order is fixed by role (the list stays first and wide), and narrow viewports still `cover`.
- **K1.4** *Mobbin, changed.* The frozen ground exists. The last frozen cell gets a hairline edge by CSS, and the title's sticky offset is the tick column's width (`left-target`), so scrolled text stops leaking through 4 px. An acts cell rises to body ink on row hover and focus-within.
- **K1.5** *Default:* the `age` figure width fits the longest relative word the density's `Words` produce ("5 seconds ago", "11 months ago"), measured once from the words, not per app. *Mobbin:* `chip` and `status` columns stand at the short measure. A Table cannot tell a short text from a long one, so an app sets `width: "measure-short"` on a short text column (T2.5).
- **K1.6** *Mobbin, changed.* The selection bar is form a, the docked foot. It holds:
  - the count keeps its width;
  - no bar over an empty table;
  - counts are formatted ("48,210 of 48,210");
  - "Select all" shows only when the ticked are fewer than the total;
  - the acts fold: the filled primary stands and the rest are in the more menu.
- **K1.7** `columnsKey` keys by the Table's `label` alone when it has one, falling back to a hash of the sorted keys when it has none, so adding a column keeps the viewer's choice.
- **K1.8** The roster marks `Picked` and the row `act`, `more` and `drop` slots web-only; native types already refuse them.
- **K1.9** The list form tells columns apart without headers: a number carries its column's `label` ("Days left 29"), the row's first age trails it live ("1 day ago"), and a further age is a fact with its label ("Seen: 1 day ago").
- **K1.10** *Mobbin.* One row height: the tick cell drops its `py-gap`, so a grid row is 32 px (37 today, 35 ticked) and ticking moves nothing.
- **K1.11** *Mobbin.* A ticked row carries the neutral `wash-selected` at rest, on the row and its frozen cells; never the accent.
- **K1.12** *Mobbin.* The frozen title's floor is `measure-short`.
- **K1.14** *Mobbin.* The sort hint keeps its slot (`invisible`, not `hidden`), so a label never reflows. The first press sorts text ascending, figures and ages descending.
- **K1.15** *Mobbin.* The columns bar states the read's total, formatted, in meta ink.
- **K1.17** `WIDTH_VALUE`'s `list`, `region-min` and `reading` are in `ch`, as `measure-short` is, so they follow the `size` knob. Voice 17 states them that way. Every screen is shot again.
- **K1.16** *Mobbin.* The columns menu ends in one Reset row (`words.reset`), enabled when the choice differs from the defaults.

### K2 Frames, forms, text, charts
- **K2.1** A `commit: "field"` form marks no field as optional. A submit form keeps today's rule.
- **K2.2** A Pane with no `empty` lets its Sections draw their own `empty`. Only a Pane that declares `empty` replaces its body.
- **K2.3** *Mobbin, changed.* A Banner's act is the outlined act, never text tinted in the tone's colour. The line keeps the act's height, as `LINE_RUN` does, so the glyph centres on the sentence (6 px off today).
- **K2.5** Stats: the unit follows the figure ("4,583 hours"), not the cell's end.
- **K2.6** *Mobbin, changed.* Failure forms follow the frame:
  - the not-found form offers no Back where `back={false}` (`useBackAct` falls back to the place's route today);
  - a Section's missing form is the sentence alone: Back is the Pane's;
- **K2.7** Loading shape: a Section paints as many rows as it last loaded, or `PAINT_ROWS` when it has never loaded. The screens test's shift check covers loading → data.
- **K2.8** In a submit form, an untouched saved `secret` is left out of the input, not sent as `null`.
- **K2.9** A Form takes `after`, a function of its current input, in place of `onChange` and the Sheet's own `after`. A prefilled preview draws before any keystroke and a reopened sheet starts from its first values, because the draft has one owner.
- **K2.10** `lift` takes the nesting key as a parameter.
- **K2.11** Drop `read` from a Section with `items`, together with its frame code, roster entry, the showcase `crates.tsx:44-60` use (a real second read, which moves to an enclosing frame) and the docs (`rules.md` frame paragraph, `content.md`).
- **K2.12** A row's `{ tone }` leading is the dot alone, its `label` its accessible name, so titles keep one start. A list whose rows say the state nowhere else gives it as a status fact, and `rules.md` says so. The list band and a Section heading measured right: 32 px against a 32 px row, and a 36 px head holding a description and an icon act.
- **K2.13** A blocked submit over an invalid value names the field, from its label. The generic "Type a value" goes; an empty field already names itself.
- **K2.14** *Mobbin.* A field-commit row is its label over its description, beside the control at its own measure, so the row is as tall as those two lines and a short value stops filling the row. Voice 3 says so.
- **K2.15** *Mobbin.* When a sheet's form has `after`, the form's bar stands after it in the sheet's foot, pinned, so Apply never ends above the preview.
- **K2.16** *Mobbin.* A saved secret says "Saved, ends in …" in meta ink, with a Replace act and a quiet Remove that confirms. The form does this itself.
- **K2.17** *Mobbin.* An empty row pick's trigger draws a generic word from `words`, its value once chosen; its label stays the accessible name.
- **K2.20** *Mobbin.* BarChart draws its own card, as Stats does, and `blocks.md` and `frames.md` say one thing.

### K3 Sidebar, drag
- **K3.1** *Mobbin, changed.* `SHELL_PLACES` scrolls on its own between the switcher and the `end` group, which stay fixed. No place is ever clipped (Settings is 58 px off screen with a folder open).
- **K3.2** The menu and keyboard floor offer every spec's drop, folded branches included. Drops register from the place specs, not from mounted rows.
- **K3.3** `Q` runs through `RowItem.drop`, `PlaceSpec.drop` and `TableRowSlots.drop`, which removes the `as never` casts.
- **K3.4** Space does nothing on a tree row (WAI-ARIA); Enter navigates and arrows fold.
- **K3.5** When two drops share a label, the drop menu names each by its path and drops none. A row and a place are one target only where the row's `href` is the place's route. `rules.md:464`, `ui-core.md:304` and the `useOffers` JSDoc change with it.
- **K3.6** *Mobbin.* The Shell draws every run through `PlaceTree`, so each run is one tab stop (22 flat stops plus the tree today). A group holds its own read and can hold a switcher or a Retry, controls that cannot stand inside one `role=tree`.
- **K3.7** *Mobbin.* A short hold of an accepted drag opens a folded branch. The tree owns the fold; `lib/drag` exposes the hold.
- **K3.9** *Mobbin.* A drag carries the scroller under the pointer, whichever list holds it, drag-only lists included.

### K4 The player by composition
- **K4.1** The Shell gets a generic `foot` region, web and native, laid out where the dock stands now. It draws nothing when empty. Document it in `frames.md` and the roster, and update `docs/architecture/slot-catalog.md` only if a slot changes.
- **K4.2** The Shell stops owning audio:
  - no `<audio>`, no default dock mount, no global Space/Left/Right listener, no mediaSession;
  - the Dock component owns its keys and mediaSession while mounted, and its key rule gives way inside inputs and the Table's grid as it does today;
  - the `PRESSED` selector's dead `[role="gridcell"], [role="row"]` goes.
- **K4.3** The engine comes through the `Output` seam:
  - the web passes an `HTMLAudioElement` output, a roster helper;
  - the native adapter `@fcalell/plugin-native-ui/audio/expo` wraps `expo-audio`, declared as an optional peer. Apps that import it add `expo-audio` and its config plugin themselves; the adapter's guide page shows the `app.json` lines.
  - native-ui's `package.json` and config plugin (`src/index.ts:448-450`, `505-509`) drop `expo-audio`.
- **K4.4** These join the roster as neutral parts: `createPlayer`, `QueueProvider`, `windowQueue`, async `track()`, `Waveform`, and the `Track`/`Peaks` descriptors. `SliderBase` `bare`/`said` and `lib/ink.ts` stay internal and are documented as the Dock's and the Waveform's.
- **K4.5** Delete `Track.headers`, `Track.markers`, `Marker` and the flag/label drawing in Waveform. Rename `trackFailed` → `playFailed` and `artwork` → `image`. Reword the player words neutrally (no "track").
- **K4.6** Table text says "Space is not claimed" (`table/index.tsx:1173`, `rules.md`, `reference.md`, roster), not "goes to the player".
- **K4.7** Rewrite `docs/decisions/the-player-is-the-shells.md` to the composition. Rewrite `audio.md` (web and native) to `<Shell foot={<Dock />}>` with an injected output. Voice 14's "No dock" names the tab dock; its wording stays clear of the player's Dock.
- **K4.8** *Mobbin.* The web dock's zones share by flex, with no borrowed `w-popover`, so the transport centres. A glyph act takes `primary`, used for Play. `gap-gap` on the progress row, web and native. A queue position stays out: a queue provider has no total.
- **K4.9** *Mobbin.* The native dock is one bar with a hairline progress along its top. Pressing it opens a `Sheet` with the full player.
- **K4.10** *Mobbin.* The dock's cover draws through the thumbnail tile states (`image/base.tsx`), so the name holds one x and a broken cover has a form.
- **K4.11** *Mobbin.* The Waveform holds the pointer as its playhead during a drag and seeks once on release, through `useHeldDraft`. Keys and a plain press commit at once.
- **K4.12** *Mobbin, deferred.* A native Waveform of the same columns, committing on release.

### K5 A client of another app's server
- **K5.1** `server` moves from `nativeUi` to `api({ server })` and works for web and native client-only apps.
- **K5.2** plugin-auth contributes "this server has auth" through a typed slot. Delete the `"auth.session"` string match (`native-ui/src/index.ts:343`). Update the slot catalog.
- **K5.3** native-ui `requires` names what it imports.
- **K5.4** Done (`auth/src/worker/oauth.ts:505-517`). `guide/mcp-oauth.md:31` still says the step is always asked; it changes.

### K6 Words and examples
- **K6.1** Neutral examples in place of DJ nouns (tasks onto projects, labels, boards). This covers:
  - `rules.md` (drag, sidebar and Table examples);
  - `docs/decisions/a-drag-is-data.md`;
  - descriptor and Shell JSDoc;
  - the showcase `library.tsx`, `crates.tsx` and the Camelot fixtures. The player showcase keeps a generic audio example;
  - `rules.md:432`'s `noun` inside `choose` and the stale row `meta:` at showcase `crates.tsx:30,51`, which are wrong as well as DJ.
- **K6.2** rules.md stays as it is (owner's decision).
- **K6.3** `voice.md` states a length by its token, with px only as the value at the default `size` knob. A ui-core test fails a bare px value in it.

## TrackVault

### T1 Across the app
- **T1.1** Set `wide` on every list Pane (about 25 routes).
- **T1.2** One track row and one track column set in `ui/track.ts`, used by these screens:
  - library, playlists, sets and stats;
  - inbox, duplicates and Auto-tag review;
  - wishlist, quarantine and previews.

  The row is "Title (Mix)" with the artist under it, one leading mark and one end group.
- **T1.3** One figures module, `ui/figures.ts`: count, BPM, key, duration, size, bitrate, age and date. The 13 route-local `Intl.NumberFormat`s go.
- **T1.4** The commit act is the primary on Organiser, Rules, Genres and Aliases. The library's primary is done (hub `deafa2b`).
- **T1.5** Glossary in `.project_management/glossary.md`, applied everywhere:
  - the four renames;
  - *default:* tool names (fpcalc, ffmpeg, slskd) appear only where the owner installs or points to them;
  - raw values map to words in `ui/` (platforms, job states, "Completed, TimedOut");
  - "want" becomes "wishlist item";
  - "unify" becomes "tidy spellings";
  - "replica" becomes "local copy";
  - restore steps are written in words.
- **T1.6** Every empty state says what fills the place and offers that act.
- **T1.7** Sidebar regroup as decided, with counts: Inbox waiting, Auto-tag review, Conflicts and Duplicates.
- **T1.8** A library Banner for what needs attention. It reads the counts T1.7 uses.

### T2 Library and playlists
- **T2.1** Track record:
  - waveform first, then Tags, with a compact cover beside the facts;
  - sections for the playlists it is in, its duplicates and its history.
- **T2.2** BPM and key by Essentia (see the Analysis workstream). *Default:* where the file's tag and the analysis disagree, the record shows both with "Use analysis" per field, which is logged and undoable.
- **T2.3** Playlist detail:
  - rows show position, the list shows its total length, and rows have a play act;
  - a track opens inside the playlist place;
  - tracks can be added from the playlist;
  - a smart playlist has no selection acts.
- **T2.4** A list play passes peaks to the dock (`toTrack`), and the playing row is marked.
- **T2.5** Library:
  - the total and the active sort and filters are visible;
  - BPM and key filters are one press away;
  - Recently added becomes the Added sort, and the `/recent` routes go;
  - Key and other short text columns set `width: "measure-short"` (K1.5), so Genre keeps its room.
- **T2.6** The library selection bar follows the K1.6 design.
- **T2.7** Playlists is the manage page: create, rename, folders, smart rules and counts, not the sidebar tree again.
- **T2.8** One queue mechanism (`windowQueue`); the 200-row slice in `lib/queue.ts` goes.
- **T2.9** *Mobbin.* The unify preview paints a card while it waits, so its heading never stands over nothing.

### T3 Get music
- **T3.1** Candidate pick:
  - size, length and folder are columns;
  - "Why" has no repeats;
  - a recommended mark;
  - rejected rows stand apart;
  - a download links to Downloads.
- **T3.2** Inbox duplicate decision:
  - incoming file and library copy side by side (format, bitrate, length, size, path, tags);
  - preview play;
  - Keep, Replace and Reject as the record's acts.
- **T3.3** Inbox rows say each fact once. Bands "Ready" and "Needs you" carry counts. Approve-all-ready is labelled with its count.
- **T3.4** Wishlist:
  - every import is reachable (no `slice(0, 5)`);
  - "Import a playlist" is in the bar;
  - a found item's act is "See candidates".
- **T3.5** Chain links:
  - Soulseek search → wishlist and Downloads;
  - a download names its wishlist item;
  - a filed item links to its track;
  - a missing import row offers "Search now".
- **T3.6** One match vocabulary.

### T4 Clean up
- **T4.1** Duplicates:
  - path, size, mix, tag completeness, cues and playlist membership side by side;
  - "Not duplicates" and "Keep this one" confirm, toast and undo;
  - dismissed groups can be read.
- **T4.2** Organiser and Rules preview:
  - it re-runs on a template, preset or rule change and carries its age;
  - it reads "done" only after apply;
  - an unapplied plan is drawn in the `attention` tone.
- **T4.3** Issues: no "0 corrupt" while decoding is partial, and each issue links to its fix.
- **T4.4** Auto-tag review:
  - Reject confirms (row and bulk);
  - Accept says it writes files and can be undone;
  - one row per track;
  - source and confidence filters.
- **T4.5** Quarantine:
  - "added" and "days left" told apart;
  - restore or purge a subset;
  - each file's reason and batch;
  - the purge confirm names count and size.
- **T4.6** Every act that makes a batch toasts with a link to that batch.

### T5 Tags, history, jobs, gates
- **T5.1** The unify preview is split by kind (genres apart from aliases). Confirms say what is written.
- **T5.2** History:
  - Undo only on undoable batches not yet undone;
  - batch facts;
  - change rows link to their track;
  - filter and search.
- **T5.3** Aliases show the tracks each spelling reaches. Alias and tag deletes confirm with the count and are logged and undoable.
- **T5.4** Jobs:
  - a failed job has retry and a link to the fix;
  - progress shows as a bar;
  - running jobs come first;
  - results link to their batch.
- **T5.5** Sign-in leads with email as the primary act and says in words where the code goes.
- **T5.6** Consent names the client first and says how to revoke. One word, "Deny", on both pages.
- **T5.7** Stack skips the step already. The comment in `connect.organization.tsx` changes.
- **T5.8** *Mobbin.* Decline is `secondary`, and the consent's "it can…" sentence is a body `Text`.

### T6 Devices, backups, settings, stats, sets
- **T6.1** Conflicts:
  - two sides;
  - real order diffs (moved, added, removed rows), not "214 → 214";
  - a confirm before writing to Rekordbox;
  - the undo stated.
- **T6.2** Devices:
  - offline or stale in words and tone, with the fix;
  - platform names;
  - "41 not matched" links;
  - Sync now in the bar.
- **T6.3** Backups:
  - a "Last good backup" line from the status read;
  - restore steps in words;
  - an unreachable bucket shown as a failure.
- **T6.4** Settings becomes one page per area, under `/settings/<area>`, linked from a Settings index. The areas come from today's Sections:
  - Library, Soulseek, Inbox, Auto-tag, Cover art and analysis, Playlist import, Backups (with Offsite storage) and Account.
  - *Default:* Backups settings move onto the Backups place, so Settings links there.
- **T6.5** Secrets adopt K2.16.
- **T6.6** Stats charts name bars with `bar.label`, with one count format (T1.3). *Mobbin:* Keys is 12 stacked buckets with A and B parts, so every key is named (24 alternating bars name only the A keys).
- **T6.7** Set builder:
  - Next first;
  - reasons as BPM, key and energy deltas;
  - the energy chart named by step;
  - no score over an empty set.

### T7 Adopting stack
- **T7.1** `<Shell foot={<Dock />}>` in the hub and the phone, with the outputs injected and the `artwork` rename (`ui/track.ts`, phone `lib/play.ts`).
- **T7.2** The phone adds `expo-audio` and its config plugin itself and imports `@fcalell/plugin-native-ui/audio/expo`. The `link:` into stack's `apps/phone/node_modules/expo-audio` goes.
- **T7.3** The phone's `server` moves to `api({ server })`. The screens test's `table-pane` check (K1.1) passes on the hub: aliases, devices/conflicts, genres, history/$batchId, import/$importId, inbox/$itemId, organiser, playlists/$playlistId, quarantine, review, rules and wishlist/$wantId. A list page's Pane takes `wide`; a record Pane stands beside a wide list and draws rows in place of a Table.
- **T7.4** `pnpm check` is green in both repos, with `tsc -b --force` in `apps/hub` and `apps/phone`, because plain `tsc -b` passes on a stale cache after a stack rebuild. `stack screens test` passes on every changed screen.
- **T7.5** The row vocabulary is put right. A sentence is a row's `line`, a fact is a badge: devices' "47,900 files in the replica, 310 waiting", duplicates' "Keeper: kept higher bitrate…", genres' "Closest: …", the wishlist's "Wants a better copy" and candidates' "Another version in the library" move out of the badges. The joined `·` strings split (candidates' Peer and Why, inbox's overline, import's `match · NN%`). Raw `darwin` and `win32` (`devices.tsx:57`) become words.

### Analysis (T2.2)
- **A1 Spike.** Run essentia.js in a Node worker thread (`new Worker(new URL(...))`, bundled by `stack build`). Feed it ffmpeg-decoded PCM at 44.1 kHz mono over the window set on Settings, Analysis: 60 s by default, or 120 s, or the whole track. Use `RhythmExtractor2013` for BPM, with the beat positions kept for a later grid, and `KeyExtractor` with the `edma` profile for key. Measure time and memory per track on the homelab's CPU class.
- **A2 Yardstick.** The agent already reads Rekordbox's BPM and KeyID. Add an agent-to-hub report of those values for matched tracks into a scratch table or file. It is used only to benchmark, and leaves `OWNED_TRACK_FIELDS` unchanged. Compare on at least 300 tracks across genres:
  - BPM within ±0.5;
  - octave errors counted apart;
  - key exact agreement and Camelot-neighbour agreement.
- **A3 Bar.** Ship if BPM agreement is at least 90% (octave errors excluded) and key exact agreement is at least 70%. Otherwise report the numbers to the owner before shipping.
- **A4 Replace.** The `analyse` job and `packages/core/src/analysis` move onto Essentia, and the hand-rolled tempo and chroma code is deleted. Analysis runs niced, and a re-analysis job covers the library. *Default:* `analysisResults` keeps its columns, plus an engine version so results can be redone.
- **A5 License.** AGPL is fine for the self-hosted hub. Record it in `revamp-plan.md` §11 as a decision.

## Phases and how they run

Every phase is done by Sonnet agents in parallel worktrees; the orchestrator merges, runs `pnpm check`, and commits on `master` with the package as scope. Agents never touch files outside their workstream; where two workstreams share a file, the later one rebases onto the earlier.

### Phase 1: stack
| Workstream | Items | Files (main) | Order |
|---|---|---|---|
| S-table | K1.1, K1.4–K1.12, K1.14–K1.17 | `react-ui/src/ui/table/`, `pane/`, `columns/`, `lib/list-state.ts`, `plugin-screens` test | first: owns `pane/` |
| S-frames | K2.1–K2.3, K2.6–K2.17 | `form/`, `section/`, `banner/`, `gate/`, `lib/lift`, `pane/` (after S-table) | parallel; its `pane/` edits after S-table merges |
| S-blocks | K2.5, K2.20 | `bar-chart/`, `stats/`, `structure.md` | parallel |
| S-sidebar | K3.1–K3.7, K3.9 | `shell/sidebar*`, `lib/drag.ts` | parallel; before S-player in `shell/` |
| S-player | K4.1–K4.11 | `shell/index.tsx` (web, native), `dock/`, `waveform/`, `lib/player.ts`, ui-core `player.ts`, `tokens.ts` words, native-ui `index.ts`/`package.json`, `audio.md`, decisions | after S-sidebar merges |
| S-server | K5.1–K5.3, K5.4's guide line | plugin-api, plugin-auth, native-ui `index.ts`/`types.ts`, slot catalog | after S-player (native-ui `index.ts`) |
| S-words | K6.1 | `rules.md`, `docs/decisions/`, showcase, JSDoc | last |

Each workstream:
- updates the roster, the guide pages (`frames.md`/`content.md`/`blocks.md`/`controls.md`) and `DESIGN.md` (regenerated, never edited);
- updates `slot-catalog.md` if a slot changes;
- keeps the showcase green (`pnpm stories`, the showcase's `test-screens`).

### Phase 1b: after phase 1
A read-only check of the hand-written `useSyncExternalStore` sites, web and native. A helper of about 15 lines in ui-core is proposed only if at least 5 share a shape.

### Phase 2: TrackVault, once phase 1 is on stack's master (linked, no pins)
1. **T-adopt** (one agent, first): T7.1–T7.3, T7.5, T1.1, T1.2, T1.3. Everything else builds on the shared row and figures.
2. Parallel, by flow, each owning its routes and `lib/` files:
   - **T-library:** T2.1, T2.3–T2.9.
   - **T-acquire:** T3.1–T3.6.
   - **T-cleanup:** T4.1–T4.6.
   - **T-tags:** T5.1–T5.8, T1.4's Organiser/Rules/Genres/Aliases.
   - **T-system:** T6.1–T6.7.
   - **T-ia:** T1.5–T1.8 (sidebar, renames, glossary, empties, the landing Banner). It merges last, because the renames touch every screen's words.
3. **T-analysis** runs alongside from the start of phase 2 (A1–A5), in `packages/core/src/analysis`, `server/jobs/analyse.ts`, the agent report and `scripts/`. T2.2's record half waits for T-library.

### Phase 3: verification (T8)
- Run `stack screens test --screen <the screens Phase 2 changed> --state data,empty --mode dark --width 320,1920 --shots shots`, never `--all`, and the 1920×1080 viewport shots of those screens.
- Narrowed screens with shots at 320 and 1920 dark, a critic reading them against the first critique, and a seeded-hub run.
- Run the critique again with `review/critique/CHECKLIST.md` over those screens, and compare with the first pass item by item. A screen outside the run is named as not re-checked.
- Update `status.md`.
