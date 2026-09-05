# 🌸 La Paradiso Bot — Гарын авлага (Handover)

Энэ бот нь цэцгийн дэлгүүрийн **захиалга, ирц, цалин, агуулах, өдрийн хаалт**-ыг
Facebook Messenger + Discord + Google Sheets-тэй холбож автоматжуулдаг.

---

## 1. Систем юунаас бүрдэх вэ?

| Хэсэг | Юу хийдэг | Файл |
|---|---|---|
| Facebook Messenger | Үйлчлүүлэгчээс захиалга авна | `src/handlers/orderFlow.js`, `src/services/messenger.js` |
| Discord bot | Ажилчдын командууд (ирц, хаалт, агуулах, тайлан) | `src/services/discord.js` |
| Google Sheets | Бүх мэдээллийг хадгалдаг "өгөгдлийн сан" | `src/services/sheets.js` |
| Claude Vision (AI) | Бараа таталтын зураг/PDF-ийг уншина | `src/services/vision.js` |
| Claude чат (AI) | Үйлчлүүлэгчийн асуултад хариулах, зургаас барагцаа үнэ хэлэх | `src/services/aiChat.js` |
| Cron (хуваарь) | Өдрийн тайлан, цалингийн сануулга автоматаар | `src/index.js` |

---

## 2. Discord командууд

| Команд | Юу хийдэг | Хаана хадгалагдах |
|---|---|---|
| `/report` | Өнөөдрийн орлогын тайлан харуулна | — |
| `/irts` | Ирц бүртгэнэ (🟢 Ирлээ / 🔴 Гарлаа). Discord нэрийг автоматаар авна | `Ирц` tab |
| `/haalt` | Өдрийн хаалт оруулна (цонх нээгдэнэ) | `Өдрийн хаалт` + `Хаалт задаргаа` tab |
| `/aguulah` | Агуулахын одоогийн үлдэгдэл харуулна | — |
| `/aguulah_nem` | Агуулахд гараар бараа нэмнэ (товчлол + тоо) | `Агуулах` tab |

**Автомат үйлдлүүд:**
- `#бараа-таталт` суваг руу **зураг/PDF** хаяхад → AI уншаад `Бараа таталт` tab-д бичнэ, `Агуулах`-д **нэмнэ**
- `/haalt` оруулахад → `Агуулах`-аас **хасна**, доод хэмжээнд хүрвэл `#анхааруулга` руу мэдэгдэнэ

---

## 3. Google Sheets таб-ууд

Бот ажиллахын тулд spreadsheet-д дараах таб-ууд **яг ийм нэртэйгээр** байх ёстой.
Эхний мөрөнд (header) баганын нэрс байна:

### `Захиалга`
`Захиалгын #` · `Огноо` · `Харилцагч` · `Утас` · `Цэцэг / Баглаа` · `Тоо` · `Нэгж үнэ` · `Хүргэлт эсэх` · `Хаяг` · `Хүргэх огноо` · `Статус` · `Төлбөр` · `Эх сурвалж` · `Тэмдэглэл`

### `Ирц`
`Огноо` · `Ажилтан` · `Ирсэн цаг` · `Гарсан цаг` · `Тэмдэглэл`

### `Цалин`
`Хугацаа` · `Нэр` · `Төрөл` · `Өдөр` · `Цаг` · `Дүн`

### `Өдрийн хаалт`
`Огноо` · `Ажилтан` · `Баглаа` · `Нийт орлого` · `Бэлэн` · `Данс` · `Пос` · `Зарлага` · `Зарлага нийт` · `Цэвэр орлого`

### `Хаалт задаргаа`
`Огноо` · `Ажилтан` · `Товчлол` · `Тоо` · `Төрөл`  *(Төрөл = Зарсан / Хорогдол)*

### `Бараа таталт`
`Огноо` · `Баримт №` · `Нийлүүлэгч` · `Бараа нэр` · `Тоо` · `Нэгж үнэ` · `Нийт дүн`

### `Агуулах`
`№` · `Бараа нэр` · `Товчлол` · `Төрөл` · `Анхны тоо` · `Тоо` · `Анхааруулгын хэмжээ`
- **Товчлол** баганад `/haalt`-д бичдэг товчлол + invoice-ийн англи нэрийг таслалаар бичнэ.
  Жишээ: `rose,са` → "Rose-Red" болон "са-3" хоёулаа таарна.

---

## 4. Цалингийн дүрэм

- **Ажилчид** (Туяа, Амина): 1 өдөр = **71,500₮**. Ирц дээр Ирсэн+Гарсан цаг хоёулаа бүртгэгдсэн өдрийг тоолно.
- **Захирлууд** (Саруул, Лулу): хагас сард тогтмол **750,000₮**.
- Сарын **10**-нд (25→10 хугацаа), **25**-нд (10→25 хугацаа) 12:00 цагт `#цалин` руу автомат сануулна.
- Өөрчлөх бол: `src/services/discord.js` доторх `WORKERS`, `DIRECTORS`, `src/services/sheets.js` доторх `DAILY_RATE`.

---

## 5. Тохиргооны хувьсагчид (Environment Variables)

Эдгээрийг хост дээрх `.env` файл эсвэл Railway/Render-ийн Variables-д хийнэ:

