# Deploying the hub on the homelab

One Node 24 process serves the web app, the API, `/sync` for the agents and `/ws`. It needs a
folder for the database, the music library, a backup folder and, in front of it, TLS.
It is deployed as a **bundle**: `stack build` writes `apps/hub/dist/` (the web client and
`server/server.mjs`, the server, the app and every dependency in one file, with the migrations
and the one native package beside it). The box needs `node` 24 and nothing else of ours: no
checkout, no install, no CLI. Two ways to run it: **systemd** (recommended: nothing between the
process and the disks) or **Docker Compose** (the same process in an image). Pick one. The
bundle's build and start were run on the build sandbox (section "What was proven"); the unit
file, Caddy and Docker files were written but not run there.

## 1. What the box needs

| Need | Why | Install (Debian/Ubuntu) |
| --- | --- | --- |
| Node 24 | runs the bundle (`node dist/server/server.mjs`) | NodeSource or `fnm install 24` |
| ffmpeg | waveforms, analysis, cover thumbnails, integrity checks | `apt install ffmpeg` |
| fpcalc | acoustic fingerprints (duplicates, AcoustID) | `apt install libchromaprint-tools` |
| Caddy | TLS and the public name | `apt install caddy` |
| slskd | Soulseek (optional) | below |

Without ffmpeg the hub still runs: waveforms, analysis and the integrity check report "needs
ffmpeg". Without fpcalc the acoustic tier of the duplicate check is skipped. pnpm and the stack
checkout are needed only where the bundle is built (section 2).

## 2. Build the bundle, copy it to the box

The build happens on a machine with both checkouts side by side and installed (the hub links
`../stack/...`), which can be your laptop, a CI runner or the box itself. Build on the box's
platform: the bundle keeps `better-sqlite3`'s native addon as the build machine's installed one.

```bash
git clone <stack-repo> stack          && (cd stack && pnpm install)
git clone <trackvault-repo> trackvault && cd trackvault && pnpm install
# The hub's stable HTTPS name: passkeys bind to it. Set it where the build runs.
TRACKVAULT_DOMAIN=trackvault.example.com pnpm build     # writes apps/hub/dist/
```

`pnpm build` runs `stack build` (client, then the server bundle) and
`apps/hub/scripts/bundle-extras.ts`, which writes the scan and backup-check worker threads and
the two restore tools beside `server.mjs` (the bundle follows no `new Worker(new URL(...))`).
`dist/` holds `client/` and `server/` (`server.mjs`, the workers, `migrations/`, `node_modules/`
with only the native addon). Copy it to the box:

```bash
sudo useradd --system --create-home --home-dir /opt/trackvault trackvault
rsync -a apps/hub/dist/ trackvault@box:/opt/trackvault/dist/
```

To update: build again, `rsync` again, restart the service. The server applies the committed
migrations to `DB_FILE` before it listens (run twice it changes nothing) and runs no seed.

## 3. Folders and environment

```bash
sudo mkdir -p /var/lib/trackvault /srv/music /srv/trackvault-backups /etc/trackvault
sudo chown trackvault: /var/lib/trackvault /srv/music /srv/trackvault-backups
sudo install -m 600 -o root deploy/hub.env.example /etc/trackvault/hub.env   # then edit it
```

(`deploy/` is in the repo; copy `hub.env.example` and the unit to the box with `scp` if you
build elsewhere.)

The node server **fails at start** when any of these is missing, listing them all
(`stack node: failed to start: the environment is incomplete: Missing env var: ...`):

| Var | Value |
| --- | --- |
| `DB_FILE` | the database file, e.g. `/var/lib/trackvault/trackvault.sqlite` (peaks and art caches are made beside it) |
| `AUTH_SECRET` | 32 or more random characters (`openssl rand -base64 36`); signs sessions. Changing it signs everyone out |
| `APP_URL` | the public origin, `https://trackvault.example.com` (cookies, sign-in links, passkeys, the CORS list) |

Optional: `PORT` (default 8788) and `HOST` (default every interface) move where the server
listens with no rebuild. Never set `STACK_DEV`. The library folder, backup folder and every other
setting are in the app's Settings, not in the environment.

