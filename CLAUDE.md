# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm start         # run production server
npm run dev       # run with --watch (auto-restart on file changes)
```

No test runner or linter is configured. The project uses ES modules (`"type": "module"` in package.json), so all imports use `.js` extensions.

## Architecture

Single Node.js server combining three integrations:

- **Express webhook** (`src/index.js`) — receives Facebook Messenger events at `POST /webhook`, verifies the FB webhook at `GET /webhook`, and serves a health-check at `GET /`.
- **Order flow state machine** (`src/handlers/orderFlow.js`) — manages per-user conversation state in an in-memory `Map<psid, session>`. Steps are defined in `src/config/catalog.js` as `STEPS`. Each incoming message advances the session through: `PICK_FLOWER → PICK_QTY → PICK_DELIVERY → ASK_NAME → ASK_PHONE → (ASK_ADDRESS) → CONFIRM → DONE`.
- **Google Sheets** (`src/services/sheets.js`) — writes completed orders to a sheet named `"Захиалга"` and reads it back for daily reports. Uses lazy-loaded `GoogleSpreadsheet` with JWT auth; the `loaded` flag prevents redundant `loadInfo()` calls.
- **Discord bot** (`src/services/discord.js`) — registers a `/report` slash command on startup, sends a new-order embed to `DISCORD_ORDER_CHANNEL_ID` on each completed order, and sends a daily summary embed to `DISCORD_REPORT_CHANNEL_ID` via cron.
- **Cron** (`src/index.js`) — `node-cron` fires daily at `0 14 * * *` UTC (= 22:00 Ulaanbaatar time) to push the daily report to Discord.

## Configuration

All runtime config lives in `.env`. See `.env.example` for the full list. Key variables:

| Variable | Used by |
|---|---|
| `FB_PAGE_ACCESS_TOKEN` | `messenger.js` |
| `FB_VERIFY_TOKEN` | webhook verification in `index.js` |
| `DISCORD_BOT_TOKEN` | `discord.js` |
| `DISCORD_CLIENT_ID` | slash command registration |
| `DISCORD_ORDER_CHANNEL_ID` | new-order notifications |
| `DISCORD_REPORT_CHANNEL_ID` | daily report cron |
| `GOOGLE_SHEET_ID` | `sheets.js` |
| `GOOGLE_SERVICE_EMAIL` | Google JWT auth |
| `GOOGLE_PRIVATE_KEY` | Google JWT auth (newlines as `\n` in `.env`) |

## Key customization points

| What to change | Where |
|---|---|
| Flower names and prices | `src/config/catalog.js` → `CATALOG` |
| Payment info text | `src/config/catalog.js` → `PAYMENT_INFO` |
| Daily report cron time | `src/index.js` → `cron.schedule(...)` |
| Order conversation questions | `src/handlers/orderFlow.js` |
| Google Sheet column names | `src/services/sheets.js` → `addOrder()` |

## Important constraints

- Session state is in-memory only. Server restarts lose all active conversations. For production scale, migrate `sessions` Map in `orderFlow.js` to Redis or a database.
- The Google Sheets client (`doc`) is a module-level singleton with a `loaded` boolean guard — do not instantiate multiple `GoogleSpreadsheet` instances.
- `GOOGLE_PRIVATE_KEY` in `.env` stores newlines as literal `\n`; `sheets.js` replaces them with real newlines via `.replace(/\\n/g, '\n')`.
- Deploy target is Render.com (free tier); the health-check route at `GET /` is required for Render's uptime check.
