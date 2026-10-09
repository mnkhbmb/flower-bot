// Сайтын AI туслах: зочны асуултыг шалгаад Claude-аар хариулна.
// Хариулт бүр мөнгөтэй тул хэмжээ, давтамжийг хатуу хязгаарлана.
import { askAI } from '../services/aiChat.js';

const MAX_MESSAGE = 400;      // нэг асуултын урт
const MAX_HISTORY = 8;        // өмнөх яриа (4 асуулт + 4 хариулт)
const PER_IP_5MIN = 10;       // нэг зочин 5 минутад
const PER_IP_DAY = 50;        // нэг зочин өдөрт
const GLOBAL_DAY = 1500;      // бүх сайт өдөрт — төсвийн дээд хамгаалалт

const recent = new Map();     // ip → [цаг...]
const daily = new Map();      // ip → тоо
let dayKey = '', dayTotal = 0;

function allow(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayTotal = 0; daily.clear(); recent.clear(); }

  if (dayTotal >= GLOBAL_DAY) return 'busy';
  const now = Date.now();
  const list = (recent.get(ip) || []).filter(t => now - t < 5 * 60 * 1000);
  if (list.length >= PER_IP_5MIN) return 'slow';
  if ((daily.get(ip) || 0) >= PER_IP_DAY) return 'day';

  list.push(now);
  recent.set(ip, list);
  daily.set(ip, (daily.get(ip) || 0) + 1);
  dayTotal++;
  return 'ok';
}

const FALLBACK = 'Messenger-ээр бичвэл ажилтан маань хариулна: m.me/LaParadisoMN';

export async function handleWebChat(req, res) {
  const b = req.body || {};
  const message = String(b.message ?? '').replace(/\s+/g, ' ').trim();
  if (!message) return res.status(400).json({ error: 'Асуултаа бичнэ үү.' });
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ error: `Асуулт хэт урт байна (${MAX_MESSAGE} тэмдэгтээс богино бичнэ үү).` });
  }

  // Зөвхөн зөв хэлбэртэй, богино түүхийг хүлээж авна. Сүүлийн мөр хэрэглэгчийнх байж болохгүй
  // (шинэ асуулт тусдаа ирдэг), эхнийх нь хэрэглэгчийнх байх ёстой.
  let history = Array.isArray(b.history) ? b.history : [];
  history = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, 800) }));
  while (history.length && history[0].role !== 'user') history.shift();
  while (history.length && history[history.length - 1].role !== 'assistant') history.pop();
  const alternates = history.every((m, i) => m.role === (i % 2 === 0 ? 'user' : 'assistant'));
  if (!alternates) history = [];

  const gate = allow(req.ip);
  if (gate === 'slow') return res.status(429).json({ error: 'Түр хүлээгээд дахин асуугаарай. ' + FALLBACK });
  if (gate !== 'ok') return res.status(429).json({ error: 'Өнөөдрийн асуултын хязгаарт хүрлээ. ' + FALLBACK });

  try {
    const reply = await askAI(history, message, { web: true });
    res.json({ reply });
  } catch (err) {
    console.error('Сайтын AI чат алдаа:', err.message);
    res.status(503).json({ error: 'Одоо хариулж чадсангүй. ' + FALLBACK });
  }
}
