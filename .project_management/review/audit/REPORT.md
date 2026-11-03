# Stack UI audit: what the TrackVault revamp added (364a2c5^..HEAD)

Scope: plugins/react-ui, plugins/native-ui, packages/ui-core (131 files, 21 commits), split in five
families audited by read-only Sonnet agents; their item-by-item tables (commit, file:line, callers,
docs for every item) are `1-audio.md`, `2-native.md`, `3-table.md`, `4-drag-sidebar.md`,
`5-forms-frames.md` in this folder. The orchestrator re-checked the load-bearing claims against
the tree (marked ✓).

Classes: **G** general · **A-real** / **A-nominal** app-shaped (generalisation real or nominal) ·
**S** app-specific.

## 1. The table

| # | Item | Class | Callers (stack / TrackVault) | Verdict | Proposed fix |
|---|---|---|---|---|---|
| 1 | Shell owns the `<audio>` and mounts the dock unconditionally (web `shell/index.tsx:207` ✓, native `shell/index.tsx:107` ✓); global Space/Left/Right listener, mediaSession | **S** (music/podcast pattern in every app's frame) | showcase player stories / hub library, record; phone | Out of the Shell | Opt-in `plugin-player` contributing its dock through a new generic Shell slot (`shellFoot`, a list of `{ import, order }` rendered as a virtual module, like `react.slots.providers`), web and native. Update `docs/decisions/the-player-is-the-shells.md`. |
| 2 | `expo-audio` dependency + its config plugin (background audio mode, Android media service) added to **every** native-ui app (`native-ui/src/index.ts:453-515` ✓, package.json ✓) | **S** | stack `apps/phone/src/app/player.tsx` / TrackVault phone (reaches it via `link:../../../stack/apps/phone/node_modules/expo-audio` ✓, a hack) | Out of native-ui | Moves with #1 into the player plugin's native half. |
| 3 | Player store `createPlayer`, `Output`/`PlayerHost` seam, queue providers, `windowQueue`, async `track()` (ui-core `player.ts`, react-ui `lib/player.ts`) | **A-real** (neutral API; any media queue) | showcase / hub `lib/library.tsx:295-312`, `lib/queue.ts`; phone `lib/play.ts` | Keep the design, move the home | Into the player plugin with #1. |
| 4 | `Waveform` component + ui-core `waveform.ts` | **A-real** (audio/video scrubbing) | showcase `frames/waveform.tsx` / hub `lib/track-record.tsx` | Keep, move | Into the player plugin. |
| 5 | `Track.markers`, `Marker.family`, flag/label drawing in Waveform (`descriptors.ts:982-1006`, `waveform/index.tsx:116-163`) | **S** (DJ cues) | showcase fixtures ("Drop", "Break") only / none | Remove | Delete; re-add as neutral `marks` in the plugin when TrackVault's cues land. |
| 6 | `Track.headers` (`descriptors.ts:1009` ✓, native `player.tsx:107,194`) | **S**, unused | none ✓ / none (phone signs addresses) | Remove | Delete. |
| 7 | Music nouns in the shared core: `Words.trackFailed` "Couldn't play this track." (`tokens.ts:1586,1717` ✓) and 9 more required player words; `Track.artwork` / `meta` ("an artist or an album"); `PLAYER_*`/`WAVEFORM_*` variants, `waveform` size, `Track`/`Peaks`/`Marker` descriptors, `./player`, `./waveform` exports, DESIGN.md entries | **S** in ui-core | every consumer must supply player words it may not use | Out of ui-core | Move with #1; rename `trackFailed`→`playFailed`, `artwork`→`image`, `meta`→`subtitle`. Prerequisite: `Words` must take plugin-owned entries (today a closed list in ui-core). |
| 8 | `SliderBase` `bare`/`said`, `lib/ink.ts` | **A-nominal** (internal, dock and Waveform only) | dock / – | Move | With #1 (or keep internal and document as the dock's). |
| 9 | Table and player key handoff: the Table leaves Space unclaimed without `choose`; the Shell skips arrows inside `role="grid"`; the dock's `PRESSED` selector lists `[role="gridcell"], [role="row"]`, which the Table never renders | behaviour **G**, text **S**; selector dead | – | Reword, delete dead code | Table comment (`table/index.tsx:1205`), `rules.md:260`, `reference.md:63`, roster Table say "Space is not claimed", not "goes to the player"; the player plugin owns its own key rule. |
| 10 | `nativeUi({ server })`: client-only phone app of another app's server (`native-ui/src/index.ts`, `types.ts`) | **A-real** shape, wrong home; detects auth by string-matching `"auth.session"` (`index.ts:348`); `requires` dropped to `["expo"]` while it imports api/auth subpaths | – / TrackVault phone `stack.config.ts:15` | Move | Into plugin-api (a client of another server, web or native); plugin-auth exposes "has auth" as a slot; restore `requires`. |
| 11 | TrackVault nouns in stack text: rules.md drag/sidebar/table examples (tracks, BPM, playlists), `docs/decisions/a-drag-is-data.md`, descriptors JSDoc, Shell JSDoc "While a track is loaded", showcase `library.tsx`, `crates.tsx`, Camelot fixtures | **S** (words only) | docs, showcase | Reword | Neutral examples (tasks onto projects, labels, boards). |
| 12 | Table: columns menu, `hidden`, eight-or-more rule, figure widths, cell cursor, Enter/Shift+Enter/Context Menu, range ticks, `choose`/`select` + docked bar, `Picked`/`onPick`, window reads, sort through the input, frozen acts column, `useWide` | **G** | showcase `frames/table.tsx`, requests / hub everywhere | Keep | — |
| 13 | `columnsKey` joins every column key (`list-state.ts:659`): adding a column wipes the viewer's saved choice; two unlabelled tables with the same keys share it | bug | – | Fix | Key by `label`, fall back to a hash of the keys. |
| 14 | Phone Table: roster lists `choose`/`row` acts as shared, native has no `TablePick` and no acts column | parity | – | Decide | Build on the phone, or mark web-only in the roster like `drag`. |
| 15 | Sidebar `drop`, `PlaceSpec.children` (nested places, folds per branch, spot routes, tree keyboard) | **G** (labels, folders, projects, boards) | showcase `frames/shell.tsx` / hub `route.tsx`, `lib/playlists.tsx` | Keep | — |
| 16 | Drag payload `{ kind, picked }`, `reorder` (`index` and `after/before`), label, accent line, edge scroll, menu/keyboard floor, row acts on a key | **G** | showcase / hub `sets.tsx:202` (index), `playlists.$playlistId.tsx:124` (after/before) | Keep | — |
| 17 | Menu floor misses drops under folded branches (`useOffers`, `lib/drag.ts:385`: only mounted drops) | bug | – / nested playlists | Fix | Register every spec's drop, drawn or not. |
| 18 | `Drop<Q = unknown>` forces `drag.picked as never` | typing | – / hub `lib/playlists.tsx:70`, `playlists.tsx:117` | Fix | Generic over the selection's query. |
| 19 | Form `onChange`, Sheet `after`, `secret` control, selections in act/option/Banner/empty/description text (`lift`), Section frames with `read`, Stats cell frame, BarChart `bar.label`, `Text` `role`→`kind`, font fallbacks | **G** | showcase screens (917d8fb) / hub settings, bulk-edit, organiser, stats, sets | Keep | — |
| 20 | `secret` in a submit form: an untouched saved secret on a nullable field is sent as `null` and removed (`form/index.tsx:283-334`) | bug (latent: TrackVault forms are `commit="field"`) | – | Fix | Skip an untouched secret when the form assembles its input. |
| 21 | `onChange` does not report the first values (a prefilled sheet's preview stays empty until a keystroke) | bug | – / hub "Edit rule" sheet `playlists.$playlistId.tsx:93` | Fix | Call `onChange` once when `values` land. |
| 22 | `lift` hard-codes the key `options` | wart | – | Fix | Nesting key as a parameter. |
| 23 | BarChart measures its plot in JS (`useWidth`, ResizeObserver ✓) without a place in structure.md rule 7's closed list; `AXIS_CHAR = 7` px fixed at every density | rule gap | – | Fix | Add to rule 7 with the reason (bar names thin by width), or derive the label room from CSS; size by the density's caption. |
| 24 | Section with `items` also taking `read` | contested | showcase `crates.tsx:56` / hub Sections with `read=` (playlists, devices, backups, sets) | Verify | One auditor calls it nominal (no second distinct read in TrackVault); the hub has ten Sections with `read=`. Check each before dropping anything. |

## 2. Fixes ranked (clean-up for stack against cost to TrackVault)

1. **Words and dead fields (#5, #6, #9, #11, rename in #7).** No behaviour change, about an hour, and stack stops speaking DJ. Cost: TrackVault renames two `toTrack` fields (`artwork`, `meta`) in `ui/track.ts` and the phone's `lib/play.ts`.
2. **Bugs (#13, #17, #18, #20, #21, #22, #23).** Small, local, and they fix things for every app. Cost: none, and two casts go away.
3. **The player plugin (#1 to #8).** The biggest clean-up: no audio element, dock, key listener, music words, `expo-audio` or background-audio entitlement in any app that doesn't ask for it. It needs two new general seams: a Shell foot slot (web and native) and plugin-owned words. The slot is a new public surface, justified only if a second contributor is plausible (an upload tray, a call bar, a sync strip). Cost: add `player()` to the hub and phone `stack.config.ts`; about 6 to 9 import paths change; the phone's `expo-audio` link hack goes away.
4. **`server` to plugin-api, auth by slot (#10).** Removes a cross-plugin string match and puts a general capability where web apps can use it too. Cost: one config line in the phone.
5. **Phone Table parity (#14)** and **Section `read` (#24):** decide, then a small change.

## 3. Leave as is

- **The Table (#12) and windowed reads, `Picked`:** data-driven, no TrackVault noun, with stack callers. They are what a 50k-row app needs and what any admin or CRM needs.
- **Drag, drop, reorder and nested places (#15, #16):** the pattern of Linear, Gmail labels, Notion and Trello. The `index`/`after-before` pair is used both ways.
- **The form and frame additions (#19):** each extends the existing Datum, act and frame model rather than adding a mechanism; the showcase exercises them.
- **The queue design and Waveform (#3, #4):** keep the API as it is and move only its home.
- **`role`→`kind`:** fixes a Biome false positive for every consumer. The leftover internal names (`TextRole`, `text({ role })`) can stay.

Open questions:
- Whether Space on a sidebar tree row should navigate (WAI-ARIA uses Space to select).
- Whether merging drops that share a label can hide two targets.
- Whether the phone should match the web Table (#14).
- How `Words` should take plugin entries (prerequisite of #3).
