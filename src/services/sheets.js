// Google Sheets-тэй харьцах бүх функц энд
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { findAliasGroup, NON_FLOWER } from '../config/aliases.js';

// Хамгийн их зарагдсан бараа — "Хаалт задаргаа" tab-аас (Төрөл = Зарсан).
// Янз бүрээр бичсэн товчлолыг alias толиор нэг нэр дор нэгтгэнэ.
export async function getTopSold(from, to) {
  const d = await ensureLoaded();
  const empty = { from, to, flowers: [], others: [], unknown: [], waste: 0, days: 0 };
  const sheet = Object.values(d.sheetsByTitle)
    .find(s => s.title.trim().toLowerCase() === 'хаалт задаргаа');
  if (!sheet) return empty;

  const rows = await sheet.getRows();
  const sold = new Map();          // нэр → { qty, known }
  const dates = new Set();
  let waste = 0;

  for (const r of rows) {
    const date = String(r.get('Огноо') || '').trim();
    if (!date || date < from || date > to) continue;
    const raw = String(r.get('Товчлол') || '').trim();
    const qty = Number(String(r.get('Тоо') ?? '').replace(/[^\d.-]/g, '')) || 0;
    if (!raw || qty <= 0) continue;

    if (/хорогдол/i.test(r.get('Төрөл') || '')) { waste += qty; continue; }
    dates.add(date);

    const group = findAliasGroup(raw);
    const name = group ? group.canonical : raw.toLowerCase();
    const cur = sold.get(name) || { qty: 0, known: !!group };
    cur.qty += qty;
    sold.set(name, cur);
  }

  const all = [...sold].map(([name, v]) => ({ name, qty: v.qty, known: v.known }))
    .sort((a, b) => b.qty - a.qty);
  return {
    from, to, waste, days: dates.size,
    flowers: all.filter(i => i.known && !NON_FLOWER.has(i.name)),
    others:  all.filter(i => i.known && NON_FLOWER.has(i.name)),
    unknown: all.filter(i => !i.known),
  };
}

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
// Цагийн бичвэрийг минут болгох. "9:52", "10:00:00 AM", "20:15" бүгдийг ойлгоно.
function toMinutes(t) {
  if (!t) return null;
  const m = String(t).trim().match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

// Минутыг "09:52" болгож буцаах (задаргаанд харуулахад)
function fmtTime(min) {
  if (min == null) return null;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export async function getSalaryReport(from, to, exclude = []) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Ирц'];
  const rows = await sheet.getRows();

  const DAILY_RATE = 71500;

  // Нэг ажилтны нэг өдрийг НЭГ л удаа тоолно — давхар бүртгэлийг огноогоор нэгтгэж,
  // хамгийн эрт ирсэн / хамгийн орой гарсан цагийг авна.
  const byPerson = new Map();   // нэр → Map(огноо → { in, out, rows })
  for (const r of rows) {
    const date = String(r.get('Огноо') || '').trim();
    const name = String(r.get('Ажилтан') || '').trim();
    if (!name || !date || date < from || date > to) continue;
    if (exclude.includes(name)) continue;

    const inM = toMinutes(r.get('Ирсэн цаг'));
    const outM = toMinutes(r.get('Гарсан цаг'));
    if (inM == null && outM == null) continue;   // хоосон мөр

    if (!byPerson.has(name)) byPerson.set(name, new Map());
    const days = byPerson.get(name);
    const day = days.get(date) || { in: null, out: null, rows: 0 };
    day.rows++;
    if (inM != null && (day.in == null || inM < day.in)) day.in = inM;
    if (outM != null && (day.out == null || outM > day.out)) day.out = outM;
    days.set(date, day);
  }

  const result = {};
  for (const [name, days] of byPerson) {
    let totalMinutes = 0;
    const detail = [];

    for (const date of [...days.keys()].sort()) {
      const day = days.get(date);
      // Хоёр цаг хоёулаа байвал л цагийг тооцно; өдөр нь аль нэг нь байхад тоологдоно
      if (day.in != null && day.out != null && day.out > day.in) {
        totalMinutes += day.out - day.in;
      }
      detail.push({
        date,
        in: fmtTime(day.in),
        out: fmtTime(day.out),
        complete: day.in != null && day.out != null,
        duplicated: day.rows > 1,
      });
    }

    result[name] = {
      days: detail.length,
      hours: (totalMinutes / 60).toFixed(1),
      salary: detail.length * DAILY_RATE,
      detail,
    };
  }
  return { from, to, workers: result };
}

// Бараа таталт хадгалах
export async function saveBaraa(invoice) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Бараа таталт'];
  if (!sheet) return;

  // Бүх мөрийг нэг API дуудлагаар нэмнэ (мөр бүрд тус тусад нь бичвэл 429 quota хэтэрдэг)
  await sheet.addRows(invoice.baraa.map(item => ({
    'Огноо':        invoice.ogno || new Date().toISOString().slice(0, 10),
    'Баримт №':     invoice.barimtNo || '',
    'Нийлүүлэгч':  invoice.nilluulegch || '',
    'Бараа нэр':    item.ner || '',
    'Тоо':          item.too || '',
    'Нэгж үнэ':    item.negj || '',
    'Нийт дүн':    item.niit || '',
  })));
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
      const detailRows = [];
      const lines = data.baglaa.split('\n');
      for (const line of lines) {
        // "Хорогдол" гэсэн үгнээс хойшхи мөрүүдийг хорогдол гэж тэмдэглэнэ
        if (/хорогдол/i.test(line)) isHorogdol = true;
        const matches = [...line.matchAll(/([А-ЯӨҮа-яөүA-Za-z\/]+)-(\d+)/g)];
        for (const m of matches) {
          detailRows.push({
            'Огноо':   today,
            'Ажилтан': data.name,
            'Товчлол': m[1],
            'Тоо':     Number(m[2]),
            'Төрөл':   isHorogdol ? 'Хорогдол' : 'Зарсан',
          });
        }
      }
      // Нэг API дуудлагаар бүх мөрийг нэмнэ (429 quota-аас сэргийлнэ)
      if (detailRows.length) await detail.addRows(detailRows);
    }
  }
}

