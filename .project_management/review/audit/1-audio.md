# Audit 1: audio, web and core (player, dock, Waveform, queues, Table key handoff)

Stack at `~/projects/stack`, range `364a2c5^..HEAD`. All player/waveform code is new in range (no
pre-range version). Commits: 93de58e (dock + Waveform + ui-core player/waveform, all of it),
acf03bf (Table keys + the grid comment in player.tsx), 3da976b (QueueProvider, windowQueue),
331b6ec (createPlayer store moved to ui-core for the phone: `Output`, `PlayerHost`), 6dc899b
(`Track.headers` artwork, async `track()` in windowQueue).

Headline facts that drive the verdicts:
- The Shell mounts `<Player />` unconditionally (`shell/index.tsx:207`), so every Shell app
  (reactUi consumer) bundles the audio element, mediaSession code, `Waveform` and `SliderBase`
  extras, plus a `window` keydown listener while a track is loaded. No option turns it off.
  `docs/decisions/the-player-is-the-shells.md` records "no prop on the Shell" as a decision, so the
  only way to be opt-in is a plugin and a slot.
- The consumer set is exactly: stack showcase (`showcase/frames/shell.tsx:100-135`,
  `frames/waveform.tsx`), the stack phone demo (`apps/phone/src/app/player.tsx`), TrackVault hub
  (`library.tsx:303-307`, `track-record.tsx:40-82`) and TrackVault phone (`phone/src/lib/play.ts`).
  Every real caller is a music library.
- The slot catalog (`docs/architecture/slot-catalog.md`) has no player/dock/foot slot, and no Shell
  seam at all: slots are build-time codegen (`react.slots.providers` -> `virtual:stack-providers`,
  `reactUi.slots.*` are only css/fonts/theme at lines 154-163). The Shell has `places, groups,
  banner, switcher, children` and nothing to hold a foot.

## 1. Table

