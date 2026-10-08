// Сайтаас ирэх захиалга (пиксел баглаа эсвэл бэлэн загвар): шалгах → Sheets → Discord
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { addOrder } from '../services/sheets.js';
import { notifyWebOrder } from '../services/discord.js';
import { PIXEL, LIMITS } from '../config/pixelCatalog.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const SITE_URL = process.env.PUBLIC_URL || 'https://flower-bot-production-e2f5.up.railway.app';

// Бэлэн загваруудын жагсаалт — public/catalog.json (сайт ч мөн үүнийг уншдаг)
let catalogCache = null;
function catalog() {
  if (!catalogCache) {
    try { catalogCache = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'catalog.json'), 'utf8')); }
    catch (err) { console.error('catalog.json уншиж чадсангүй:', err.message); catalogCache = []; }
  }
  return catalogCache;
}

// IP тус бүрээр 10 минутад 5 захиалга — спамаас хамгаална
const hits = new Map();
function tooMany(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const phone8 = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 8 ? d : null; };

// { id: тоо } объектыг зөвшөөрөгдсөн id-уудаар шүүж [нэр, тоо] жагсаалт болгоно
function tally(input, allowed) {
  const out = [];
  let total = 0;
  for (const [id, name] of Object.entries(allowed)) {
    const n = Math.floor(Number(input?.[id]) || 0);
    if (n > 0) { out.push([name, n]); total += n; }
  }
  return { out, total };
}

// Улаанбаатарын цагаар (UTC+8) "YYYY-MM-DD HH:00"-ийг UTC ms болгоно
function ubToUtcMs(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [h] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h - 8, 0, 0);
}

export async function handleWebOrder(req, res) {
  const b = req.body || {};
  const fail = (msg, code = 400) => res.status(code).json({ error: msg });

  if (b.website) return res.json({ orderId: 'OK' });          // honeypot — ботыг чимээгүй хаяна
  if (tooMany(req.ip)) return fail('Хэт олон захиалга илгээлээ. Түр хүлээгээд дахин оролдоно уу.', 429);

  const list = arr => arr.map(([n, c]) => `${n}×${c}`).join(', ');
  const details = {};
  const noteParts = [];
  let flowerText, qty, image = null;

  if (b.product) {
    // --- Бэлэн загвар ---
    const item = catalog().find(p => p.id === String(b.product));
    if (!item) return fail('Сонгосон баглаа олдсонгүй. Хуудсаа дахин ачаална уу.');
    details.kind = 'ready';
    details.product = `${item.name} (${item.id})`;
    details.imageUrl = `${SITE_URL}/b/${item.photos[0]}`;
    flowerText = `Бэлэн загвар: ${item.name} (${item.id})`;
    qty = 1;
  } else {
    // --- Пиксел баглаа ---
    const flowers = tally(b.flowers, PIXEL.flowers);
    const fillers = tally(b.fillers, PIXEL.fillers);
    if (flowers.total < 1) return fail('Баглаанд дор хаяж нэг цэцэг нэмнэ үү.');
    if (flowers.total > LIMITS.flowers || fillers.total > LIMITS.fillers) return fail('Баглаа хэт том байна.');
    const paper = PIXEL.papers[b.paper], ribbon = PIXEL.ribbons[b.ribbon];
    if (!paper || !ribbon) return fail('Цаас, туузаа сонгоно уу.');

    Object.assign(details, {
      kind: 'pixel', flowers: list(flowers.out), fillers: list(fillers.out), stems: flowers.total, paper, ribbon,
    });
    noteParts.push(`Цаас: ${paper}`, `Тууз: ${ribbon}`);
    if (fillers.total) noteParts.push(`Чимэглэл: ${details.fillers}`);
    flowerText = `Пиксел баглаа: ${details.flowers}`;
    qty = flowers.total;

    // Харилцагчийн угсарсан зураг (PNG data URL, заавал биш)
    if (typeof b.image === 'string' && b.image.startsWith('data:image/png;base64,')) {
      const buf = Buffer.from(b.image.slice(22), 'base64');
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      if (isPng && buf.length <= 900 * 1024) image = buf;
    }
  }

  // --- Захиалагч ---
  const name = clean(b.name, 40);
  const phone = phone8(b.phone);
  if (!name) return fail('Нэрээ бичнэ үү.');
  if (!phone) return fail('Утасны дугаар 8 оронтой байх ёстой.');

  // --- Хэзээ ---
  const date = clean(b.date, 10), time = clean(b.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:00$/.test(time)) return fail('Өдөр, цагаа сонгоно уу.');
  const hour = Number(time.slice(0, 2));
  if (hour < LIMITS.openHour || hour > LIMITS.closeHour) return fail('Бид 10:00–20:00 цагт ажилладаг.');
  const when = ubToUtcMs(date, time);
  if (!Number.isFinite(when)) return fail('Өдөр, цагаа сонгоно уу.');
  if (when < Date.now() + LIMITS.leadHours * 3600e3) {
    return fail(`Баглаа бэлдэхэд дор хаяж ${LIMITS.leadHours} цаг хэрэгтэй. Арай хожуу цаг сонгоно уу.`);
  }
  if (when > Date.now() + 60 * 86400e3) return fail('Хамгийн ихдээ 60 хоногийн дотор захиална.');

  // --- Хүргэлт, хүлээн авагч ---
  const delivery = b.delivery === true;
  const address = clean(b.address, 200);
  if (delivery && !address) return fail('Хүргэх хаягаа бичнэ үү.');

  const recipientName = clean(b.recipientName, 40);
  const recipientPhone = b.recipientPhone ? phone8(b.recipientPhone) : null;
  if (b.recipientPhone && !recipientPhone) return fail('Хүлээн авагчийн утас 8 оронтой байх ёстой.');

  const message = clean(b.message, LIMITS.message);
  const note = clean(b.note, 200);
  const allowSwap = b.allowSwap !== false;

  Object.assign(details, { message, allowSwap, note, recipientName, recipientPhone, when: `${date} ${time}` });
  if (message) noteParts.push(`Карт: “${message}”`);
  if (recipientName || recipientPhone) noteParts.push(`Хүлээн авагч: ${[recipientName, recipientPhone].filter(Boolean).join(' ')}`);
  noteParts.push(allowSwap ? 'Солихыг зөвшөөрсөн' : 'СОЛИХГҮЙ');
  if (note) noteParts.push(note);

  try {
    const saved = await addOrder({
      name, phone,
      flower: flowerText,
      qty,
      unitPrice: '',
      delivery, address,
      deliveryDate: details.when,
      note: noteParts.join(' | '),
      source: details.kind === 'ready' ? 'Вэб (бэлэн загвар)' : 'Вэб (пиксел баглаа)',
    });
    // Discord мэдэгдэл бүтэлгүйтсэн ч захиалга хадгалагдсан тул хэрэглэгчид амжилттай гэж хариулна
    notifyWebOrder(saved, details, image).catch(err => console.error('Вэб захиалга Discord алдаа:', err.message));
    res.json({ orderId: saved.orderId });
  } catch (err) {
    console.error('Вэб захиалга хадгалах алдаа:', err.message);
    fail('Захиалга хадгалахад алдаа гарлаа. Дахин оролдоно уу эсвэл Messenger-ээр бичээрэй.', 500);
  }
}
