# 🌸 Цэцгийн дэлгүүр — 24/7 автомат систем

Messenger chatbot + Discord bot + Google Sheets бүртгэл. Бүгд нэг Node.js серверт.

## Бүтэц

```
flower-bot/
├── package.json
├── .env.example          → .env болгож хуулаад утгуудыг бөглө
└── src/
    ├── index.js          → гол сервер (webhook + cron)
    ├── config/
    │   └── catalog.js    → цэцэг, үнэ, данс — ЭНД ЗАСНА
    ├── handlers/
    │   └── orderFlow.js  → захиалгын яриа (товч flow)
    └── services/
        ├── messenger.js  → FB руу мессеж илгээх
        ├── discord.js    → Discord мэдэгдэл + /report
        └── sheets.js     → Google Sheets бичих/унших
```

## Суулгах

```bash
npm install
cp .env.example .env      # дараа нь .env-ийг бөглөнө
npm start
```

## Тохиргооны дараалал

### 1. Google Sheets
- console.cloud.google.com → project үүсгэх → Sheets API enable
- Service Account → JSON key татах
- JSON доторх `client_email`-г Google Sheet-д Editor болгож share хийх
- `.env`-д: `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_EMAIL`, `GOOGLE_PRIVATE_KEY`

### 2. Discord
- discord.com/developers → New Application → Bot
- Bot token авах → `.env`-д `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`
- Bot-ыг сервер рүүгээ урих (OAuth2 URL, `bot` + `applications.commands` scope)
- 2 channel үүсгэх → ID хуулж `.env`-д тавих
  (Discord дотор Developer Mode асааж, channel дээр баруун товш → Copy ID)

### 3. Facebook Messenger
- developers.facebook.com → шинэ App → Messenger нэмэх
- FB хуудсаа холбож Page Access Token авах → `.env`-д `FB_PAGE_ACCESS_TOKEN`
- Webhook URL: `https://таны-сервер.onrender.com/webhook`
- Verify token: `.env`-ийн `FB_VERIFY_TOKEN`-той ИЖИЛ байх
- `messages`, `messaging_postbacks` event-д subscribe хийх

### 4. Deploy (Render.com — үнэгүй)
- github руу код push хийх
- render.com → New Web Service → repo сонгох
- Build: `npm install` · Start: `npm start`
- Environment-д `.env`-ийн бүх хувьсагчийг нэмэх
- Deploy дууссаны дараа URL-ийг FB webhook-д тавих

## Засаж тохируулах гол газрууд

| Юу | Хаана |
|---|---|
| Цэцгийн нэр, үнэ | `src/config/catalog.js` → `CATALOG` |
| Дансны мэдээлэл | `src/config/catalog.js` → `PAYMENT_INFO` |
| Тайлан илгээх цаг | `src/index.js` → `cron.schedule` |
| Захиалгын асуултууд | `src/handlers/orderFlow.js` |

## Анхаар

- `sessions` нь санах ойд хадгалагдана. Сервер restart хийхэд идэвхтэй яриа алдагдана. Их ачаалалтай бол Redis руу шилжүүлэхийг зөвлөнө.
- `.env` файлыг git-д бүү push хий (`.gitignore`-д аль хэдийн орсон).