| # | Item | Commit | Where (HEAD) | Class | Callers stack / TrackVault | Docs | Verdict | Proposed fix | Cost to TrackVault |
|---|------|--------|--------------|-------|---------------------------|------|---------|--------------|--------------------|
| 1 | Shell owns the one `<audio>` and draws the dock for every app (`<Player />` in the column, hairline bar, transport, time, seek, volume, close, touch two-bar layout, mediaSession lock screen/media keys, `window` keydown listener) | 93de58e, 331b6ec | `plugins/react-ui/src/ui/components/shell/index.tsx:45,207`; `shell/player.tsx:89-259` (mediaSession `:131-163`, key listener `:117-129`, `<audio>` `:200-225`) | app-shaped, nominal for the apps that matter: "a docked audio bar" serves music/podcast/voice-note apps, not "most data-heavy apps"; video review needs a `<video>` on the screen, calls are not a queue | stack: showcase `frames/shell.tsx:100-135`, phone demo `apps/phone/src/app/player.tsx`; TV: hub `library.tsx:303`, `track-record.tsx:42`, phone `lib/play.ts` | `guide/audio.md`, `guide/rules.md:103-107`, `docs/decisions/the-player-is-the-shells.md`, `docs/architecture/ui-core.md:243-253`, roster `Shell` comment `roster.ts:1095-1107` and its `draws` list `:1139-1147` | Not general. Move out of the Shell core into an opt-in plugin (`plugin-player`) that contributes the dock through a Shell foot slot (section 3). The "survives navigation" argument in the decision doc holds for a slot-mounted component exactly as for a built-in one (it still renders above the routes). | See section 3: `reactUi.slots.shellFoot` (and `nativeUi.slots.shellFoot`), a `list` of `{ import, order }` rendered by the Shell under the place; `plugin-player` contributes `Dock`. Shell drops its player import, the PLAYER_* entries of its roster `draws`, and the player paragraph of its comment. | Add `player()` to `apps/hub/stack.config.ts` and `apps/phone`'s; change imports `@fcalell/plugin-react-ui/lib/player` -> `@fcalell/plugin-player/lib/player` in `library.tsx:6`, `track-record.tsx:9-14`; `@fcalell/plugin-react-ui/components/waveform` in `track-record.tsx:9`; phone `lib/play.ts:1`. No logic change. |
| 2 | `Track` type: `src, title, meta, artwork, duration, peaks, markers, key, headers`, living in the shared descriptors file | 93de58e, 6dc899b | `packages/ui-core/src/descriptors.ts:994-1011` (`Peaks` `:975`, `Marker` `:982`) | app-specific naming, partly general shape. `title/duration/key/src` are generic media; `meta` is documented "an artist or an album", `artwork` is a cover, `peaks`/`markers` are audio-editor/DJ concepts ("a cue", "the listener may want to return to"); a generic descriptors file now names music | stack: showcase, phone demo, both `lib/player.ts`; TV: `apps/hub/src/app/ui/track.ts:27-41` (`toTrack`), phone `lib/play.ts:50-65` | `audio.md:14-32`, `docs/architecture/ui-core.md:243` | Move out of `descriptors.ts` into the player plugin's own types (ui-core keeps a sound-free `player.ts`/`waveform.ts` module only if native-ui still shares it, see 3). Rename optional: `Track` -> keep (it is the app's word), but `meta` -> `subtitle`, `artwork` -> `image` would remove the music nouns for free. | Re-export type from the plugin; one-line import change in `ui/track.ts:1`, phone `play.ts:2`, phone demo. Renames touch `toTrack` in 2 places. | 
| 3 | `Track.headers` (request headers for file and dock cover, phone only; web cannot send them) | 331b6ec, widened in 6dc899b "artwork headers" | `descriptors.ts:1009-1010`; consumed `plugins/native-ui/src/ui/components/shell/player.tsx:107,194` | app-shaped, nominal and currently unused: no caller sets it | stack: no caller (phone demo `player.tsx:8` sets none); TV: none. TV phone signs the address instead (`phone/src/lib/play.ts:1-12,55-62`, comment says "carry their own access"); `headers` in `apps/phone/src/lib/api.ts:26` is the API client's, not a Track's | `audio.md` (native) `:22,36`, descriptor comment | Remove until a caller exists. It also makes the web/phone contract asymmetric ("the web cannot send any"), the exact kind of platform-split field the structure guide avoids. | Delete the field and its two uses in native-ui. | None. |
| 4 | `Track.markers` / `Marker.family` (cue flags, hue per cue, labels at record fit) | 93de58e | `descriptors.ts:982-989,1006`; `waveform/index.tsx:128-163`; `shell/player.tsx:277` (dock passes `markers`) | app-specific (DJ cues) with a neutral type name | stack: showcase only (`frames/waveform.tsx:13-18`, `frames/shell.tsx:117-121`); TV: none (`grep markers apps/` is empty; `toTrack` `track.ts:27-41` never sets it) | `audio.md:50-53,73-78`, roster `Waveform` `roster.ts:2034-2041` | Speculative: zero real callers, and the showcase data ("Drop", "Second drop", "Break") is DJ vocabulary. Either remove until TV's cue feature lands (TV schema has `cues`), or keep as a neutral `marks: { at, label, tone? }` inside the plugin. Remove is cheaper. | Delete `markers` prop, `Marker`, flags/lane drawing (`waveform/index.tsx:116-163`), `WAVEFORM_LABEL`, `family` -> `chip-*` ink reads. | None today; when cues ship TV passes them, so plugin-owned `marks` is the landing spot. |
| 5 | `Waveform` component (canvas peaks, slider semantics, fit bar/record) | 93de58e | `plugins/react-ui/src/ui/components/waveform/index.tsx:1-257`; arithmetic `packages/ui-core/src/waveform.ts`; export `plugins/react-ui/package.json:72`; roster `roster.ts:2041-2064` | app-shaped; the generalisation is real at the component level (any recorded audio: voice notes, podcasts, call review) and carries no TV noun besides `markers` (row 4) | stack: dock `shell/player.tsx:268`, showcase `frames/waveform.tsx`; TV: `track-record.tsx:74-82` (record page), plus peaks fetch `ui/track.ts:44-56` | `audio.md:76-97`, decision doc, `rules.md:103-107` | Keep as a component, but ship it with the player plugin (it is the only consumer of `peaks`, `inkOf/onInkChange` canvas ink, the `WAVEFORM_*` and `waveform` size tokens, and the `seek` words). `platforms: ["web"]` already tells the roster it is not cross-platform. | Same plugin as row 1: the roster entry, tokens and `ui/lib/ink.ts` (if canvas-only) move; or `Waveform` stays in react-ui and only the dock moves (cheaper, less clean). | One import path (`track-record.tsx:9`). |
| 6 | Player API: `player`, `usePlayer`, `usePlayerTime`, `createPlayer`, `PlayerCommands` (play/load/pause/toggle/seek/skip/setVolume/mute/playNext/playPrevious/close), module singleton | 93de58e, 331b6ec | `packages/ui-core/src/player.ts:109-188` (store), `plugins/react-ui/src/ui/lib/player.ts:17-105`, `plugins/native-ui/src/ui/lib/player.ts` | app-shaped; nominal: single audio domain, singleton by design (decision doc admits "an app cannot mount two") but the command set is neutral (no artist/cue nouns in the commands; `PREVIOUS_RESTART`, `trackTime` are media-generic) | stack: showcase, phone demo; TV: hub `library.tsx:303`, `track-record.tsx:42,81,132`, phone `play.ts` | `audio.md:28-62`, `ui-core.md:243-253` | Not leaked into other components, so it is clean as a domain module; its problem is placement (ui-core + react-ui core), not content. Moves with row 1. Naming the store module `media`/`audio` instead of `player` is optional. | Leave `createPlayer` in ui-core only while two platforms (react-ui, native-ui) share it; otherwise a shared `@fcalell/plugin-player` core with web and native entries. | Import paths only. |
| 7 | Queue providers (`QueueProvider`, `TrackQueue`, `isProvider`, the `ahead/ask/step/given` machinery) and `windowQueue` over a plugin-api window read | 3da976b, 6dc899b | `ui-core/src/player.ts:37-48` and store `:212-270,330-470`, `windowQueue` `:490-567`; `WindowRead` `:490-497` structurally mirrors plugin-api's `Read.page` | app-shaped, real: any 50k-row list that plays (episodes, clips) needs a lazy queue; shape (`next/previous`, promise) has no TV noun. ~170 of 567 lines of the store | stack: no non-test caller (`player.test.ts`, doc example only); TV: hub `library.tsx:306`, phone `play.ts` (`windowQueue` import). Note TV hub's other play path ignores it and uses a 200-row loaded slice (`lib/queue.ts:7-17`, `track-record.tsx:41`), so even TV has two queue mechanisms | `audio.md:36-55`, `ui-core.md:244-247` | Keep (real). It belongs to the player plugin with the store; the structural `WindowRead` coupling to plugin-api is acceptable (no import) but ties ui-core's player to a plugin-api shape, another reason it should not sit in ui-core. | Moves with row 1. Optional TV tidy: record page uses `windowQueue` too and `lib/queue.ts` is deleted (a TV simplification, not a stack change). | None for stack; optional TV cleanup. |
| 8 | Async queue tracks (`WindowQueueOptions.track` may return a promise) | 6dc899b | `ui-core/src/player.ts:499-503,527-535` | app-shaped; one caller (TV phone signing per-track tokens), shape neutral and cheap (`Promise.all` over a page) | stack: none; TV: phone `play.ts` (batches `media.urls`) | `audio.md:57-58` | Keep, real enough (any presigned-URL media: R2/S3 signed GET). Same placement as row 7. | None beyond the move. | None. |
| 9 | Artwork header in the dock (`<img src={track.artwork}>`, `PLAYER_ARTWORK`, mediaSession artwork; native image with `headers`) | 93de58e, 6dc899b | `shell/player.tsx:216-224,140`; `ui-core/src/variants.ts:459`; native `player.tsx:192-196` | app-specific naming ("artwork", cover) for a generic "thumbnail of what is playing"; the TV hub passes `hasArt` covers (`track.ts:36-38`) | stack: none in showcase (no `artwork` in `frames/shell.tsx`); TV: hub `track.ts:35-39`, phone `play.ts:61` | `audio.md:23` | Keep the slot but call it `image`; the credentialed-image header half is row 3 (remove). | Rename in two `toTrack`s. | Trivial. |
| 10 | Table/grid key handoff, Shell side: global `keydown` taken by the player unless defaultPrevented, typing, or the target is inside a "pressed" control (Space) or an "arrowed" widget (arrows, incl. `role="grid"`); `shortcut()` Space/Left/Right | 93de58e (keys), acf03bf (grid note) | `shell/player.tsx:44-87,117-129`; `ui-core/src/player.ts:50-60` | the list-of-widgets logic is general (a global shortcut that yields to focusable widgets); but a *global Space/Left/Right* binding in the Shell is app-specific (every app with a loaded track loses Space page-scroll and arrow handling outside widgets) | stack: Shell only; TV: n/a | `rules.md:260`, `audio.md:66-70`, roster `roster.ts:1105-1107` | Moves with the plugin (the listener is installed by the Dock, only while a track is loaded, already). Dead selector: `PRESSED` lists `[role="gridcell"], [role="row"]` (`:66`), but the Table's `td`/`tr` carry no explicit role (`grep role="gridcell"` in table is empty), so the clause never matches the Table; Space passes only because of that. | Drop `gridcell`/`row` from `PRESSED` or make the contract explicit; remove with plugin move. | None. |
| 11 | Table/grid key handoff, Table side: "Without `choose` Space is not the grid's and goes on to the Shell's player" | acf03bf | `table/index.tsx:1205-1213` (comment); behaviour = Space and `x` only swallowed when `chooser`; rows' `preventDefault` convention `:1200-1226` | The code is general (a handled key is prevented, an unhandled key bubbles). The coupling is only in the comment and docs, which name the player. Verified no `player` import or branch in `table/`. | stack: `table/index.tsx`; TV: library list is a Table over window read without `choose` (`library.tsx:295`) so Space plays | `rules.md:255-261` (names Shell's player twice), roster `roster.ts:1672` ("Space left to the Shell's player otherwise") | Keep the behaviour; reword comments/docs so the Table says "an unhandled key is left unprevented for global shortcuts" and the player's guide owns the Space story. Zero code change in Table. | Comment/doc edits in `table/index.tsx:1205-1206`, `rules.md:260-261`, `roster.ts:1672`; add one clause to the player plugin's guide. | None. |
| 12 | Words and tokens for the dock in global `Words`: `player, play, pause, previous, next, mute, unmute, volume, seek, trackFailed` ("Couldn't play this track.") | 93de58e | `packages/ui-core/src/tokens.ts:1577-1586,1717` | app-specific (`trackFailed` names a track); the rest media-generic but unused by apps without a player | all apps carry them; users: both `shell/player.tsx` | DESIGN.md (emitted) | Move to the plugin's word set, or at least rename `trackFailed` -> `playFailed`. Words are a closed ui-core list by design, so a plugin-owned set needs the words mechanism to take plugin entries (cost in the words system, not here). | If kept in ui-core: rename only. | None. |
| 13 | `SliderBase` `bare` and `said` props added only for the dock's seek/volume | 93de58e | `plugins/react-ui/src/ui/components/slider/base.tsx` (diff) | app-shaped/nominal (internal, one caller) | stack: `shell/player.tsx:290,314` only; TV: none | none | Internal, not public surface, so low cost; but a separate plugin could not use `SliderBase` unless it is exported. Note as a dependency to resolve in the move. (Other auditor owns the slider; flagged only.) | Export `SliderBase` or let the plugin compose `Slider` | None. |
| 14 | Showcase frames `waveform.tsx`, `peaks.ts`, shell player frame | 93de58e | `plugins/react-ui/src/ui/showcase/frames/waveform.tsx`, `showcase/peaks.ts`, `frames/shell.tsx:100-135` | app-specific data ("Midnight Run (Extended Mix)", "Kollektiv Turm", "Drop", "Break") in the shared roster's showcase | showcase only | none | Neutral the fixtures ("Episode 12", "Intro", "Chapter") now; moves with the plugin later. | Edit strings. | None. |

