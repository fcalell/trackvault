# TrackVault Wireframes

## 1. Layout Shell

```
+--[TRACKVAULT]--+--[LIBRARY]--[QUALITY]--[SETTINGS]----------[rescan]--+
|                |                                                       |
| Sidebar        | Main content area                                    |
| (changes per   | (routes render here)                                  |
| active section)|                                                       |
|                |                                                       |
|                |                                                       |
+----------------+-------------------------------------------------------+
| Player: [Track - Artist]  [||]  1:24 ===-------  4:03   [vol] ===-    |
+------------------------------------------------------------------------+
```

- **Header**: Logo (left, fixed 240px) | Section nav | Actions (right)
- **Sidebar**: 240px, section-specific content, scrollable
- **Main**: Flex column (toolbar + content), scrollable content area
- **Player**: Fixed bottom bar, preview-only (play/pause, seek, volume)

---

## 2. Library Page — Browse

```
SIDEBAR                          MAIN
+------------------------------+------------------------------------------------------------+
| BROWSE                       | [Search tracks...______]  [Columns]          2,847 tracks  |
|   * All Tracks        2,847  |-------------------------------------------------------------+
|   # By Artist            >   | [ ] [>]  TITLE ^       ARTIST        ALBUM          GENRE  |
|   # By Album             >   |     Year  Time  Kbps                                        |
|   # By Genre             v   |-------------------------------------------------------------|
|   +------------------------+ | [ ] [>]  Midnight City  M83          Hurry Up...  ELECTRONIC|
|   | [Filter genres...]     | |     2011  4:03  320                      <- playing (purple)|
|   | Electronic        412  | |-------------------------------------------------------------|
|   | House             328  | | [x] [>]  Bohemian Rha.  Queen        A Night...   ROCK     |
|   | Techno            291  | |     1975  5:55  320                     <- selected (blue)  |
|   | Prog House        186  | |-------------------------------------------------------------|
|   | Trance            142  | | [ ] [>]  track_03_fi..  --           --           --       |
|   | Rock              134  | |     --    3:22  128                     <- issues (-- italic)|
|   | + 14 more              | |-------------------------------------------------------------|
|   +------------------------+ | [ ] [>]  Levels          Avicii       --           EDM      |
|                              |     --    3:19  192                                         |
| ISSUES                       |-------------------------------------------------------------|
|   * No Artist           56   | [ ] [>]  One More Time   Daft Punk    Discovery   HOUSE    |
|   * No Genre           203   |     2001  5:20  320                    ELECTRONIC           |
|   * No Album           312   |-------------------------------------------------------------|
|   * No Year          1,204   |                                                             |
|   * Low Bitrate         89   |                                                             |
+------------------------------+------------------------------------------------------------+
                       +---------------------------------------------------+
                       | 2 selected | [EDIT TAGS] [DELETE] [ORGANIZE] [x]  |
                       +---------------------------------------------------+
```

### Behavior

- **Sidebar > Browse**: "All Tracks" is default. Artist/Album/Genre expand inline with search + list + counts. Clicking a facet item filters the main table.
- **Sidebar > Issues**: Clicking filters table to only tracks with that issue. Red dot = critical (no artist, no genre). Yellow dot = warning (no album, no year, low bitrate).
- **Table**: Comfortable row height. Sortable columns (click header). Missing data = italic `--` in muted color. Low bitrate = red text. Currently playing row = subtle purple bg.
- **Search**: Debounced global filter across all visible columns.
- **Columns**: Toggle visibility of optional columns (Year, Time, Kbps hidden by default? or all visible).
- **Selection**: Checkbox per row. Select-all in header. Floating action bar appears at bottom with: Edit Tags, Delete, Organize, Deselect.

---

## 3. Library Page — Detail Panel (single track edit)

```
MAIN TABLE (compressed)                          DETAIL PANEL (360px right drawer)
+------------------------------------------+    +----------------------------------+
| [Search tracks...]  [Columns]            |    | TRACK DETAILS              [ x ] |
|------------------------------------------|    |================================= |
| [x] [>]  Bohemian Rh..  Queen     ROCK  |    |                                  |
|     1975  5:55  320        <- focused    |    | TITLE                            |
|------------------------------------------|    | [Bohemian Rhapsody_________]     |
| [ ] [>]  track_03_fi..  --        --     |    |                                  |
|                                          |    | ARTIST                           |
|                                          |    | [Queen_____________________]     |
|                                          |    |                                  |
                                                | ALBUM                            |
   Table overlaid by panel.                     | [A Night at the Opera______]     |
   Panel slides in from right.                  |                                  |
                                                | GENRE                            |
                                                | [Rock________________________]   |
                                                |                                  |
                                                | YEAR                             |
                                                | [1975]                           |
                                                |                                  |
                                                | COMMENT                          |
                                                | [_____________________________]  |
                                                |                                  |
                                                | ─── read-only ───                |
                                                | Duration    5:55                 |
                                                | Bitrate     320 kbps             |
                                                | Filename    Queen - Bohemian...  |
                                                | Path        /Music/Rock/Queen/   |
                                                |                                  |
                                                |         [CANCEL]  [SAVE]         |
                                                +----------------------------------+
```

