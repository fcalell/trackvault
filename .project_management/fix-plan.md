# Fix plan: design critique, table grid, stack UI audit

Sources (all in `review/`):
- `critique/SUMMARY.md` and its six group reports, plus `CHECKLIST.md`: the design critique of every hub screen at 1920 dark.
- `board-1-problems.png` and `board-2-fixes.png`: the table-grid problem and its prototypes.
- `audit/REPORT.md` and its five family reports: the audit of stack's UI from `364a2c5` to `98bd7f7`.

The owner made every decision below. Where an item says *default*, the owner was not asked and the plan picks the option that follows stack's principles; change it before that phase starts if needed.

IDs: **K** is stack, **T** is TrackVault. The goal for stack is that it stays a shared design system: no prop, branch or word that exists for one app's use case, and structural fixes over local overrides. Already done: every component prop is in stack's guide (stack `98bd7f7`: `frames.md`, `controls.md`, `content.md` and `blocks.md`, web and native).

## Decisions

| Topic | Decision |
|---|---|
| List width | The app sets `wide` on a list Pane. `stack screens test` flags a `Table` inside a measured (not `wide`) Pane. No automatic rule. |
| Table form | 2a + 2b. The grid draws at any desktop width (list rows only on touch or below `tablet`), and a `wide` Pane takes the spare room while the record beside it holds the list width. |
| Selection bar | Redesign it. The acts that don't fit are not settled: research first (Mobbin, next session), then 2 or 3 prototypes for the owner to choose from. |
| Player | Composition, not a plugin. The Shell gets a generic `foot` region; the app writes `<Shell foot={<Dock />}>`. Dock, Waveform, `createPlayer` and the queue become neutral roster parts that nothing mounts by default. The engine is injected through the `Output` seam: the browser's audio element on the web; on native an adapter at `@fcalell/plugin-native-ui/audio/expo`, with `expo-audio` an optional peer. native-ui drops the `expo-audio` dependency and its config plugin. |
| Player words | Stay in `Words`, worded neutrally (`playFailed` and the rest). No plugin-owned words. |
| Player fields | Delete `Track.headers` and `Track.markers`/`Marker` now; re-add neutral marks when cues land. Rename `artwork` to `image` and `meta` to `subtitle`. |
| `server` option | Moves from `nativeUi` to plugin-api, for web and native. plugin-auth exposes "this server has auth" through a slot. |
| Phone Table | `choose`/`Picked` and the row-acts column are marked web-only in the roster, like `drag`. |
| Optional mark | A field-commit form marks nothing (no "Optional", no "Required"). |
| Empty precedence | A Pane with no `empty` of its own lets its Sections draw their own. |
| Section `read` | Dropped from a Section with `items`. A real second read is held by the Pane or an enclosing Section. |
| Tree Space | Space does nothing on a sidebar tree row; Enter navigates. |
| Same-label drops | Name them by path when labels clash ("Sets › Warm-up", "Archive › Warm-up"). Never merge them. |
| rules.md length | Leave it. |
| Library primary | Add to playlist. |
| Sidebar | Groups by job: **Library** (All tracks, Inbox, Stats) · **Playlists** (the tree, Set builder) · **Get music** (Soulseek, Wishlist, Downloads) · **Clean up** (Issues, Duplicates, Organiser, Rules, Auto-tag review) · **Tags** (Genres, Aliases, Tags) · **System** (Devices, Jobs, History, Quarantine, Backups, Settings). Places with work waiting show counts. *Default:* Inbox stays in Library, because it is where new music lands. |
| Landing | `/` stays the library, with a Banner when something needs the owner (inbox waiting, conflicts, a failed backup, a failed job). |
| Renames | Review → Auto-tag review · Custom tags → Tags · Cleanup rules → Rules · Search → Soulseek. |
| Duplicate places | Playlists becomes the page that manages playlists. Recently added stops being a place and becomes a sort (Added, newest first) of All tracks. |
| Track record | Waveform first, then Tags. The big cover goes; a compact one stands beside the facts. |
| BPM and key | Replace the analysis with Essentia (essentia.js, WASM, AGPL). |
| Conflicts | Two sides only, with a confirm before writing to Rekordbox. No base value and no schema change. |
| Organization step | Skipped when the user has exactly one organization (a stack auth fix). |
| Settings | One page per area. |

