// ===== ЦЭЦГИЙН ДЭЛГҮҮР — ГОЛ СЕРВЕР =====
import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import { handleMessage } from './handlers/orderFlow.js';
import { startDiscord, sendDailyReport, sendSalaryReminder } from './services/discord.js';

const app = express();
app.use(express.json());

// --- Эрүүл мэндийн шалгалт (Render-д хэрэгтэй) ---
app.get('/', (req, res) => res.send('🌸 Flower bot ажиллаж байна'));

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

  if (req.body.object !== 'page') return;

  for (const entry of req.body.entry) {
    for (const event of entry.messaging) {
      const psid = event.sender.id;
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
});

// --- CRON: өдөр бүр 22:00-д Discord руу тайлан ---
// UTC+8 → 14:00 UTC = 22:00 Улаанбаатар
cron.schedule('0 14 * * *', async () => {
  console.log('📊 Өдрийн тайлан илгээж байна...');
  try {
    await sendDailyReport();
  } catch (err) {
    console.error('Тайлан алдаа:', err);
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