## 4a. systemd

```bash
sudo cp deploy/trackvault.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now trackvault
journalctl -u trackvault -f        # "stack node: listening on ..."; sign-in codes print here when no mail is set up
```

The unit runs `node dist/server/server.mjs` from `/opt/trackvault` (migrations are applied by the
server before it listens), restarts on failure, and lets the hub write only the database folder,
the library and the backup folder. `systemctl stop` sends SIGTERM: services stop in reverse order
and a running job stays `running` so the next start resumes it (every job is safe to run twice).

## 4b. Docker Compose (the alternative)

Use it if you prefer to keep the box clean. The image holds the built `dist/` and nothing else
(no stack checkout): build the bundle first (section 2, on linux for this image), then the image
from the repo root. `deploy/compose.yaml` runs the hub and slskd with the folders above mounted at
the same paths the settings will name.

```bash
TRACKVAULT_DOMAIN=trackvault.example.com pnpm build
printf 'AUTH_SECRET=%s\nAPP_URL=https://trackvault.example.com\n' "$(openssl rand -base64 36)" > deploy/.env
docker compose -f deploy/compose.yaml up -d --build
docker compose -f deploy/compose.yaml logs -f hub
```

Differences to know: the library must be mounted at the path you enter as the library folder in
Settings (`/srv/music`), and the backup folder at `/backups`; the image holds ffmpeg and fpcalc;
the stop grace period is 30 s so jobs park cleanly; `PORT` in the compose file moves the port.
systemd and Docker are equivalent for TrackVault, so choose by what you already operate. Not run
on the build sandbox.

## 5. TLS and remote access (Caddy)

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile      # edit the name
sudo systemctl reload caddy
```

Caddy gets and renews the certificate and proxies everything (including `/ws`) to
`127.0.0.1:8788`. Point a DNS name at the box (or use a name on your tailnet; for a tailnet-only
hub, `tailscale cert <name>` and `tls /path/cert /path/key` in the Caddyfile, or
`tailscale serve --bg 8788`, work the same: what matters is that `APP_URL`, `TRACKVAULT_DOMAIN`
and the name the browser uses are the same host, or passkeys will not work). Keep port 8788 off
the network: set `HOST=127.0.0.1` in the env file (compose already publishes it on 127.0.0.1
only).

## 6. slskd beside the hub

With compose it is in the file. With systemd, run it as its own service (container or the release
binary from github.com/slskd/slskd). Give slskd a downloads folder both can read, e.g.
`/srv/slskd/downloads`, then in TrackVault Settings: slskd address `http://localhost:5030`, an API
key made in slskd's `web.authentication.api_keys`, and the downloads folder as the hub sees it.
Finished downloads are moved into the library's `Inbox/` by the hub.

## 7. First start

Open `APP_URL`. The first sign-up is the owner's (a code is mailed; without mail the code is
printed in the hub's log). Add a passkey in Settings, set the library folder (the first scan
runs), then set up backups.

## 8. Backups and restore

Settings has a Backups and an Offsite storage section; the Backups place shows them running.

* **What is backed up.** The database (every track's tags, the change log and undo history, playlists,
  rules, settings, devices, the OAuth and sign-in tables) by SQLite's online backup while the hub
  runs, checked with `PRAGMA integrity_check` and a row count per table, compressed with zstd,
  and proved by unpacking it again. The music files are not in it: they sit on the library disk and,
  if switched on, offsite. Peaks and art caches are rebuilt and not backed up.
* **Schedule and keep policy.** Daily at an hour you set (default 03:00, hub local time; a hub off at
  the hour backs up when it starts). Keep the newest backup of each of the last 7 days, 4 weeks and
  6 months (settings); the newest good backup is never removed.
* **Where.** `Backup folder` in Settings (default `backups/` beside the database). Put it on
  another disk than the database: a copy on the same disk does not survive the disk. Each backup is
  `trackvault-<time>.sqlite.zst` with a `.json` file beside it (what it holds, its checksum, whether
  it was checked and sent offsite). The `.json` lives with the file, not in the database, so
  restoring an older database does not forget newer backups.