## Stack

### K1 Layout and the Table
- **K1.1** The screens test (`plugin-screens`) fails a screen whose `Table` stands in a measured Pane, naming the route and the Pane. The `wide` documentation is already done.
- **K1.2 (2a)** The Table chooses grid or list rows by the input device, not by its own width. It draws the grid at every width from `tablet` up when the pointer is fine. List rows are for coarse pointers or below `tablet`. A narrow container scrolls sideways under the frozen title column, which already exists. This replaces the 768 px own-width test in `useWide` (`table/index.tsx`).
- **K1.3 (2b)** In a `Columns`/Pane row, a `wide` Pane takes all the spare room and the record beside it holds the list width (`w-list`, floor 340). Today the pane before the last holds the list width. The order is fixed by role (the list stays first and wide), and narrow viewports still `cover`.
- **K1.4** The frozen acts column gets an opaque ground and an edge rule, so cells scrolling sideways stop running under it.
- **K1.5** *Default:* the `age` figure width fits the longest word the density's `Words` produce ("5 seconds", "11 months"), measured once from the words, not per app.
- **K1.6** Selection bar redesign. This needs research (see Phase 1b). Whatever the design, these hold:
  - the count keeps its width;
  - no bar over an empty table;
  - counts are formatted ("48,210 of 48,210");
  - "Select all" shows only when the window holds less than the total.
- **K1.7** `columnsKey` keys by the Table's `label`, falling back to a hash of the sorted keys, so adding a column keeps the viewer's choice.
- **K1.8** The roster marks phone `choose`/`Picked`/row acts as web-only; native types refuse them.
- **K1.9** The list form names a figure in its meta by the column's `label` ("Added 1 day", "29 days left"), so columns stay told apart without headers.

### K2 Frames, forms, text, charts
- **K2.1** A `commit: "field"` form marks no field as optional. A submit form keeps today's rule.
- **K2.2** A Pane with no `empty` lets its Sections draw their own `empty`. Only a Pane that declares `empty` replaces its body.
- **K2.3** A Banner's act is the outlined act, never text tinted in the tone's colour.
- **K2.4** BarChart fills its container. Its plot measure is added to `structure.md` rule 7's closed list of JS measures, with its reason. Label room comes from the density's caption size, not `AXIS_CHAR = 7`.
- **K2.5** Stats: the unit follows the figure ("4,583 hours"), not the cell's end.
- **K2.6** Failure forms follow the frame:
  - when a place's own reads fail, it draws one failure form, not one per Section;
  - the not-found form offers no Back where `back={false}`.
- **K2.7** Loading shape: a Section paints as many rows as it last loaded, or `PAINT_ROWS` when it has never loaded. The screens test's shift check covers loading → data.
- **K2.8** In a submit form, an untouched saved `secret` is left out of the input, not sent as `null`.
- **K2.9** Form `onChange` fires once when `values` land.
- **K2.10** `lift` takes the nesting key as a parameter.
- **K2.11** Drop `read` from a Section with `items`, together with its frame code, roster entry, the showcase `crates.tsx:56` use and the docs (`rules.md` frame paragraph, `content.md`).
- **K2.12** Row `status` always draws its word beside the dot. The Section count counts items, not fact rows. The list band uses the row height. A Section heading with an icon act wraps its description at the heading's width, not early.
- **K2.13** A blocked submit names the field it waits for ("Type a name"), from the field's label. The generic "Type a value" goes.

### K3 Sidebar, drag
- **K3.1** The sidebar's `end` group is pinned and the middle scrolls on its own.
- **K3.2** The menu and keyboard floor offer every spec's drop, folded branches included. Drops register from the place specs, not from mounted rows.
- **K3.3** `Drop` and `Dragged` are generic over the selection's query, which removes the `as never` casts.
- **K3.4** Space does nothing on a tree row (WAI-ARIA); Enter navigates and arrows fold.
- **K3.5** When two drops share a label, the drop menu names each by its path.

