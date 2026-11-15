# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # install dependencies
npm start         # run production server (node src/index.js)
npm run dev       # run with --watch (auto-restart on file changes)
npm test          # node --test: test/*.test.js
```

Tests use Node's built-in runner (no extra dependency). They cover pure logic only: `src/utils/` (`periods.js`, `ledger.js`), `bankParser.js`, `bankCategories.js` and the salary PDF. Logic that needs testing should live in `src/utils/` (pure functions, no Sheets/Discord/Anthropic calls). No linter is configured. ES modules (`"type": "module"`), so all relative imports use `.js` extensions.

## Architecture

One Node.js process (`src/index.js`): an Express server plus a Discord bot, IMAP mail pollers and crons. Google Sheets is the only datastore.

- **Express** (`src/index.js`)
  - `GET /`: health check (still required by the host).
  - `GET /webhook` (FB verification with `FB_VERIFY_TOKEN`), `POST /webhook`: Messenger **and Instagram DM** events (`object` is `page` or `instagram`, same shape) go to `handleMessage`. Echo messages not sent by the bot (`wasSentByBot`) mean a staff member replied by hand, and `pauseForHuman` silences the bot for that user for 2 hours.
  - Website (`public/`): `/baglaa` (pixel-bouquet builder), `/zagvar` (ready-made bouquets, data in `public/catalog.json`, images in `public/b/`), `/test`, `/trivia` (+ `/trivia.json`), `/logo.jpg`, `/chat.js` (embeddable AI chat widget), `/privacy`.
  - API: `POST /api/orders` → `handlers/webOrder.js` (validates against `config/pixelCatalog.js` / `catalog.json`, rate-limited per IP, writes to Sheets, posts to Discord); `POST /api/chat` → `handlers/webChat.js` (AI chat with per-IP and global daily limits); `GET /api/flowers/top` (names of top-selling flowers, 10-min cache).
- **Messenger order flow** (`src/handlers/orderFlow.js`): in-memory `Map<psid, session>` state machine; steps in `config/catalog.js` `STEPS`: `PICK_FLOWER → PICK_QTY → PICK_DELIVERY → ASK_NAME → ASK_PHONE → (ASK_ADDRESS) → CONFIRM`, plus `AI_CHAT` mode. `messenger.js` sends via the Graph API.
- **AI** (Anthropic SDK): `services/aiChat.js` answers free-form customer questions (Messenger AI mode and the website chat) and estimates prices from photos; text model from `AI_CHAT_MODEL` with a hard-coded fallback. `services/vision.js` reads supplier invoices (images/PDF) posted in the #бараа-таталт channel.
- **Bank transactions**: `services/mailPoller.js` is a generic read-only IMAP poller (every 2 min; last UID stored in Sheets). `gmail.js` reads bank notifications from a Gmail label (XacBank, where the POS deposits arrive; its details are in a PDF attachment); `yahoo.js` reads Khan Bank notifications from a Yahoo mailbox. `bankParser.js` parses the emails, `config/bankCategories.js` guesses a category, `bankTx.js` stores the transaction, records advances as loans and posts it to Discord with a category select menu.
- **Discord** (`src/services/discord.js` = entry point and public API; code lives in `src/discord/`):
  - `client.js`: the `client` singleton, `WORKERS`, `DIRECTORS`, `PAY_CATS`, `salaryPeople`, `allPeople`. `commands.js`: slash-command definitions, registered **globally** on every `clientReady`.
  - Feature modules each export `handleXInteraction(interaction)` returning `true` when handled: `bank.js`, `loans.js`, `shop.js` (daily closing, waste, reports), `stock.js` (warehouse + invoice reader), `salary.js`, `reconcile.js`; `orders.js` holds the order notifications. `discord.js` calls the handlers in order. `salary.js` answers every autocomplete not claimed by `bank.js`/`loans.js`, so it must stay after them.
  - Import direction (no cycles): `client` ← `orders`, `bank`, `loans`, `shop`, `stock` ← `salary` ← `reconcile`.
  - Commands: `/report`, `/irts`, `/haalt` (closing modal: cash/account/POS, expenses, bouquet codes; deducts stock), `/horogdol` (waste), `/zarsan` (top sold), `/aguulah`, `/aguulah_nem`, `/aguulah_shine`, `/hansh` (CNY rate for invoices), `/tsalin`, `/tsalin-unelgee` (per-person daily rate), `/zeel`, `/zeel-butsalt`, `/zeel-hynah`, `/dans-uldegdel`, `/tulgalt`, `/guilgee`. Replying to a bot loan message with an amount records a repayment.
- **Salary**: periods are 11–25 (paid on the 25th) and 26–10 of the next month (paid on the 10th), see `utils/periods.js`. Workers are paid per day of attendance (`Ирц`), at a per-person daily rate from `/tsalin-unelgee` or `DEFAULT_DAILY_RATE` in `sheets.js`; directors get a fixed amount per period (`DIRECTORS`). Loans/advances in the period are deducted. `services/salaryPdf.js` builds the PDF with pdfkit using the DejaVu Sans font (`dejavu-fonts-ttf`), because pdfkit's built-in fonts have no Cyrillic.
- **Loans** (`/zeel`, `/zeel-butsalt`, `/zeel-hynah`): `Зээл` tab, loans positive, repayments negative. Staff loans are deducted from salary; loans to other people stay open until repaid (`utils/ledger.js`).
- **Account balances** (`/dans-uldegdel`): a base balance is set by hand and transactions after it are added/subtracted; compared with the balance the bank prints in its emails.
- **Reconciliation** (`/tulgalt`, cron): closing POS vs XacBank deposits minus `POS_FEE_PERCENT`, closing "Данс" vs Khan Bank, cash deposits, and salary owed vs salary paid by bank.

### Crons (`src/index.js`, UTC; Ulaanbaatar = UTC+8)

| Expression (UTC) | Ulaanbaatar | Function |
|---|---|---|
| `0 12 * * *` | daily 20:00 | `sendHaaltReminder` (#өдрийн-хаалт) |
| `0 6 10,25 * *` | 10th, 25th 14:00 | `sendSalaryReminder` (salary embed + PDF, saved to `Цалин`) |
| `0 9,12 10,25 * *` | 10th, 25th 17:00, 20:00 | `sendSalaryPayReminder` (only people not yet paid by bank) |
| `0 2 11,26 * *` | 11th, 26th 10:00 | `sendTulgaltReport` (reconciliation of the period that just ended) |
| `0 6 * * 1` | Monday 14:00 | `sendBaraaReminder` (#бараа-таталт) |

`sendDailyReport` still exists but is not scheduled; the daily report is available via `/report`.

### Google Sheet tabs

- Must exist: `Захиалга`, `Ирц`, `Цалин`, `Агуулах`, `Бараа таталт`, `Өдрийн хаалт`, `Хаалт задаргаа` (the last two are matched case-insensitively). Columns are matched by header name; see HANDOVER.md for the column lists.
- Created automatically when missing: `Тохиргоо` (key/value settings: `yuan_hansh`, `tsalin:<name>`, `uldegdel:<account>`, `harilcagch:<counterparty>`, mail-poller last UIDs), `Зээл`, `Гүйлгээ` (missing columns are appended).
- `Захиалга` headers: `Захиалгын #`, `Огноо`, `Харилцагч`, `Утас`, `Цэцэг / Баглаа`, `Тоо`, `Нэгж үнэ`, `Хүргэлт эсэх`, `Хаяг`, `Хүргэх огноо`, `Статус`, `Төлбөр`, `Эх сурвалж`, `Тэмдэглэл`.