* **Offsite.** Any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO): endpoint,
  bucket, region, access key and secret in Settings; "Test the connection" writes, reads and deletes
  a small object. The keys need list, read, write and delete in that bucket. After each backup the
  new database backup goes to `db/`, and, if "Send the music files" is on, every track goes once to
  `audio/<audio hash>.<ext>` (large files in resumable 16 MiB parts, a speed limit in kB/s, already-sent files skipped
  from a local table and, after a lost database, from the bucket's listing and each object's stored
  hash), then `manifest/latest.json.gz` lists what is there. Remote database backups are trimmed by
  the same keep policy; **music files are never deleted from the bucket**.
* **Encryption (optional).** AES-256-GCM before upload with a key the hub makes the first time
  you switch it on. Be clear about the trade: it hides contents and file names inside the files
  from the storage provider, but object names (`audio/<hash>`) and sizes stay visible, and **the key
  is in the hub's settings, which only an encrypted backup carries: write the key down somewhere else**
  (Settings, Encryption key, Show the key). Lose the hub and the key and the bucket is noise. With
  encryption off the bucket holds ordinary files you can open with any S3 tool, so the choice is
  secrecy against recoverability. Changing it re-sends the library.

### Restore the database from a local backup (same box)

```bash
sudo systemctl stop trackvault
sudo -u trackvault env DB_FILE=/var/lib/trackvault/trackvault.sqlite \
  node /opt/trackvault/dist/server/restore.mjs --list --dir /srv/trackvault-backups
sudo -u trackvault env DB_FILE=/var/lib/trackvault/trackvault.sqlite \
  node /opt/trackvault/dist/server/restore.mjs /srv/trackvault-backups/trackvault-<time>.sqlite.zst
sudo systemctl start trackvault        # applies any newer migrations on start
```

The script stops nothing and refuses while the hub has the database open. It unpacks beside the
target, checks it, moves the current database aside as `trackvault.sqlite.pre-restore-<time>` and
puts the backup in place. By hand: `zstd -d file.sqlite.zst` gives the database file.

### Rebuild on a new box from the bucket

On the new box do sections 1 to 3 (node, the bundle, folders, env), without starting the service, then:

```bash
sudo -u trackvault env \
  OFFSITE_ENDPOINT=https://<account>.r2.cloudflarestorage.com OFFSITE_BUCKET=trackvault \
  OFFSITE_REGION=auto OFFSITE_ACCESS_KEY=... OFFSITE_SECRET_KEY=... \
  OFFSITE_KEY=<the 64 characters, if encrypted> OFFSITE_PREFIX=<folder, if set> \
  DB_FILE=/var/lib/trackvault/trackvault.sqlite \
  node /opt/trackvault/dist/server/restore-offsite.mjs --library /srv/music
sudo systemctl start trackvault
```

It restores the newest database backup (or `--at <object name>`), reads the manifest (or the
restored database's own file list if there is none), sets the library folder to `--library`, and
downloads every file to its path, checking each file's audio hash. Run it again after an
interruption: files in place are skipped and partial downloads continue. `--db-only` restores just
the database. After it, the agents keep their device keys (they are in the database); the first
scan finds the files in place. Settings (including the offsite keys) come back with the database.

## 9. What was proven on the build sandbox

`pnpm build`, then `apps/hub/dist` copied to a directory outside the repository and started there
with `DB_FILE` (a scratch database), `AUTH_SECRET`, `APP_URL`, `PORT` and `HOST` and nothing else
of ours on the path: the migrations applied to the empty database, every service started, it
listened on the given port, served `/` and a deep link, answered the RPC, signed the owner in with
an emailed code (printed in the log), scanned a file through the worker thread, took a backup
(the check worker), minted a device key and a signed media address and served the file with a
Range request from it, accepted the phone's `trackvault://` origin on the auth routes and refused
another, stopped on SIGTERM, and refused to start with the env vars missing. With a 50,000-track
database the daily backup ran by itself after start. Offsite upload, a multipart encrypted upload,
and `restore-offsite` into an empty directory (files identical to the originals) ran against a
local S3 stand-in (moto), not a real provider. Not run here: systemd, Caddy, Docker, a real
R2/B2/S3.