### K4 The player by composition
- **K4.1** The Shell gets a generic `foot` region, web and native, laid out where the dock stands now. It draws nothing when empty. Document it in `frames.md` and the roster, and update `docs/architecture/slot-catalog.md` only if a slot changes.
- **K4.2** The Shell stops owning audio:
  - no `<audio>`, no default dock mount, no global Space/Left/Right listener, no mediaSession;
  - the Dock component owns its keys and mediaSession while mounted, and its key rule gives way inside inputs and the Table's grid as it does today;
  - the `PRESSED` selector's dead `[role="gridcell"], [role="row"]` goes.
- **K4.3** The engine comes through the `Output` seam:
  - the web passes an `HTMLAudioElement` output, a roster helper;
  - the native adapter `@fcalell/plugin-native-ui/audio/expo` wraps `expo-audio`, declared as an optional peer. Apps that import it add `expo-audio` and its config plugin themselves; the adapter's guide page shows the `app.json` lines.
  - native-ui's `package.json` and config plugin (`src/index.ts:453-515`) drop `expo-audio`.
- **K4.4** These stay in the roster as neutral parts: `createPlayer`, `QueueProvider`, `windowQueue`, async `track()`, `Waveform`, and the `Track`/`Peaks` descriptors. `SliderBase` `bare`/`said` and `lib/ink.ts` stay internal and are documented as the Dock's and the Waveform's.
- **K4.5** Delete `Track.headers`, `Track.markers`, `Marker` and the flag/label drawing in Waveform. Rename `trackFailed` → `playFailed`, `artwork` → `image` and `meta` → `subtitle`. Reword the player words neutrally (no "track").
- **K4.6** Table text says "Space is not claimed" (`table/index.tsx:1205`, `rules.md`, `reference.md`, roster), not "goes to the player".
- **K4.7** Rewrite `docs/decisions/the-player-is-the-shells.md` to the composition. Rewrite `audio.md` (web and native) to `<Shell foot={<Dock />}>` with an injected output.

