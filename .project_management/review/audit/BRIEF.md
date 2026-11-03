# Audit brief: is stack's UI still a shared design system?

Stack (`/home/user/stack`, the owner's framework) is a shared design system used by several apps.
TrackVault (`/home/user/trackvault`, a DJ music library) was revamped onto it, and that revamp
changed stack's UI packages in the commit range `364a2c5^..HEAD` on master. The owner wants
stack to hold no prop, branch or logic that exists only for one app's use case.

**This is read-only. Do not edit, stage, stash, checkout, reset or commit anything in either
repository.** Write only your report file (below).

## Read first
- `/home/user/stack/docs/product.md` (the philosophy: a new public surface is the last resort;
  plugins coordinate only through the typed slot graph; structural over local fixes).
- `/home/user/stack/docs/architecture/overview.md`, `docs/architecture/plugin-authoring.md`,
  `docs/architecture/slot-catalog.md` (what a slot is, which exist).
- `/home/user/stack/packages/ui-core/guide/structure.md` (component rules: no context that changes
  form, closed list of JS measures, etc.).
- `/home/user/stack/plugins/react-ui/guide/rules.md` and the guide pages of your family.

## Method
1. Read the history of your files: `cd /home/user/stack && git log -p 364a2c5^..HEAD -- <your files>`
   and `git diff 364a2c5^..HEAD -- <your files>`. The commits in range are listed by
   `git log --oneline 364a2c5^..HEAD`.
2. Enumerate every prop, option, type field, slot, context, data mark (`data-*`), key handler,
   exported helper or code branch added or changed in that range in your files. Nothing in your
   files is skipped; small items can be grouped when they share a verdict.
3. For each, find its callers:
   - stack: the showcase (`/home/user/stack/apps/showcase`, `plugins/*/src/ui/showcase/`), other
     plugins, the phone app (`/home/user/stack/apps/phone`);
   - TrackVault: `grep -rn <name> /home/user/trackvault/apps --include=*.ts --include=*.tsx`
     (skip `node_modules`, `.stack`, `dist`).
   - and the docs that mention it (guide pages, `docs/`, JSDoc).
4. Classify:
   - **general**: a pattern most data-heavy apps need, expressed through stack's existing model
     (data props, frames, selections, the act model, slots).
   - **app-shaped**: introduced for a TrackVault need but made general; say whether the
     generalisation is **real** (several plausible callers, the shape carries no TrackVault noun)
     or **nominal** (one caller, one shape, the TrackVault case with a neutral name).
   - **app-specific**: logic that knows TrackVault concepts (tracks, players, playlists, DJ terms,
     BPM/key, cover art) or couples two components only one app combines (for example the Table
     knowing about the player's keys).
5. For each that is not general, propose the structural fix that keeps stack's principles:
   move it to an opt-in plugin or a slot; generalise it so the component no longer knows the use
   case; or remove it and let the app compose existing parts. Name concretely what the fix costs
   TrackVault (files and features that change, what it would have to compose itself).
6. Evidence for every item: commit hash, `file:line` (at HEAD), callers in stack and TrackVault
   (`file:line`), docs that mention it. A claim with no evidence is not a finding.

## Report
Write `.project_management/review/audit/<family>.md`:

1. A table: item | commit | where (file:line) | classification | callers (stack / TrackVault) |
   docs | verdict | proposed fix | cost to TrackVault.
2. The fixes ranked by how much they clean stack against how much they cost.
3. What you would leave as is, and why.

Then reply in at most 30 lines: the non-general items with their verdicts and fixes, ranked, and
anything you could not decide.
