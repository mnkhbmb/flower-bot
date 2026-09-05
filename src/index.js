// ===== ЦЭЦГИЙН ДЭЛГҮҮР — ГОЛ СЕРВЕР =====
import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { handleMessage } from './handlers/orderFlow.js';
import { startDiscord, sendHaaltReminder, sendSalaryReminder, sendBaraaReminder } from './services/discord.js';
import { startGmailPoller } from './services/gmail.js';

const app = express();
app.use(express.json());

// --- Эрүүл мэндийн шалгалт (Render-д хэрэгтэй) ---
app.get('/', (req, res) => res.send('🌸 Flower bot ажиллаж байна'));

// --- Нууцлалын бодлого (FB App Review-д шаардлагатай) ---
app.get('/privacy', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>La Paradiso — Нууцлалын бодлого</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #222; }
    h1 { color: #C9445A; }
    h2 { margin-top: 28px; }
  </style>
</head>
<body>
  <h1>🌸 La Paradiso — Нууцлалын бодлого</h1>
  <p>Сүүлд шинэчилсэн: 2026-06-06</p>

  <p>La Paradiso цэцгийн дэлгүүр (“бид”) нь Facebook Messenger-ийн чатботоор
  дамжуулан үйлчлүүлэгчийн захиалгыг хүлээн авдаг. Энэхүү бодлого нь бид ямар
  мэдээлэл цуглуулдаг, хэрхэн ашигладгийг тайлбарлана.</p>

  <h2>Бид ямар мэдээлэл цуглуулдаг вэ?</h2>
  <ul>
    <li>Таны нэр</li>
    <li>Утасны дугаар</li>
    <li>Хүргэлтийн хаяг (хүргэлт сонгосон тохиолдолд)</li>
    <li>Захиалгын мэдээлэл (сонгосон цэцэг, тоо хэмжээ)</li>
    <li>Чатад илгээсэн мессеж, зураг</li>
  </ul>

  <h2>Мэдээллийг юунд ашигладаг вэ?</h2>
  <p>Зөвхөн таны захиалгыг боловсруулах, хүргэх, тантай холбогдох зорилгоор
  ашиглана. Бид таны мэдээллийг гуравдагч этгээдэд зарж, түгээхгүй.</p>

  <h2>Мэдээлэл хадгалалт</h2>
  <p>Захиалгын мэдээллийг Google Sheets-д аюулгүй хадгална. Зөвхөн эрх бүхий
  ажилтан хандах боломжтой.</p>

  <h2>Мэдээллээ устгуулах</h2>
  <p>Та өөрийн мэдээллийг устгуулахыг хүсвэл доорх и-мэйлээр хандана уу.
  Бид хүсэлтийг хүлээн авснаас хойш боломжит хугацаанд устгана.</p>

  <h2>Холбоо барих</h2>
  <p>И-мэйл: <a href="mailto:sarulllzelo@yahoo.com">sarulllzelo@yahoo.com</a></p>
</body>
</html>`);
});

// --- FB Webhook баталгаажуулалт (анх нэг удаа) ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    console.log('✅ Webhook баталгаажлаа');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// --- FB-ээс ирэх мессеж хүлээн авах ---
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // FB-д шууд хариу өгнө

  // 'page' = Messenger, 'instagram' = Instagram DM (хоёулаа ижил бүтэцтэй ирдэг)
  if (req.body.object !== 'page' && req.body.object !== 'instagram') return;

  for (const entry of req.body.entry) {
    for (const event of entry.messaging || []) {
      const psid = event.sender.id;
      // Ботын өөрийн илгээсэн мессежийн echo-г алгасна (үгүй бол өөртэйгөө яриад давталтад орно)
      if (event.message?.is_echo) continue;
      if (event.message) {
        try {
          await handleMessage(psid, event.message);
        } catch (err) {
          console.error('handleMessage алдаа:', err);
        }
      }
    }
  }
});

// --- Сервер асаах ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Сервер ${PORT} порт дээр ажиллаж байна`);
  await startDiscord();
  startGmailPoller();   // Gmail-ийн банкны и-мэйл шалгах (env тохируулсан бол)
});

// --- CRON: өдөр бүр 20:00-д хаалт/гарлаа бүртгүүлэх сануулга ---
// UTC+8 → 12:00 UTC = 20:00 Улаанбаатар (дэлгүүр хаах цаг)
cron.schedule('0 12 * * *', async () => {
  console.log('🔔 Хаалтын сануулга илгээж байна...');
  try {
    await sendHaaltReminder();
  } catch (err) {
    console.error('Хаалтын сануулга алдаа:', err);
  }
});

// --- CRON: сарын 10, 25-нд 12:00-д цалингийн сануулга ---
// UTC+8 → 04:00 UTC = 12:00 Улаанбаатар
cron.schedule('0 4 10,25 * *', async () => {
  console.log('💵 Цалингийн сануулга илгээж байна...');
  try {
    await sendSalaryReminder();
  } catch (err) {
    console.error('Цалин сануулга алдаа:', err);
  }
});

// --- CRON: өдөр бүр 14:00-д бараа таталтын сануулга ---
// UTC+8 → 06:00 UTC = 14:00 Улаанбаатар
cron.schedule('0 6 * * *', async () => {
  console.log('📦 Бараа таталтын сануулга илгээж байна...');
  try {
    await sendBaraaReminder();
  } catch (err) {
    console.error('Бараа сануулга алдаа:', err);
  }
});