### Behavior

- Opens when clicking a row (not the checkbox or play button).
- Overlays the right side of the table.
- Editable fields: Title, Artist, Album, Genre, Year, Comment.
- Read-only fields: Duration, Bitrate, Filename, Path (displayed as text, not inputs).
- Save writes ID3 tags to the file + updates DB.
- Close via X button or Escape key.
- If another row is clicked while panel is open, panel updates to show that track (unsaved changes prompt).

---

## 4. Library Page — Inline Editing

```
|-------------------------------------------------------------|
| [ ] [>]  [Midnight City_]  [M83__]  Hurry Up...  ELECTRONIC|
|     2011  4:03  320              <- cell clicked, now input  |
|-------------------------------------------------------------|
```

### Behavior

- Double-click a cell to edit it inline (Title, Artist, Album, Genre, Year, Comment).
- Cell transforms into an input field. Enter/Tab to save, Escape to cancel.
- Only one cell editable at a time.
- Saves immediately on confirm (optimistic update + write ID3 tags).

---

## 5. Bulk Edit Dialog

```
+--------------------------------------------------+
| EDIT TAGS — 12 tracks selected                   |
|==================================================|
|                                                  |
| ARTIST                                           |
| [ ] Apply   [________________________]           |
|                                                  |
| ALBUM                                            |
| [ ] Apply   [________________________]           |
|                                                  |
| GENRE                                            |
| [ ] Apply   [________________________]           |
|                                                  |
| YEAR                                             |
| [ ] Apply   [________________________]           |
|                                                  |
| COMMENT                                          |
| [ ] Apply   [________________________]           |
|                                                  |
|                                                  |
| Only checked fields will be updated.             |
| Title is not bulk-editable.                      |
|                                                  |
|                      [CANCEL]  [APPLY TO 12]     |
+--------------------------------------------------+
```

### Behavior

