# Phase 1: Core Library Manager — Decisions

## Product Vision

**Primary mode:** Curation — fix and organize music libraries/playlists, then sync them.
**Secondary mode:** Consumption — browse and preview tracks.
**Future:** Multi-device sync, Rekordbox 2-way playlist sync, "download now" feature.

## Target Users

Music collectors and DJs maintaining large local MP3 libraries. Care about metadata accuracy, duplicate-free collections, consistent audio quality, and folder organization. Need fast browsing, instant preview playback, and bulk curation tools.

## UX Decisions

### Navigation Model

**Header:** Main sections (Library, Quality, Settings).
**Sidebar:** Section-specific subsections and/or tools. Changes based on active section.

### Sections

| Section | Purpose | Sidebar Content |
|---------|---------|-----------------|
| Library | Browse all tracks, search, filter, edit | Filters: genre, artist, album, bitrate, quality issues |
| Quality | Library health tools | Tools: duplicates, missing metadata, low bitrate, genre normalization, file organizer |
| Settings | App configuration | Library path, future sync settings |

### Player

- **Preview-only** for Phase 1 — click to play, click another to switch.
- No queue, shuffle, repeat, playlists.
- Will evolve with DJ info later (BPM, waveform, cue points — not Phase 1).

### Tag Editing

Support all three patterns:
1. **Inline editing** — click a cell in the table to edit directly.
2. **Detail panel/drawer** — select a track, side panel with all editable fields.
3. **Bulk edit dialog** — select multiple tracks, form to set shared fields.

### Bulk Workflow

Select tracks in table -> floating action bar appears -> choose action (edit tags, delete, move).

### Library Sources

- Single folder + subfolders (the folder is the sync structure).
- No multiple watch folders, no drag-and-drop import.

### Quality Tools

All inline — indicators in the library table (icons/badges per track) + filters to show only problematic tracks. No separate dashboard.

Tools in scope:
- **Duplicate detection** (existing, needs UX rework)
- **Missing metadata** report (no artist, no genre, etc.)
- **Low bitrate** report (< 320 kbps)
- **Genre normalization** (standardize messy genre tags)
- **File organizer** (auto-organize: move/rename files into consistent folder structure like `Artist/Album/01 - Title.mp3`)

### Table Density

Comfortable rows — more breathing room, easier to scan. Not compact.

### Playlists

**Deferred to Phase 2.** Will need 2-way sync with Rekordbox.

### Folder Organization Tool

**Auto-organize** — move/rename physical files into a consistent folder structure based on tags. Not a folder browser/tree view.

## Design System

Adopt the same brutalist dark-mode design system from martechthings:
- Monospace only (JetBrains Mono)
- Square corners (no border-radius)
- Heavy borders (3px major, 2px sub, 1px row)
- Dark mode only
- Semantic color tokens (oklch)
- 4px spacing grid

### Shared Design System Plan

Extract shared foundation into standalone `@trackvault/ui-system` repo:
- globals.css, Tailwind theme, universal primitives (Button, Dialog, Table, etc.)
- Patterns: QueryBoundary, EmptyState, Loader, Section
- Both trackvault and martechthings consume it

**Deferred to after Phase 1.** Keep manually syncing for now. Extract once both projects are stable. Use git dependency (no npm publishing overhead) when ready.

## Patterns Adopted from martechthings

| Pattern | Description |
|---------|-------------|
| QueryBoundary | Declarative loading/error/data wrapper with 150ms grace period |
| Loader | Scrambling text animation that resolves left-to-right |
| Section family | Section > SectionHeader > SectionTitle > SectionContent/SectionTable |
| EmptyState | Icon + title + description + action buttons |
| createDialog | Promise-based imperative dialog control |
| Toast | Imperative via solid-sonner |
| FormField family | TanStack Form + Zod + FormInput/FormSelect/FormCheckbox |
| Auto-invalidation | Global MutationCache.onSuccess invalidates queries by namespace |

## Technical Decisions

### Data Layer

- Keep existing two-database architecture (tracks DB portable, desktop DB local-only)
- Add pagination/virtual scroll for large libraries (existing has no pagination)
- Persist table state (column visibility, sort, filters) to desktop DB or localStorage

### API Additions Needed

- Track metadata update (single + batch)
- Track batch delete
- Missing metadata query (filter tracks with gaps)
- Genre normalization (suggest + apply)
- File organizer (preview moves + execute)
- Rescan library (detect external changes)