## Configuration

All runtime config is in environment variables (`.env` locally, Railway Variables in production). `.env.example` holds placeholders only.

| Variable | Used by |
|---|---|
| `PORT` | `index.js` |
| `FB_PAGE_ACCESS_TOKEN`, `FB_VERIFY_TOKEN` | `messenger.js`, webhook verification |
| `FB_ALBUM_URL`, `PUBLIC_URL` | `catalog.js` album link, `webOrder.js` site URL (both optional) |
| `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID` | login, slash-command registration |
| `DISCORD_ORDER_CHANNEL_ID`, `DISCORD_HAALT_CHANNEL_ID`, `DISCORD_WARNING_CHANNEL_ID`, `DISCORD_SALARY_CHANNEL_ID`, `DISCORD_BARAA_CHANNEL_ID`, `DISCORD_ZARDAL_CHANNEL_ID`, `DISCORD_REPORT_CHANNEL_ID` | orders; closing/waste; low-stock warnings; salary and reconciliation; invoices; bank transactions; daily report (unscheduled) |
| `DISCORD_BARAA_ROLE_ID` | role mentioned in the invoice reminder |
| `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_EMAIL`, `GOOGLE_PRIVATE_KEY` | `sheets.js` (JWT auth; key stores newlines as literal `\n`) |
| `ANTHROPIC_API_KEY`, `AI_CHAT_MODEL` | `aiChat.js`, `vision.js` |
| `CNY_RATE` | fallback CNY rate when `/hansh` is not set |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_BANK_LABEL` | Gmail poller (disabled when unset) |
| `YAHOO_USER`, `YAHOO_APP_PASSWORD`, `YAHOO_SHOP_ACCOUNT`, `YAHOO_FROM`, `YAHOO_FOLDER` | Yahoo poller; refuses to start without `YAHOO_SHOP_ACCOUNT` (`number:label,...`) |
| `BANK_OWN_ACCOUNTS` | shop accounts; transfers between them are not income/expense |
| `POS_FEE_PERCENT` | POS bank fee in reconciliation (default 1) |

## Key customization points

| What to change | Where |
|---|---|
| Messenger flowers, prices, shop info, `SHOW_PRICES`, payment text | `src/config/catalog.js` |
| Pixel-bouquet options and limits | `src/config/pixelCatalog.js` (and the sprites in `public/baglaa.html`) |
| Ready-made bouquets | `public/catalog.json` |
| Closing abbreviations → products | `src/config/aliases.js` |
| Bank categories and rules | `src/config/bankCategories.js` |
| Workers, directors, director pay | `src/discord/client.js` |
| Default daily rate | `src/services/sheets.js` → `DEFAULT_DAILY_RATE` (per-person: `/tsalin-unelgee`) |
| Salary period boundaries | `src/utils/periods.js` |
| Slash commands | `src/discord/commands.js` + a branch in the owning `src/discord/*.js` module |
| Cron times | `src/index.js` |
| AI prompts and models | `src/services/aiChat.js`, `src/services/vision.js` |

## Important constraints

- There is no local `.env`, so Sheets, Discord, Anthropic and the mail pollers cannot be exercised locally. Verify changes with `npm test`, `node --check`, and an import of the changed module.
- Deploy target is Railway; pushing to `main` deploys. The `GET /` health check must stay.
- Never commit real account numbers, tokens or secrets. `.env.example` holds placeholders only.
- The Yahoo mailbox belongs to another person. It is opened read-only (no flags set, nothing deleted), and only messages that mention the shop's own accounts (`YAHOO_SHOP_ACCOUNT`) may be stored or logged. Keep that filter in front of anything that stores or prints mail content.
- Session state (`orderFlow.js` sessions, human-pause map, web rate limits) is in memory and lost on restart.
- `sheets.js` uses one module-level `GoogleSpreadsheet` (`doc`) with a `loaded` guard. Do not create more instances.
- The Discord `client` is a singleton in `src/discord/client.js`. Feature modules import it and must not import `src/services/discord.js`.
- Some files have CRLF line endings in the working copy (e.g. `src/index.js`, `src/services/sheets.js`, `src/handlers/orderFlow.js`, this file); keep each file's existing line endings when editing.
- Global slash-command registration can take up to an hour to propagate after a new command is added.
