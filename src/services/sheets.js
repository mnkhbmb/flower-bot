// Google Sheets-тэй харьцах бүх функц энд
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const auth = new JWT({
  email: process.env.GOOGLE_SERVICE_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
let loaded = false;

async function ensureLoaded() {
  if (!loaded) {
    await doc.loadInfo();
    loaded = true;
  }
  return doc;
}

// Дараагийн захиалгын дугаар үүсгэх (ЗАХ-001, ЗАХ-002...)
async function nextOrderId(sheet) {
  const rows = await sheet.getRows();
  const count = rows.filter(r => r.get('Захиалгын #')).length;
  return `ЗАХ-${String(count + 1).padStart(3, '0')}`;
}

// Шинэ захиалгыг "Захиалга" хуудсанд бичих
export async function addOrder(order) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Захиалга'];
  const orderId = await nextOrderId(sheet);
  const today = new Date().toISOString().slice(0, 10);

  await sheet.addRow({
    'Захиалгын #': orderId,
    'Огноо': today,
    'Харилцагч': order.name || '',
    'Утас': order.phone || '',
    'Цэцэг / Баглаа': order.flower || '',
    'Тоо': order.qty || '',
    'Нэгж үнэ': order.unitPrice || '',
    'Хүргэлт эсэх': order.delivery ? 'Тийм' : 'Үгүй',
    'Хаяг': order.address || '',
    'Хүргэх огноо': order.deliveryDate || '',
    'Статус': 'Хүлээгдэж байна',
    'Төлбөр': 'Хүлээгдэж байна',
    'Эх сурвалж': 'FB Messenger',
    'Тэмдэглэл': order.note || '',
  });

  return { ...order, orderId, date: today };
}

// Өдрийн тайлан гаргах — тухайн өдрийн захиалгууд
export async function getDailyReport(dateStr) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Захиалга'];
  const rows = await sheet.getRows();
  const target = dateStr || new Date().toISOString().slice(0, 10);

  const todays = rows.filter(r => r.get('Огноо') === target);
  let revenue = 0, deliveries = 0;

  for (const r of todays) {
    const qty = Number(r.get('Тоо')) || 0;
    const price = Number(r.get('Нэгж үнэ')) || 0;
    revenue += qty * price;
    if (r.get('Хүргэлт эсэх') === 'Тийм') deliveries++;
  }

  return { date: target, count: todays.length, revenue, deliveries };
}