// Цалин Sheets-д хадгалах
export async function saveSalaryToSheet(from, to, workers, directors) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Цалин'];
  if (!sheet) return;

  const period = `${from} ~ ${to}`;

  // Ажилтан + захирлын мөрүүдийг нэг API дуудлагаар бичнэ
  await sheet.addRows([
    ...Object.entries(workers).map(([name, data]) => ({
      'Хугацаа': period,
      'Нэр': name,
      'Төрөл': 'Ажилтан',
      'Өдөр': data.days,
      'Цаг': data.hours,
      'Дүн': data.salary,
    })),
    ...directors.map(dir => ({
      'Хугацаа': period,
      'Нэр': dir.name,
      'Төрөл': 'Захирал',
      'Өдөр': '-',
      'Цаг': '-',
      'Дүн': dir.amount,
    })),
  ]);
}

// Зээл / урьдчилгаа хадгалах — "Зээл" tab (байхгүй бол үүсгэнэ)
export async function saveZeel({ name, amount, note }) {
  const d = await ensureLoaded();
  let sheet = findSheet(d, 'Зээл');
  if (!sheet) {
    sheet = await d.addSheet({
      title: 'Зээл',
      headerValues: ['Огноо', 'Ажилтан', 'Дүн', 'Тэмдэглэл'],
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  await sheet.addRow({
    'Огноо': today,
    'Ажилтан': name,
    'Дүн': amount,
    'Тэмдэглэл': note || '',
  });
  return { date: today, name, amount };
}

// Хугацааны мужид авсан зээлийг ажилтнаар нэгтгэх → { нэр: нийт дүн }
export async function getAdvances(from, to) {
  const d = await ensureLoaded();
  const sheet = findSheet(d, 'Зээл');
  if (!sheet) return {};
  const rows = await sheet.getRows();

  const result = {};
  for (const r of rows) {
    const date = r.get('Огноо');
    const name = (r.get('Ажилтан') || '').trim();
    if (!name || date < from || date > to) continue;
    const amount = Number(String(r.get('Дүн') || '').replace(/[^\d]/g, '')) || 0;
    result[name] = (result[name] || 0) + amount;
  }
  return result;
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
// Агуулахын мөрийг товчлолоор олох. Товчлолыг alias толиор өргөтгөж,
// мөрийн "Товчлол" (таслалаар тусгаарласан) болон "Бараа нэр"-тэй тулгана.
function matchAguulahRow(rows, tovch) {
  const t = String(tovch || '').trim().toLowerCase();
  if (!t) return null;

  const variants = new Set([t]);
  const group = findAliasGroup(t);
  if (group) {
    variants.add(group.canonical);
    for (const a of group.aliases) variants.add(a);
  }

  return rows.find(r => {
    const ner = String(r.get('Бараа нэр') || '').trim().toLowerCase();
    if (variants.has(ner)) return true;
    return String(r.get('Товчлол') || '')
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .some(x => variants.has(x));
  }) || null;
}

export async function decreaseAguurlah(baglaaText) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return { warnings: [], unmatched: [] };

  const rows = await sheet.getRows();
  const items = parseBaglaa(baglaaText);
  const warnings = [];
  const unmatched = [];
  const updates = new Map();   // rowNumber → шинэ утга

  for (const { tovch, too } of items) {
    const row = matchAguulahRow(rows, tovch);
    if (!row) {
      unmatched.push(tovch);   // танихгүй товчлолыг мэдэгдэнэ
      continue;
    }

    const current = updates.get(row.rowNumber) ?? (Number(row.get('Тоо')) || 0);
    const newToo = Math.max(0, current - too);
    updates.set(row.rowNumber, newToo);

    const threshold = Number(row.get('Анхааруулгын хэмжээ')) || 0;
    if (newToo <= threshold) {
      warnings.push({ ner: row.get('Бараа нэр'), tovch, too: newToo, threshold });
    }
  }

  await batchSetToo(sheet, updates);   // нэг бичилтээр бүгдийг хадгална
  return { warnings, unmatched };
}

// "Тоо" баганын олон мөрийг НЭГ API дуудлагаар шинэчлэх (мөр бүрд row.save()
// дуудвал Google-ийн 60 бичилт/мин quota хэтэрч 429 өгдөг)
async function batchSetToo(sheet, updates) {
  if (updates.size === 0) return;
  const colIdx = sheet.headerValues.indexOf('Тоо');
  if (colIdx === -1) return;
  await sheet.loadCells();
  for (const [rowNumber, value] of updates) {
    sheet.getCell(rowNumber - 1, colIdx).value = value;
  }
  await sheet.saveUpdatedCells();
}

// Агуулахад нэмэх (бараа таталтаас дуудна)
export async function increaseAguurlah(invoiceItems) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return;

  const rows = await sheet.getRows();
  const updates = new Map();   // rowNumber → шинэ утга (нэг мөрөнд олон бараа таарвал хуримтлуулна)
  const newRows = [];
  let nextNo = rows.length + 1;

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
      const current = updates.get(row.rowNumber) ?? (Number(row.get('Тоо')) || 0);
      updates.set(row.rowNumber, current + Number(item.too));
    } else {
      // Олдоогүй бол шинэ мөр нэмнэ
      newRows.push({
        '№': nextNo++,
        'Бараа нэр': item.ner,
        'Товчлол': '',
        'Төрөл': 'Цэцэг',
        'Анхны тоо': item.too,
        'Тоо': item.too,
        'Анхааруулгын хэмжээ': 5,
      });
    }
  }

  // Нийт 2 бичилт: батч update + батч insert
  await batchSetToo(sheet, updates);
  if (newRows.length) await sheet.addRows(newRows);
}

