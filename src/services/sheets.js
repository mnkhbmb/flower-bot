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

// Tab-ыг нэрээр нь (том/жижиг үсэг үл хамааран) олох
function findSheet(d, title) {
  const want = title.trim().toLowerCase();
  for (const key of Object.keys(d.sheetsByTitle)) {
    if (key.trim().toLowerCase() === want) return d.sheetsByTitle[key];
  }
  return null;
}

// Өдрийн хаалт хадгалах
export async function saveHaalt(data) {
  const d = await ensureLoaded();
  const sheet = findSheet(d, 'Өдрийн хаалт');
  if (!sheet) {
    console.error('❌ "Өдрийн хаалт" tab олдсонгүй. Tab-ууд:', Object.keys(d.sheetsByTitle));
    throw new Error('Өдрийн хаалт tab олдсонгүй');
  }
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

  // Баглаа бүрийг "Хаалт задаргаа" tab-д тусдаа мөр болгох
  if (data.baglaa) {
    const detail = findSheet(d, 'Хаалт задаргаа');
    if (detail) {
      let isHorogdol = false;
      const lines = data.baglaa.split('\n');
      for (const line of lines) {
        // "Хорогдол" гэсэн үгнээс хойшхи мөрүүдийг хорогдол гэж тэмдэглэнэ
        if (/хорогдол/i.test(line)) isHorogdol = true;
        const matches = [...line.matchAll(/([А-ЯӨҮа-яөүA-Za-z\/]+)-(\d+)/g)];
        for (const m of matches) {
          await detail.addRow({
            'Огноо':   today,
            'Ажилтан': data.name,
            'Товчлол': m[1],
            'Тоо':     Number(m[2]),
            'Төрөл':   isHorogdol ? 'Хорогдол' : 'Зарсан',
          });
        }
      }
    }
  }
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

// Баглаа текстээс товчлол + тоог задлах
// Жишээ: "1. Са-3 Ро-2 /Б/\n2. Уг-5 /П/" → [{tovch:'Са',too:3}, ...]
function parseBaglaa(text) {
  const result = [];
  const pattern = /([А-ЯӨҮа-яөүA-Za-z\/]+)-(\d+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    result.push({ tovch: match[1], too: Number(match[2]) });
  }
  return result;
}

// Агуулахаас хасах (/haalt-аас дуудна)
export async function decreaseAguurlah(baglaaText) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return [];

  const rows = await sheet.getRows();
  const items = parseBaglaa(baglaaText);
  const warnings = [];

  for (const { tovch, too } of items) {
    const row = rows.find(r => r.get('Товчлол') === tovch);
    if (!row) continue;

    const current = Number(row.get('Тоо')) || 0;
    const newToo = Math.max(0, current - too);
    row.set('Тоо', newToo);
    await row.save();

    const threshold = Number(row.get('Анхааруулгын хэмжээ')) || 0;
    if (newToo <= threshold) {
      warnings.push({ ner: row.get('Бараа нэр'), tovch, too: newToo, threshold });
    }
  }
  return warnings;
}

// Агуулахад нэмэх (бараа таталтаас дуудна)
export async function increaseAguurlah(invoiceItems) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return;

  const rows = await sheet.getRows();

  for (const item of invoiceItems) {
    const invoiceNer = item.ner?.toLowerCase() || '';

    // Түлхүүр үг байвал тэрийг ашиглана, үгүй бол Товчлолоор тааруулна
    const row = rows.find(r => {
      const keywords = r.get('Түлхүүр үг')?.toLowerCase() || '';
      if (keywords) {
        return keywords.split(',').some(kw => kw.trim() && invoiceNer.includes(kw.trim()));
      }
      const tovch = r.get('Товчлол')?.toLowerCase() || '';
      return tovch && invoiceNer.includes(tovch);
    });

    if (row) {
      const current = Number(row.get('Тоо')) || 0;
      row.set('Тоо', current + Number(item.too));
      await row.save();
    } else {
      // Олдоогүй бол шинэ мөр нэмнэ
      await sheet.addRow({
        '№': rows.length + 1,
        'Бараа нэр': item.ner,
        'Товчлол': '',
        'Төрөл': 'Цэцэг',
        'Анхны тоо': item.too,
        'Тоо': item.too,
        'Анхааруулгын хэмжээ': 5,
      });
    }
  }
}

// Агуулахд гараар нэмэх (товчлолоор)
export async function manualAddAguurlah(tovch, too) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return null;
  const rows = await sheet.getRows();
  const row = rows.find(r => r.get('Товчлол') === tovch);
  if (!row) return null;
  const current = Number(row.get('Тоо')) || 0;
  const newToo = current + too;
  row.set('Тоо', newToo);
  await row.save();
  return { ner: row.get('Бараа нэр'), tovch, oldToo: current, newToo };
}

// Агуулахын одоогийн байдал
export async function getAguurlah() {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return [];
  const rows = await sheet.getRows();
  return rows.map(r => ({
    ner: r.get('Бараа нэр'),
    tovch: r.get('Товчлол'),
    too: Number(r.get('Тоо')) || 0,
    threshold: Number(r.get('Анхааруулгын хэмжээ')) || 0,
  }));
}

// Өдрийн тайлан гаргах — "Өдрийн хаалт" tab-аас тооцоолно
export async function getDailyReport(dateStr) {
  const d = await ensureLoaded();
  const sheet = findSheet(d, 'Өдрийн хаалт');
  const target = dateStr || new Date().toISOString().slice(0, 10);
  if (!sheet) return { date: target, count: 0, niit: 0, belen: 0, dans: 0, pos: 0, zarlaga: 0, tsever: 0 };

  const rows = await sheet.getRows();
  const todays = rows.filter(r => r.get('Огноо') === target);

  let niit = 0, belen = 0, dans = 0, pos = 0, zarlaga = 0, tsever = 0;
  for (const r of todays) {
    niit    += Number(r.get('Нийт орлого')) || 0;
    belen   += Number(r.get('Бэлэн')) || 0;
    dans    += Number(r.get('Данс')) || 0;
    pos     += Number(r.get('Пос')) || 0;
    zarlaga += Number(r.get('Зарлага нийт')) || 0;
    tsever  += Number(r.get('Цэвэр орлого')) || 0;
  }

  return { date: target, count: todays.length, niit, belen, dans, pos, zarlaga, tsever };
}
