# TrackVault

@.knowledge/index.md

Desktop music library manager: browse, play, tag, and curate local MP3 collections. Detect duplicates, fix metadata, and manage library quality. Planned evolution into a multi-device music sync platform with S3/R2-compatible storage backend.

**Vision:** "Your music library, organized and synced — everywhere."

**Current scope:** Electron desktop app for local library management.
**Next scope:** Add a sync server for multi-device music syncing using local files or S3/Cloudflare R2 as storage.

## Stack

pnpm monorepo (Turborepo). SolidJS + TanStack Solid Router + Vite. Hono + oRPC for API (runs on Electron IPC, Cloudflare Workers, or Node.js). Drizzle ORM + SQLite. Tailwind v4 + Kobalte + CVA for UI.

## Workspace

```
apps/
  desktop/           — Electron app (SolidJS renderer + Hono main process)
packages/
  api/               — Hono + oRPC API (portable across runtimes)
  db/                — Library DB: tracks table (portable, syncable)
  db-desktop/        — Desktop DB: local_files + settings (local-only, never synced)
  ui/                — Design system (Tailwind v4, CVA, Kobalte)
  schema/            — Zod validators + shared types
  constants/         — Centralized constants (genres, audio, platforms)
tooling/
  typescript-config/ — Shared TS configs
```

## Two-Database Architecture

- **`@repo/db`** (trackvault.db) — canonical music metadata (`tracks`). Portable across Electron, Workers, Node. Will sync in Phase 2.
- **`@repo/db-desktop`** (desktop.db) — Electron-specific data (`local_files`, `settings`). Never synced. Maps tracks to local filesystem paths.

Electron auto-migrates both DBs on startup. `drizzle-kit generate` produces migration SQL (no DB connection needed). `drizzle-kit push` is unusable due to Electron/system Node ABI conflict with better-sqlite3.

## Commands

```bash
pnpm dev              # Dev server (Electron + Vite)
pnpm build            # Build all
pnpm check            # Lint (Biome) + type-check
pnpm --filter @repo/db generate        # Generate library DB migrations
pnpm --filter @repo/db-desktop generate # Generate desktop DB migrations
```

Package-specific: `pnpm --filter @repo/packageName check`

## Users

Music collectors and DJs who maintain large local MP3 libraries. They care about metadata accuracy, duplicate-free collections, and consistent audio quality. They want fast browsing, instant playback, and bulk curation tools. Eventually: seamless sync across devices.

> Behavioral rules live in `.claude/rules/` and are loaded automatically.
> Knowledge and reference docs live in `.knowledge/`.
> Project management docs live in `.project_management/`.
