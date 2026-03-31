# Project Status

## Product Roadmap Phases

| Phase | Name                   | Status      | Goal                                                          |
| ----- | ---------------------- | ----------- | ------------------------------------------------------------- |
| 0     | Modernize & Rework     | Done        | Update stack, align to best practices, clean architecture     |
| 1     | Core Library Manager   | In Progress | Solid local library management: browse, play, tag, curate     |
| 2     | Sync Server            | Not Started | Multi-device sync via local files or S3/R2 storage backend    |
| 3     | Polish & Distribution  | Not Started | Installer builds, auto-update, onboarding, settings UX       |

## Phase 0: Modernize & Rework

| Task | Name                          | Status      | Notes                                          |
| ---- | ----------------------------- | ----------- | ---------------------------------------------- |
| 0.1  | Audit current codebase        | Done        | Understood structure, stack, and pain points    |
| 0.2  | Set up Claude.md & .claude/   | Done        | Rules, knowledge, project management structure  |
| 0.3  | Architecture plan             | Done        | Monorepo, SolidJS, oRPC, Hono, Kobalte         |
| 0.4  | Monorepo skeleton             | Done        | pnpm + Turborepo, root configs, workspace layout|
| 0.5  | TypeScript configs            | Done        | base, solid-vite, node-tsx, electron-main       |
| 0.6  | packages/constants            | Done        | Audio, genres, platforms                        |
| 0.7  | packages/schema               | Done        | Zod validators, IPC types, MusicFile type       |
| 0.8  | packages/db                   | Done        | Drizzle schema + SQLite client                  |
| 0.9  | packages/api                  | Done        | Hono + oRPC, procedures migrated from tRPC      |
| 0.10 | packages/ui                   | Done        | Kobalte + CVA components (core set)             |
| 0.11 | apps/desktop                  | Done        | Electron shell, IPC bridge, SolidJS renderer    |
| 0.12 | Upgrade all deps              | Done        | Latest versions (TS6, Zod4, Vite8, Electron41)  |
| 0.13 | Fetch docs & write knowledge  | Done        | context7 docs for all packages, .claude rules    |
| 0.14 | Fix deprecations              | Done        | tanstackRouter, createTanstackQueryUtils, rolldownOptions, onError interceptors, protocol.handle, RPCHandler direct IPC |
| 0.15 | Verify dev workflow           | Done        | Migrated to vite-plugin-electron + Vite 8, app boots |
| 0.16 | Clean up _old_src             | Done        | Removed old source, migration confirmed         |
| 0.17 | Two-database architecture     | Done        | Split into @repo/db (tracks) + @repo/db-desktop (local_files, settings) |

## Phase 1: Core Library Manager

See full plan: `.claude/plans/frolicking-floating-frost.md`
See wireframes: `.project_management/wireframes/wireframes.md`
See decisions: `.project_management/phase1-decisions.md`

### Epic 1: Infrastructure & Shared Primitives

| Task | Name                              | Status      | Notes |
|------|-----------------------------------|-------------|-------|
| 1.1  | Dark-mode-only globals.css        | Done        |       |
| 1.2  | QueryBoundary component           | Done        |       |
| 1.3  | Loader component                  | Done        |       |
| 1.4  | EmptyState component              | Done        |       |
| 1.5  | Section family components         | Done        |       |
| 1.6  | Toast infrastructure              | Done        | solid-sonner |
| 1.7  | createDialog utility              | Done        |       |
| 1.8  | Auto-invalidation + combineQueries| Done        |       |
| 1.9  | Package exports cleanup           | Done        |       |

### Epic 2: Layout Shell & Navigation

| Task | Name                              | Status      | Notes |
|------|-----------------------------------|-------------|-------|
| 2.1  | Shell layout component            | Done        |       |
| 2.2  | Header with section nav           | Done        |       |
| 2.3  | Route restructure                 | Done        | /library, /quality/*, /settings |
| 2.4  | Library sidebar                   | Done        | Placeholder, wired in Task 7.4 |
| 2.5  | Quality sidebar                   | Done        |       |

### Epic 3: API Layer Expansion

| Task | Name                              | Status      | Notes |
|------|-----------------------------------|-------------|-------|
| 3.1  | library.facets procedure          | Done        |       |
| 3.2  | library.update procedure          | Done        |       |
| 3.3  | library.batchUpdate procedure     | Done        |       |
| 3.4  | library.batchDelete procedure     | Done        |       |
| 3.5  | library.rescan procedure          | Done        |       |
| 3.6  | Settings schema: lowBitrateThreshold | Done     | Migration generated |
| 3.7  | quality.genreNormalization        | Done        | scan + apply |
| 3.8  | quality.fileOrganizer             | Done        | preview + execute |

### Epic 4: Library Table Rework

| Task | Name                              | Status      | Notes |
|------|-----------------------------------|-------------|-------|
| 4.1  | Table selection with checkboxes   | Done        |       |
| 4.2  | Floating action bar               | Done        |       |
| 4.3  | Inline cell editing               | Done        |       |
| 4.4  | Track detail panel                | Done        |       |
| 4.5  | Bulk edit dialog                  | Done        |       |
| 4.6  | Toolbar rework                    | Done        |       |

### Epic 5: Quality Tools UI

| Task | Name                              | Status      | Notes |
|------|-----------------------------------|-------------|-------|
| 5.1  | Duplicates page rework            | Done        |       |
| 5.2  | Genre normalization page          | Done        |       |
| 5.3  | File organizer page               | Done        |       |

### Epic 6: Settings Page

| Task | Name                              | Status      | Notes |
|------|-----------------------------------|-------------|-------|
| 6.1  | Settings as full-width page       | Done        | + lowBitrateThreshold |

### Epic 7: Polish & Integration

| Task | Name                              | Status      | Notes |
|------|-----------------------------------|-------------|-------|
| 7.1  | First-run experience              | Done        | Redirects to settings if unconfigured |
| 7.2  | Rescan button in header           | Done        | Spinning icon + toast summary |
| 7.3  | Player integration                | Done        | Updated styling for new layout |
| 7.4  | Sidebar facet filtering wiring    | Done        | URL search params + client-side filtering |
