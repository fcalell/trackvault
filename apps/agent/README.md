# TrackVault agent

The device daemon. It runs on a machine that is not the hub and does up to three things:

- **Replica:** mirrors the hub library into a local folder (resumable, hash-verified downloads, removed files go to a local trash) so DJing works offline.
- **Upload:** watches folders and sends new audio to the hub inbox (skips what the hub already has).
- **Rekordbox bridge** (when a Rekordbox install is found): imports what changed in `master.db`, and applies the hub's merged changes when Rekordbox is closed.

It is plain Node 24 TypeScript, run from source. There is no build step. The protocol it speaks with the hub is `@trackvault/core/sync` (`packages/core/src/sync`).

## Requirements

- Node 24 or newer (`node --version`). Node runs the `.ts` files directly.
- The repo checkout with dependencies installed once (`pnpm install` at the repo root). The agent needs the checkout beside it: `packages/core` and the stack plugins it links.
- A device key from the hub (Devices page): it looks like `stk_...`. One key per machine; revoking it in the hub cuts the machine off.

## Commands

Run from `apps/agent` (or give the full path to `src/cli.ts`):

```sh
node src/cli.ts pair https://hub.example.ts.net stk_XXXX --name "DJ Mac"
node src/cli.ts run            # the daemon (--debug for verbose logs)
node src/cli.ts status
node src/cli.ts unpair         # forgets the hub; files and Rekordbox stay untouched
```

`pair` options:

| Option | Meaning |
| --- | --- |
| `--name <name>` | Device name shown in the hub (default: the machine name) |
| `--root <dir>` | Replica folder (default `~/Music/TrackVault`). The agent owns this folder: put nothing of your own in it |
| `--watch <dir>` | Upload audio from this folder to the hub inbox. Repeatable |
| `--no-replica` | Do not mirror the library (an upload-only PC) |
| `--no-rekordbox` | Do not run the Rekordbox bridge |
| `--force` | Replace an existing pairing |

A PC without Rekordbox that only sends music: `pair <hub> <key> --watch ~/Music/Incoming` (no root, no Rekordbox found, so the replica is off).
A Rekordbox machine: `pair <hub> <key>`; the replica goes to `~/Music/TrackVault` and the bridge starts by itself.

`pair` checks the key and the hub before it saves anything.

## Where things live

| | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Config, state, logs | `~/Library/Application Support/TrackVault` | `%APPDATA%\TrackVault` | `$XDG_CONFIG_HOME/trackvault` or `~/.config/trackvault` |

`TRACKVAULT_AGENT_HOME` overrides the folder.

- `config.json` (mode 600, holds the device key): hub URL, name, replica root, watch folders, optional tuning (`pollSeconds`, `downloadConcurrency`, `uploadConcurrency`, `minFreeBytes`, `trashDays`, `rekordbox.{enabled,dbPath,allowedDbVersions,backupKeep}`). Edit it with the daemon stopped.
- `state.sqlite`: manifest cursor, file states, Rekordbox base snapshot and links, upload queue. Safe to delete: the agent rebuilds it (a Rekordbox base that is gone makes the next import a first import, which merges).
- `logs/agent.log` (rotated at 5 MB, 3 kept), and the same lines on stdout.
- `<root>/.trackvault/`: partial downloads and the trash (`trash/<date>/...`, purged after `trashDays`, default 30).

## Run it at login

The daemon exits on `SIGINT`/`SIGTERM` after finishing what it is doing. Use absolute paths: a service manager has no shell `PATH`.

### macOS (launchd)

`~/Library/LaunchAgents/app.trackvault.agent.plist` (replace the three paths):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>app.trackvault.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/you/trackvault/apps/agent/src/cli.ts</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/Users/you/Library/Logs/trackvault-agent.out.log</string>
  <key>StandardErrorPath</key><string>/Users/you/Library/Logs/trackvault-agent.err.log</string>
</dict>
</plist>
```

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.trackvault.agent.plist
launchctl kickstart -k gui/$(id -u)/app.trackvault.agent     # restart
launchctl bootout gui/$(id -u)/app.trackvault.agent          # stop and unload
```

Find your node with `which node`. The agent needs no special permission except access to the folders it uses (Files and Folders in System Settings, if you put the replica or a watch folder under Desktop, Documents or an external drive).

### Windows (Task Scheduler)

In a normal (non-admin) PowerShell, replace the paths:

```powershell
$node = "C:\Program Files\nodejs\node.exe"
$cli  = "C:\Users\you\trackvault\apps\agent\src\cli.ts"
$action  = New-ScheduledTaskAction -Execute $node -Argument "`"$cli`" run"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "TrackVault Agent" -Action $action -Trigger $trigger -Settings $settings
Start-ScheduledTask -TaskName "TrackVault Agent"
```

`Stop-ScheduledTask -TaskName "TrackVault Agent"` stops it (Task Scheduler ends the process; unpaired writes are transactional, so nothing is left half done). For a task with no console window, use `powershell.exe -WindowStyle Hidden -Command "& 'C:\Program Files\nodejs\node.exe' '...\cli.ts' run"` as the action instead.

### Linux (systemd user unit), if useful

`~/.config/systemd/user/trackvault-agent.service`:

```ini
[Service]
ExecStart=/usr/bin/node /home/you/trackvault/apps/agent/src/cli.ts run
Restart=always
RestartSec=30
[Install]
WantedBy=default.target
```

`systemctl --user enable --now trackvault-agent`.

## Rekordbox notes

- The agent finds the library through Rekordbox's `options.json` (`db-path`) or the default folder (`~/Library/Pioneer/rekordbox`, `%APPDATA%\Pioneer\rekordbox`). Set `rekordbox.dbPath` in `config.json` to override.
- **Import** reads a copy of `master.db` (and its WAL), so it is safe while Rekordbox runs. It happens at startup and about 8 seconds after `master.db` changes.
- **Export** writes `master.db` only when Rekordbox is not running, after a timestamped backup (`trackvault-backups/` beside `master.db`), in one transaction, and only for a `DBVersion` on the allowlist. The allowlist in `packages/core/src/rekordbox/db.ts` is empty until the R2 spike on a throwaway install (`VERIFY.md`), so until then the agent imports, reports **"write pending verification"** to the hub and writes nothing. To test on a throwaway library, set `rekordbox.allowedDbVersions` in `config.json`.
- Turn **Rekordbox Cloud Library Sync off**: the agent refuses to write while it looks on.
- The first import of a big library hashes Rekordbox files that are not in the replica folder to match them to hub tracks (only files whose size equals a hub file's size). It reads them once and caches the result.
- ANLZ analysis files are uploaded to the hub and downloaded to `anlz-cache/`, but not yet written into Rekordbox: whether Rekordbox accepts copied analysis is one of the open checks in `VERIFY.md`.

## Troubleshooting

- `status` shows counts, failed files and the last Rekordbox import/export; `logs/agent.log` has the detail.
- "the hub refused the device key": the key was revoked or expired. Make a new one and `pair --force`.
- Low disk: downloads pause below `minFreeBytes` (default 1 GiB) and the hub shows it.