## 2. Fixes ranked (stack cleanliness gained vs cost to TrackVault)

1. Delete `Track.headers` (row 3) and `Track.markers`/`Marker`/flag drawing (row 4). Pure removal of
   unused surface, no TrackVault change. Biggest cleanliness per cost. (markers: when TV's cues land
   it re-adds `marks` inside the plugin.)
2. Reword Table/roster/guide text so the Table no longer mentions the player (row 11); fix the dead
   `gridcell`/`row` selector (row 10); rename `trackFailed`, `artwork`, `meta`, neutralise showcase
   fixtures (rows 9, 12, 14). Comment/word edits only, no TV cost beyond two `toTrack` field renames.
3. Move the dock, store, `Waveform`, `windowQueue`, `Track` and the dock's words/tokens/keys into an
   opt-in `plugin-player` mounted through a Shell foot slot (rows 1, 2, 5, 6, 7, 8, 10). Largest
   cleanup (about 1,600 lines leave the Shell/ui-core core; the Shell stops being unconditionally
   a media player; the "no prop on the Shell" decision is honoured by a slot, not a prop). TV cost is
   mechanical: add the plugin to two configs and change roughly six import paths; no feature changes.
   Prerequisite work in stack: add the slot, resolve the `SliderBase`/words dependency (row 13, 12),
   keep `createPlayer`/`waveform.ts` where native-ui can share them.
