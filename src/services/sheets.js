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

// Ирц бүртгэх
export async function logAttendance(name, type) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Ирц'];
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toLocaleTimeString('mn-MN', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit' });

  if (type === 'in') {
    await sheet.addRow({
      'Огноо': date,
      'Ажилтан': name,
      'Ирсэн цаг': time,
      'Гарсан цаг': '',
      'Тэмдэглэл': '',
    });
  } else {
    // Гарсан цагийг мөн өдрийн сүүлийн мөрд бичнэ
    const rows = await sheet.getRows();
    const todayRows = rows.filter(r => r.get('Огноо') === date && r.get('Ажилтан') === name && !r.get('Гарсан цаг'));
    if (todayRows.length > 0) {
      const last = todayRows[todayRows.length - 1];
      last.set('Гарсан цаг', time);
      await last.save();
    } else {
      await sheet.addRow({
        'Огноо': date,
        'Ажилтан': name,
        'Ирсэн цаг': '',
        'Гарсан цаг': time,
        'Тэмдэглэл': 'Ирсэн цаг бүртгэгдээгүй',
      });
    }
  }
  return { name, type, time, date };
}

// Цалингийн тооцоо
export async function getSalaryReport(from, to) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Ирц'];
  const rows = await sheet.getRows();

  const DAILY_RATE = 71500;
  const WORKERS = ['Туяа', 'Амина'];

  const result = {};
  for (const name of WORKERS) {
    // Тухайн хугацааны ирсэн + гарсан бүртгэлтэй өдрүүдийг тоолно
    const days = rows.filter(r => {
      const date = r.get('Огноо');
      return r.get('Ажилтан') === name &&
        r.get('Ирсэн цаг') &&
        r.get('Гарсан цаг') &&
        date >= from &&
        date <= to;
    });

    // Нийт цаг тооцох
    let totalMinutes = 0;
    for (const r of days) {
      const inTime = r.get('Ирсэн цаг');
      const outTime = r.get('Гарсан цаг');
      if (inTime && outTime) {
        const [inH, inM] = inTime.split(':').map(Number);
        const [outH, outM] = outTime.split(':').map(Number);
        totalMinutes += (outH * 60 + outM) - (inH * 60 + inM);
      }
    }

    const totalHours = (totalMinutes / 60).toFixed(1);
    const salary = days.length * DAILY_RATE;
    result[name] = { days: days.length, hours: totalHours, salary };
  }
  return { from, to, workers: result };
}

// Бараа таталт хадгалах
export async function saveBaraa(invoice) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Бараа таталт'];
  if (!sheet) return;

  for (const item of invoice.baraa) {
    await sheet.addRow({
      'Огноо':        invoice.ogno || new Date().toISOString().slice(0, 10),
      'Баримт №':     invoice.barimtNo || '',
      'Нийлүүлэгч':  invoice.nilluulegch || '',
      'Бараа нэр':    item.ner || '',
      'Тоо':          item.too || '',
      'Нэгж үнэ':    item.negj || '',
      'Нийт дүн':    item.niit || '',
    });
  }
}

// Өдрийн хаалт хадгалах
export async function saveHaalt(data) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Өдрийн хаалт'];
  if (!sheet) return;
  const today = new Date().toISOString().slice(0, 10);
  await sheet.addRow({
    'Огноо':        today,
    'Ажилтан':      data.name,
    'Баглаа':       data.baglaa || '',
    'Нийт орлого':  data.niit,
    'Бэлэн':        data.belen,
    'Данс':         data.dans,
    'Пос':          data.pos,
    'Зарлага':      data.zarlaga || '',
    'Зарлага нийт': data.zarlTotal,
    'Цэвэр орлого': data.tsever,
  });
}

// Цалин Sheets-д хадгалах
export async function saveSalaryToSheet(from, to, workers, directors) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Цалин'];
  if (!sheet) return;

  const period = `${from} ~ ${to}`;

  // Ажилтнуудын цалин
  for (const [name, data] of Object.entries(workers)) {
    await sheet.addRow({
      'Хугацаа': period,
      'Нэр': name,
      'Төрөл': 'Ажилтан',
      'Өдөр': data.days,
      'Цаг': data.hours,
      'Дүн': data.salary,
    });
  }

  // Захирлуудын цалин
  for (const dir of directors) {
    await sheet.addRow({
      'Хугацаа': period,
      'Нэр': dir.name,
      'Төрөл': 'Захирал',
      'Өдөр': '-',
      'Цаг': '-',
      'Дүн': dir.amount,
    });
  }
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
