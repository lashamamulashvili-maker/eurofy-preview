# EUROFY macOS restore and development

These steps restore the feature-branch source on the owner’s Mac. The Mac was not accessed during the current isolated Linux session. The development database and source archives created here are in this session’s workspace; copy an archive to the Mac separately before using it there.

## Restore the source

Install Git and Node.js 20 or newer (for example, with Xcode Command Line Tools and the official Node.js installer), then run:

```sh
mkdir -p ~/Projects
git clone https://github.com/lashamamulashvili-maker/eurofy-preview.git ~/Projects/EUROFY
cd ~/Projects/EUROFY
git fetch origin
git switch --track origin/feature/eurofy-dropshipping-foundation
git status --short --branch
```

If `~/Projects/EUROFY` already exists, do not clone over it. First inspect `git status`, create a source archive, then fetch and compare the feature branch before deciding how to integrate local changes. Do not switch to or modify `main` for this work.

## Install, initialize and run locally

```sh
cd ~/Projects/EUROFY/backend
npm ci
npm run migrate:pglite
npm test
npm run dev:local
```

Open `http://localhost:3000`. Stop the local server with Ctrl+C. The embedded development database is stored in `~/Projects/EUROFY/.eurofy-data/`; it is ignored by Git. The catalog may remain empty until supplier rights, imagery, stock, current prices and delivery routes are verified.

## Create a source and database backup

Stop the server first. From the repository root:

```sh
cd ~/Projects/EUROFY
mkdir -p ~/Projects/EUROFY-backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
tar -czf "$HOME/Projects/EUROFY-backups/eurofy-source-$STAMP.tar.gz" --exclude=.git --exclude=backend/node_modules --exclude=.eurofy-data .
tar -czf "$HOME/Projects/EUROFY-backups/eurofy-pglite-$STAMP.tar.gz" .eurofy-data
gzip -t "$HOME/Projects/EUROFY-backups/eurofy-source-$STAMP.tar.gz"
gzip -t "$HOME/Projects/EUROFY-backups/eurofy-pglite-$STAMP.tar.gz"
shasum -a 256 "$HOME/Projects/EUROFY-backups/eurofy-source-$STAMP.tar.gz" "$HOME/Projects/EUROFY-backups/eurofy-pglite-$STAMP.tar.gz"
```

Keep backups outside the repository and do not commit database contents, credentials, or customer data.

## Restore a database backup safely

Never extract over the working `.eurofy-data`. Restore to a separate directory, verify migrations there, then stop the app before deliberately switching local data directories:

```sh
mkdir -p /tmp/eurofy-restore-check
tar -xzf "$HOME/Projects/EUROFY-backups/eurofy-pglite-TIMESTAMP.tar.gz" -C /tmp/eurofy-restore-check
cd ~/Projects/EUROFY/backend
EUROFY_LOCAL_DB_DIR=/tmp/eurofy-restore-check/.eurofy-data node migrate.js --pglite
```

The command should report checksum-verified migrations as skipped. Inspect data before using the restored copy. To run against it temporarily, start the server with `EUROFY_LOCAL_DB_DIR=/tmp/eurofy-restore-check/.eurofy-data npm run dev:local`. Do not delete the original database until the restored copy is confirmed and another backup exists.

## Current execution boundary

Changes in this mission were made in an isolated Linux checkout and are intended for the GitHub feature branch only. The owner’s Mac is not claimed to have been changed. No public deployment, `main` update, Render migration, live payment, paid integration, supplier order or supplier contact is authorized here.