| Хувьсагч | Юунд хэрэгтэй |
|---|---|
| `FB_PAGE_ACCESS_TOKEN` | FB хуудас руу мессеж илгээх |
| `FB_VERIFY_TOKEN` | FB webhook баталгаажуулах (өөрийн зохиосон нууц үг) |
| `FB_APP_SECRET` | FB app secret |
| `DISCORD_BOT_TOKEN` | Discord bot нэвтрэх **(буруу бол 401 алдаа)** |
| `DISCORD_CLIENT_ID` | Slash команд бүртгэх |
| `DISCORD_ORDER_CHANNEL_ID` | #захиалга |
| `DISCORD_REPORT_CHANNEL_ID` | #өдрийн-тайлан |
| `DISCORD_SALARY_CHANNEL_ID` | #цалин |
| `DISCORD_IRTS_CHANNEL_ID` | #ирц |
| `DISCORD_WARNING_CHANNEL_ID` | #анхааруулга |
| `DISCORD_HAALT_CHANNEL_ID` | #өдрийн-хаалт |
| `DISCORD_BARAA_CHANNEL_ID` | #бараа-таталт |
| `GOOGLE_SHEET_ID` | Spreadsheet-ийн ID (URL-ээс) |
| `GOOGLE_SERVICE_EMAIL` | Service account email (Sheet-д Editor болгож share хийнэ) |
| `GOOGLE_PRIVATE_KEY` | Service account-ийн private key |
| `ANTHROPIC_API_KEY` | Claude Vision + AI чат |
| `FB_ALBUM_URL` | Баглааны зургийн FB цомгийн линк (заавал биш) |
| `DISCORD_ZARDAL_CHANNEL_ID` | #зардал (банкны гүйлгээ мэдэгдэл) |
| `GMAIL_USER` | Банкны и-мэйл ирдэг Gmail хаяг |
| `GMAIL_APP_PASSWORD` | Gmail App Password (IMAP унших, 2FA шаардана) |
| `GMAIL_BANK_LABEL` | Банкны и-мэйлд өгсөн label (default: bank-transaction) |
| `DISCORD_BARAA_ROLE_ID` | 7 хоногийн бараа таталтын сануулгад mention хийх role (заавал биш) |

> ⚠️ `GOOGLE_PRIVATE_KEY` нь `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`
> хэлбэртэй, `\n` тэмдэгтүүд хэвээр байх ёстой. Энэ буруу бол `ERR_OSSL_UNSUPPORTED` алдаа гарна.

---

## 6. Deploy ба ажиллуулах

### Локал дээр турших
```bash
npm install
npm start          # эсвэл npm run dev (автомат restart)
```

### VPS (pm2-р, унтдаггүй)
```bash
cd ~/flower-bot
npm install
pm2 start src/index.js --name flower-bot
pm2 save
pm2 startup        # сервер restart хийхэд автоматаар асах
pm2 logs flower-bot   # log харах
```

### Facebook Webhook
- Callback URL: `https://<таны-домэйн>/webhook`
- Verify token: `FB_VERIFY_TOKEN`-той ижил
- `messages`, `messaging_postbacks`-д subscribe хийнэ
- ⚠️ FB заавал **HTTPS** шаарддаг (Cloudflare Tunnel эсвэл домэйн + SSL)

### Discord bot тохиргоо
- Developer Portal → Bot → **Message Content Intent → ON** (бараа таталт уншихад зайлшгүй)
- Bot-ыг сервер рүү урих: OAuth2 → URL Generator → `bot` + `applications.commands` scope
- Bot-д суваг бүрт **View Channel + Send Messages + Embed Links** эрх өгнө

---

## 7. Түгээмэл алдаа (Troubleshooting)

| Алдаа | Шалтгаан | Засвар |
|---|---|---|
| `401: Unauthorized` (Discord) | `DISCORD_BOT_TOKEN` буруу/хуучирсан | Шинэ token авч `.env`-д солих |
| `ERR_OSSL_UNSUPPORTED` | `GOOGLE_PRIVATE_KEY` формат буруу | `\n`-тэйгээр бүтнээр нь дахин хийх |
| `Missing Access` (50001) | Bot тухайн сувагт бичих эрхгүй | Сувгийн permission-д bot нэмэх |
| `Unknown interaction` (10062) | Сервер удаан хариулсан (унтсан) | Хостоо унтуулахгүй болгох (pm2/paid) |
| `getRows of undefined` | Sheet таб нэр таарахгүй | Таб нэрийг яг таруулах |
| Бараа таталт уншихгүй | Anthropic credit дууссан | console.anthropic.com → Billing |

---

## 8. Эх код засах гол цэгүүд

| Юу өөрчлөх | Хаана |
|---|---|
| Цэцэг, үнэ (FB захиалга) | `src/config/catalog.js` → `CATALOG` |
| Төлбөрийн мэдээлэл | `src/config/catalog.js` → `PAYMENT_INFO` |
| Ажилчид / захирлууд / цалин | `src/services/discord.js`, `src/services/sheets.js` |
| Тайлан, сануулгын цаг | `src/index.js` → `cron.schedule(...)` |
| Discord командын асуултууд | `src/services/discord.js` |

> Цаг: Cron нь UTC. Улаанбаатар = UTC+8. Жишээ: `0 14 * * *` = 22:00 УБ цаг.
