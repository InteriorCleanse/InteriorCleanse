# Deploying Mr. Cash 24/7 (paper)

Mr. Cash is meant to run unattended for weeks so the paper (and later shadow)
sample grows to something you can trust. This is the deployment path. It ships
with **no exchange keys** and cannot place a real order — the live gate chain is
closed (see the "Real money" chapter in the README).

## What "production" means here

- **A machine that stays on.** A laptop that sleeps is not a server. Use a small
  VPS, a Raspberry Pi that stays awake, or a always-on desktop.
- **Supervised process** that restarts on crash (Docker `restart: unless-stopped`
  or PM2), with structured JSON logs and rotation.
- **Durable store.** The SQLite database in the data volume is the source of
  truth; back it up.
- **Startup recovery.** On start the bot re-adopts any paper position that was
  open when it stopped (`src/recovery.ts`), so a restart never orphans a trade.

## Docker (recommended)

```bash
docker compose up -d --build      # start, 24/7
docker compose logs -f mrcash     # follow the logs
docker compose down               # stop
```

The data volume `mrcash-data` holds the store, logs and backups. The container's
`HEALTHCHECK` polls the deep `/api/health` endpoint (store + data dir must be
healthy).

## PM2 (no Docker)

```bash
npm i -g pm2
pm2 start deploy/pm2.config.cjs
pm2 logs mrcash
pm2 save && pm2 startup   # restart on reboot
```

Or the systemd unit at `deploy/mrcash.service` (edit the paths, then
`systemctl --user enable --now mrcash`).

## Health, logs, backups

- **Health:** `GET /api/health` returns `{ healthy, checks: [...] }` — a deep
  check of the store, the data dir, the feed and the kill switch. The container
  health check and any external monitor should watch `healthy`.
- **Logs:** structured JSON lines via `src/log.ts`, rotated by size
  (`data/mrcash.log`, `.1`…`.N`). Ship them to a collector if you have one.
- **Backups:** `node scripts/backup.ts` copies the store to
  `data/backups/mrcash-<timestamp>.db` (keeps the most recent 14; it refuses to
  back up a store that fails its integrity check). Schedule it with cron:

  ```cron
  0 * * * * cd /path/to/trading-bot && node scripts/backup.ts >> data/backup.log 2>&1
  ```

  **Restore:** stop the bot, copy a backup over `data/mrcash.db`, start again.

## HTTPS for remote access

The app serves plain HTTP on the LAN behind the PIN. For access over the
internet, put it behind a reverse proxy that terminates TLS (Caddy or nginx), or
a zero-config tunnel (Tailscale Funnel, cloudflared). Never expose the plain HTTP
port to the internet directly.

## Still paper

None of this enables real trading. Real money is behind the gate chain in
`src/live/gates.ts`, and the top-level flag ships false. `node scripts/live-arm.ts`
shows the chain — in this build it reports *not armed*.