### K5 A client of another app's server
- **K5.1** `server` moves from `nativeUi` to `api({ server })` and works for web and native client-only apps.
- **K5.2** plugin-auth contributes "this server has auth" through a typed slot. Delete the `"auth.session"` string match (`native-ui/src/index.ts:348`). Update the slot catalog.
- **K5.3** native-ui `requires` names what it imports.
- **K5.4 (T5.7's stack half)** The organization step is skipped when the user has exactly one organization: that organization becomes active and the flow continues. With none, the step still asks.

### K6 Words and examples
- **K6.1** Neutral examples in place of DJ nouns (tasks onto projects, labels, boards). This covers:
  - `rules.md` (drag, sidebar and Table examples);
  - `docs/decisions/a-drag-is-data.md`;
  - descriptor and Shell JSDoc;
  - the showcase `library.tsx`, `crates.tsx` and the Camelot fixtures. The player showcase keeps a generic audio example.
- **K6.2** rules.md stays as it is (owner's decision).

## TrackVault

### T1 Across the app
- **T1.1** Set `wide` on every list Pane (about 25 routes).
- **T1.2** One track row and one track column set in `ui/track.ts`, used by these screens:
  - library, playlists, sets and stats;
  - inbox, duplicates and Auto-tag review;
  - wishlist, quarantine and previews.

  The row is "Title (Mix)" with the artist under it, one leading mark and one end group.
- **T1.3** One figures module, `ui/figures.ts`: count, BPM, key, duration, size, bitrate, age and date. The eight route-local `Intl.NumberFormat`s go.
- **T1.4** The commit act is the primary on Organiser, Rules, Genres and Aliases. The library bar's primary is Add to playlist.
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
  - Recently added becomes the Added sort, and the `/recent` routes go.
- **T2.6** The library selection bar follows the K1.6 design.
- **T2.7** Playlists is the manage page: create, rename, folders, smart rules and counts, not the sidebar tree again.
- **T2.8** One queue mechanism (`windowQueue`); the 200-row slice in `lib/queue.ts` goes.

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
- **T5.7** Adopt K5.4 (no org step for the single owner).

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
- **T6.5** Secrets draw the "Saved, ends in …" hint.
- **T6.6** Stats charts name bars with `bar.label`, with one count format (T1.3).
- **T6.7** Set builder:
  - Next first;
  - reasons as BPM, key and energy deltas;
  - the energy chart named by step;
  - no score over an empty set.

### T7 Adopting stack
- **T7.1** `<Shell foot={<Dock />}>` in the hub and the phone, with the outputs injected and the `artwork`/`meta` renames (`ui/track.ts`, phone `lib/play.ts`).
- **T7.2** The phone adds `expo-audio` and its config plugin itself and imports `@fcalell/plugin-native-ui/audio/expo`. The `link:` into stack's `apps/phone/node_modules/expo-audio` goes.
- **T7.3** The phone's `server` moves to `api({ server })`. The two `as never` casts go (K3.3). The ten redundant Section `read=` go (K2.11).
- **T7.4** `pnpm check` is green in both repos, and `stack screens test` passes on every changed screen.

### Analysis (T2.2)
- **A1 Spike.** Run essentia.js in a Node worker thread (`new Worker(new URL(...))`, bundled by `stack build`). Feed it ffmpeg-decoded PCM at 44.1 kHz mono over the whole track or a 2-minute window, whichever meets the budget. Use `RhythmExtractor2013` for BPM, with the beat positions kept for a later grid, and `KeyExtractor` with the `edma` profile for key. Measure time and memory per track on the homelab's CPU class.
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
| S-table | K1.1–K1.5, K1.7–K1.9 | `react-ui/src/ui/table/`, `pane/`, `columns/`, `lib/list-state.ts`, `plugin-screens` test | first: owns `pane/` |
| S-frames | K2.1–K2.3, K2.6–K2.13 | `form/`, `section/`, `banner/`, `gate/`, `lib/lift`, `pane/` (after S-table) | parallel; its `pane/` edits after S-table merges |
| S-blocks | K2.4, K2.5 | `bar-chart/`, `stats/`, `structure.md` | parallel |
| S-sidebar | K3.1–K3.5 | `shell/sidebar*`, `lib/drag.ts` | parallel; before S-player in `shell/` |
| S-player | K4.1–K4.7 | `shell/index.tsx` (web, native), `dock/`, `waveform/`, `lib/player.ts`, ui-core `player.ts`, `tokens.ts` words, native-ui `index.ts`/`package.json`, `audio.md`, decisions | after S-sidebar merges |
| S-server | K5.1–K5.4 | plugin-api, plugin-auth, native-ui `index.ts`/`types.ts`, slot catalog | after S-player (native-ui `index.ts`) |
| S-words | K6.1 | `rules.md`, `docs/decisions/`, showcase, JSDoc | last |

Each workstream:
- updates the roster, the guide pages (`frames.md`/`content.md`/`blocks.md`/`controls.md`) and `DESIGN.md` (regenerated, never edited);
- updates `slot-catalog.md` if a slot changes;
- keeps the showcase green (`pnpm stories`, the showcase's `test-screens`).

### Phase 1b: selection bar design (new session, Mobbin connected)
1. Research how data tables with many bulk acts show the acts that don't fit: Linear, Gmail, Notion, Airtable, Figma, GitHub, Superhuman and others on Mobbin.
2. Build 2 or 3 prototypes on the library at 1440 and 1920, with a record open and with 9 acts.
3. The owner picks, then K1.6 goes to S-table as a follow-up.

### Phase 2: TrackVault, once phase 1 is on stack's master (linked, no pins)
1. **T-adopt** (one agent, first): T7.1–T7.3, T1.1, T1.2, T1.3. Everything else builds on the shared row and figures.
2. Parallel, by flow, each owning its routes and `lib/` files:
   - **T-library:** T2.1, T2.3–T2.8 and T1.4's library primary.
   - **T-acquire:** T3.1–T3.6.
   - **T-cleanup:** T4.1–T4.6.
   - **T-tags:** T5.1–T5.6, T1.4's Organiser/Rules/Genres/Aliases.
   - **T-system:** T6.1–T6.7.
   - **T-ia:** T1.5–T1.8 (sidebar, renames, glossary, empties, the landing Banner). It merges last, because the renames touch every screen's words.
3. **T-analysis** runs alongside from the start of phase 2 (A1–A5), in `packages/core/src/analysis`, `server/jobs/analyse.ts`, the agent report and `scripts/`. T2.2's record half waits for T-library.

### Phase 3: verification (T8)
- Run `stack screens test --all --state data,empty --mode dark --width 1920 --shots shots` and the 1920×1080 viewport shots again.
- Run the critique again with `review/critique/CHECKLIST.md`, and compare with the first pass item by item.
- Update `status.md`.