// Агуулахд гараар нэмэх (товчлолоор)
export async function manualAddAguurlah(tovch, too) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return null;
  const rows = await sheet.getRows();
  const row = matchAguulahRow(rows, tovch);   // alias толиор ч таньна
  if (!row) return null;
  const current = Number(row.get('Тоо')) || 0;
  const newToo = current + too;
  row.set('Тоо', newToo);
  await row.save();
  return { ner: row.get('Бараа нэр'), tovch, oldToo: current, newToo };
}

// Чатботод санал болгох цэцгийн төрлүүд — "Агуулах" tab-аас (Төрөл = Цэцэг).
// 5 минут кэшлэнэ (мессеж бүрт Sheets руу хандвал quota идэгдэнэ).
let flowerCache = { at: 0, items: [] };
export async function getFlowerTypes() {
  const now = Date.now();
  if (now - flowerCache.at < 5 * 60 * 1000 && flowerCache.items.length) {
    return flowerCache.items;
  }
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return [];
  const rows = await sheet.getRows();
  const items = rows
    .filter(r =>
      /цэцэг/i.test(r.get('Төрөл') || '') &&
      (r.get('Бараа нэр') || '').trim()
    )
    .map(r => ({
      name: r.get('Бараа нэр').trim(),
      stock: Number(r.get('Тоо')) || 0,
    }));
  flowerCache = { at: now, items };
  return items;
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

// Хугацааны орлого/зарлагын нэгтгэл — "Өдрийн хаалт" tab-аас (цалингийн тайланд)
export async function getPeriodReport(from, to) {
  const d = await ensureLoaded();
  const sheet = findSheet(d, 'Өдрийн хаалт');
  const empty = { from, to, count: 0, days: 0, niit: 0, belen: 0, dans: 0, pos: 0, zarlaga: 0, tsever: 0, baraa: 0 };
  if (!sheet) return empty;

  const rows = await sheet.getRows();
  // Таслалтай бичсэн тоог ("1,200,000") ч зөв уншина
  const num = v => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;

  const inRange = rows.filter(r => {
    const date = String(r.get('Огноо') || '').trim();
    return date && date >= from && date <= to;
  });

  const acc = { ...empty, count: inRange.length };
  for (const r of inRange) {
    acc.niit    += num(r.get('Нийт орлого'));
    acc.belen   += num(r.get('Бэлэн'));
    acc.dans    += num(r.get('Данс'));
    acc.pos     += num(r.get('Пос'));
    acc.zarlaga += num(r.get('Зарлага нийт'));
    acc.tsever  += num(r.get('Цэвэр орлого'));
  }
  acc.days = new Set(inRange.map(r => String(r.get('Огноо')).trim())).size;

  // Хугацааны бараа таталтын нийт дүн — нэг нэгдсэн тоогоор
  const baraaSheet = findSheet(d, 'Бараа таталт');
  if (baraaSheet) {
    const baraaRows = await baraaSheet.getRows();
    for (const r of baraaRows) {
      const date = String(r.get('Огноо') || '').trim();
      if (date && date >= from && date <= to) {
        acc.baraa += num(r.get('Нийт дүн'));
      }
    }
  }
  return acc;
}

// Агуулахад ШИНЭ бараа бүртгэх (/aguulah_shine). Товчлолыг таслалаар олноор өгч болно.
export async function addAguulahItem({ ner, tovch, too, threshold = 5, turul = 'Цэцэг' }) {
  const d = await ensureLoaded();
  const sheet = d.sheetsByTitle['Агуулах'];
  if (!sheet) return { ok: false, reason: 'no_sheet' };

  const rows = await sheet.getRows();

  // Товчлолуудыг цэвэрлэж, аль нэг нь аль хэдийн ашиглагдсан эсэхийг шалгана
  const tovchList = String(tovch).split(',').map(t => t.trim()).filter(Boolean);
  for (const t of tovchList) {
    if (matchAguulahRow(rows, t)) {
      return { ok: false, reason: 'duplicate', tovch: t };
    }
  }

  await sheet.addRow({
    '№': rows.length + 1,
    'Бараа нэр': ner,
    'Товчлол': tovchList.join(','),
    'Төрөл': turul,
    'Анхны тоо': too,
    'Тоо': too,
    'Анхааруулгын хэмжээ': threshold,
  });
  return { ok: true, ner, tovch: tovchList.join(', '), too };
}

// Хорогдол бүртгэх — "Хаалт задаргаа" tab-д Төрөл = Хорогдол мөр болгож бичнэ.
// Бичвэр: "Са-3 Ро-2" хэлбэртэй. Бүртгэсэн зүйлсийг буцаана (хоосон бол формат буруу).
export async function saveHorogdol({ name, text }) {
  const d = await ensureLoaded();
  const detail = findSheet(d, 'Хаалт задаргаа');
  if (!detail) throw new Error('Хаалт задаргаа tab олдсонгүй');

  const items = [...String(text).matchAll(/([А-ЯӨҮа-яөүA-Za-z\/]+)-(\d+)/g)]
    .map(m => ({ tovch: m[1], too: Number(m[2]) }))
    .filter(i => i.too > 0);
  if (!items.length) return [];

  const today = new Date().toISOString().slice(0, 10);
  await detail.addRows(items.map(i => ({
    'Огноо':   today,
    'Ажилтан': name,
    'Товчлол': i.tovch,
    'Тоо':     i.too,
    'Төрөл':   'Хорогдол',
  })));
  return items;
}