4. Optional TV-only: unify `lib/queue.ts` with `windowQueue` (row 7).

## 3. Opt-in plugin and the Shell slot (the proposal)

Is a docked media player something most data-heavy apps need? No. It serves music, podcasts, voice
notes and audio review; video review plays in the screen, call apps own a different surface, and
the rest of the catalogue never loads a sound. The Shell today pays for it unconditionally
(component, listener, canvas ink helper, ~11 words, 7 tokens in the Shell's roster `draws`).

Does the Shell have a slot for it? No. `docs/architecture/slot-catalog.md` has no foot/dock slot,
and `reactUi.slots` (lines 154-163) are css/theme only. A component inside the Shell cannot be
contributed by another plugin today, so the dock got hard-wired.

Proposed slot (symmetric to `react.slots.providers`, which already renders a list of specs into a
generated `virtual:stack-providers` module):

- `reactUi.slots.shellFoot`: `list<ShellPartSpec>` where `ShellPartSpec = { import: TsImportSpec;
  order: number }`, sorted by `order`. react-ui generates `.stack/shell-foot.tsx` (virtual
  module `virtual:stack-shell-foot`, default export a fragment of the contributed components) and the
  Shell renders `<ShellFoot />` where `<Player />` sits now (`shell/index.tsx:207`), full column
  width under the place, clear of the safe inset. No prop on the Shell; an app with no
  contributor renders nothing.
- `nativeUi.slots.shellFoot`: the same shape for the phone (between the place and the tab bar,
  where native's dock draws today).
- `plugin-player` (name `plugin-audio` also fits): owns the singleton store entry points
  (`lib/player`), `Dock`, `Waveform`, the media-session wiring and the key listener; contributes
  `{ import: { name: "Dock", from: "@fcalell/plugin-player/dock" }, order: 0 }` to
  `reactUi.slots.shellFoot`. It reads nothing from other plugins' internals, so it follows the
  "plugins coordinate only through the slot graph" rule. A second contributor (a
  recording-in-progress bar, an upload tray) would use the same slot, which is the evidence the
  slot is a seam and not a player special case.

## 4. Left as is, and why

- Pure ui-core arithmetic (`trackTime`, `neighbour`, `shortcut`, `columns`, `momentAt`, `seekKey`,
  `SEEK`, `PREVIOUS_RESTART`): framework-free, media-generic, shared by web and native, tested
  (`player.test.ts`). Keep, wherever the plugin lands.
- `createPlayer(host)` with `Output`/`PlayerHost`/`PlayerReport`: the platform seam is clean and
  already serves two platforms. Keep in ui-core until the plugin exists, then move with it.
- Queue providers and async `track()` (rows 7, 8): real generalisation, neutral shape. Keep.
- `Waveform` as a component (row 5): general for recorded audio apart from `markers`. Keep.
- Table behaviour (row 11): no code change; only wording.
- `ui/lib/ink.ts` (`inkOf`, `inkVersion`, `onInkChange`): added for the canvas; generic helper for
  any canvas draw (a future chart); keep, though its only caller is the Waveform.