- Opens as a centered dialog when clicking "Edit Tags" in the floating action bar.
- Each field has a checkbox — only checked fields are written.
- Title is excluded (doesn't make sense for bulk).
- Shows how many tracks will be affected.
- On apply: writes ID3 tags to all selected files + updates DB.
- Toast notification on success/failure.

---

## 6. Quality Section — Overview

```
HEADER:  [LIBRARY]  [QUALITY *active*]  [SETTINGS]

SIDEBAR                          MAIN
+------------------------------+------------------------------------------------------------+
| TOOLS                        | DUPLICATES                                                 |
|   Duplicates                 |=============================================================|
|   Genre Normalization        |                                                             |
|   File Organizer             | Find tracks that may be duplicates based on metadata        |
|                              | similarity.                                                 |
|                              |                                                             |
|                              | SIMILARITY THRESHOLD                                       |
|                              | 0.1 =========[]====== 1.0          [85%]                   |
|                              |                                                             |
|                              | MATCH BY                                                   |
|                              | [x] Tags (title + artist)                                  |
|                              | [ ] Filename                                                |
|                              |                                                             |
|                              |                           [FIND DUPLICATES]                 |
|                              |                                                             |
|                              |-------------------------------------------------------------|
|                              | 3 groups found                                              |
|                              |-------------------------------------------------------------|
|                              |                                                             |
|                              | GROUP 1 — "Midnight City" by M83                           |
|                              | +--------------------------------------------------------+  |
|                              | | [x]  Midnight City    M83   320  /Electronic/M83/       |  |
|                              | | [ ]  Midnight City    M83   128  /Unsorted/             |  |
|                              | +--------------------------------------------------------+  |
|                              |                                                             |
|                              | GROUP 2 — "Levels" by Avicii                                |
|                              | +--------------------------------------------------------+  |
|                              | | [ ]  Levels           Avicii 320  /EDM/Avicii/          |  |
|                              | | [x]  Levels (Radio)   Avicii 320  /EDM/Avicii/          |  |
|                              | | [ ]  Levels           Avicii 192  /Downloads/            |  |
|                              | +--------------------------------------------------------+  |
|                              |                                                             |
|                              |         [DELETE SELECTED]  [KEEP HIGHEST BITRATE]           |
+------------------------------+------------------------------------------------------------+
```

### Behavior

- Sidebar shows quality tools. Clicking each loads its UI in the main area.
- **Duplicates**: Same as current but reworked UX. Results show grouped tracks with checkboxes. Actions: delete selected, keep highest bitrate (auto-select lower quality dupes for deletion).
- Results include file path to help distinguish duplicates.

---

## 7. Quality Section — Genre Normalization

```
SIDEBAR                          MAIN
+------------------------------+------------------------------------------------------------+
| TOOLS                        | GENRE NORMALIZATION                                        |
|   Duplicates                 |=============================================================|
|   Genre Normalization *      |                                                             |
|   File Organizer             | Standardize genre tags across your library. Maps non-       |
|                              | standard genres to your preferred genre list.               |
|                              |                                                             |
|                              | [SCAN FOR NON-STANDARD GENRES]                             |
|                              |                                                             |
|                              |-------------------------------------------------------------|
|                              | 14 non-standard genres found (847 tracks affected)         |
|                              |-------------------------------------------------------------|
|                              |                                                             |
|                              | CURRENT              -> SUGGESTED         TRACKS  ACTION   |
|                              |-------------------------------------------------------------|
|                              | Prog House           -> [Progressive House v]  186  [Apply]|
|                              | Electronica          -> [Electronic________ v]   43  [Apply]|
|                              | Deep                 -> [Deep House_______ v]   31  [Apply]|
|                              | Drum&Bass            -> [Drum and Bass____ v]   28  [Apply]|
|                              | techno               -> [Techno___________ v]   22  [Apply]|
|                              | HOUSE                -> [House____________ v]   18  [Apply]|
|                              | Hip Hop/Rap          -> [Hip-Hop__________ v]   15  [Apply]|
|                              | ...                                                         |
|                              |                                                             |
|                              | Suggested mappings are editable. Select from standard       |
|                              | genres or type a custom value.                              |
|                              |                                                             |
|                              |                          [APPLY ALL]  [SKIP REMAINING]      |
+------------------------------+------------------------------------------------------------+
```

### Behavior

- Scans library for genre tags not in the standard genres list.
- Shows each non-standard genre with a suggested mapping (dropdown of standard genres, editable).
- Apply per-row or Apply All.
- Writes ID3 tags + updates DB for all affected tracks.

---

## 8. Quality Section — File Organizer

```
SIDEBAR                          MAIN
+------------------------------+------------------------------------------------------------+
| TOOLS                        | FILE ORGANIZER                                             |
|   Duplicates                 |=============================================================|
|   Genre Normalization        |                                                             |
|   File Organizer *           | Reorganize files into a consistent folder structure         |
|                              | based on track metadata.                                   |
|                              |                                                             |
|                              | PATTERN                                                    |
|                              | [Artist/Album/Track Title_______________] v                |
|                              |                                                             |
|                              | Presets: Artist/Album/Title | Genre/Artist/Title            |
|                              |          Artist/Title       | Custom...                     |
|                              |                                                             |
|                              |                              [PREVIEW CHANGES]              |
|                              |                                                             |
|                              |-------------------------------------------------------------|
|                              | 1,203 files will be moved (412 already in place)           |
|                              |-------------------------------------------------------------|
|                              |                                                             |
|                              | CURRENT PATH                  -> NEW PATH                  |
|                              |-------------------------------------------------------------|
|                              | /Unsorted/track_03.mp3        -> /Unknown Artist/Unk.../   |
|                              | /Downloads/Levels.mp3          -> /Avicii/Unknown Album/   |
|                              | /Music/daftpunk_omt.mp3        -> /Daft Punk/Discovery/    |
|                              | /EDM/avicii_levels_v2.mp3      -> /Avicii/Unknown Album/   |
|                              | ...                            showing 1,203 moves          |
|                              |                                                             |
|                              | [!] 56 tracks have no artist — will use "Unknown Artist"   |
|                              | [!] 312 tracks have no album — will use "Unknown Album"    |
|                              |                                                             |
|                              |                          [CANCEL]  [ORGANIZE 1,203 FILES]  |
+------------------------------+------------------------------------------------------------+
```

### Behavior

- Choose a folder pattern from presets or build custom (template tokens: Artist, Album, Genre, Title, Year).
- Preview shows every file move before executing.
- Warnings for tracks with missing metadata that will result in "Unknown" folders.
- Execute moves files on disk + updates paths in desktop DB.
- Non-destructive: only moves, never deletes.

---

## 9. Settings Page

```
HEADER:  [LIBRARY]  [QUALITY]  [SETTINGS *active*]

(no sidebar — full-width content)
+------------------------------------------------------------------------+
| SETTINGS                                                               |
|========================================================================|
|                                                                        |
| LIBRARY                                                                |
| ─────────────────────────────                                          |
|                                                                        |
| Library Path                                                           |
| [~/projects/Music___________________________]  [BROWSE]                |
|                                                                        |
| Scans this folder and all subfolders for MP3 files.                    |
|                                                                        |
|                                                                        |
| LOW BITRATE THRESHOLD                                                  |
| Tracks below this bitrate are flagged as low quality.                  |
| [320] kbps                                                             |
|                                                                        |
|                                                                        |
|                                              [SAVE]                    |
+------------------------------------------------------------------------+
```

### Behavior

- No sidebar — simple full-width form.
- Library path: browse via Electron folder picker.
- Low bitrate threshold: configurable (default 320).
- Future: sync settings, account, etc. will be added here in Phase 2.
