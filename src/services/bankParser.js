// Банкны гүйлгээний и-мэйлээс мэдээлэл салгах.
// ХасБанк = PDF хавсралт дотор, Хаан банк = имэйлийн текст дотор.
// Лавлагаа: memory/gmail-parse-guide.md

// ===== Банк таних =====
const BANKS = [
  { name: 'Төрийн банк', keys: [/state bank/i, /төрийн банк/i] },
  { name: 'Голомт',      keys: [/golomt/i, /голомт/i] },
  { name: 'Хаан банк',   keys: [/khan bank/i, /хаан банк/i] },
  { name: 'ХХБ',         keys: [/tdbm/i, /худалдаа,?\s*хөгжлийн/i, /хөгжлийн банк/i] },
  { name: 'ХасБанк',     keys: [/xacbank/i, /хас\s?банк/i, /цахим гүйлгээний/i] },
];

export function detectBank(text) {
  const t = (text || '').toLowerCase();
  for (const b of BANKS) if (b.keys.some(re => re.test(t))) return b.name;
  return 'Тодорхойгүй';
}

// ===== Туслах =====
const toNum = s => Number(String(s).replace(/[,\s]/g, ''));

// Текст дотор бодит дүн (тоо+валют) байгаа эсэх — extractText-ийн шийдэлд
export function hasAmount(text) {
  return /(-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)\s*(?:₮|MNT|USD|төгрөг|төг)/i.test(text || '');
}

// HTML-ийг энгийн текст болгох (DOM parser хэрэггүй)
export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<\s*(br|\/p|\/tr)\s*\/?>/gi, '\n')
    .replace(/<\s*td[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function parseAmount(text) {
  const m = text.match(/(-?\d[\d,\.]*)\s*(?:MNT|USD|₮|төгрөг|төг)/i);
  if (m) return Math.abs(toNum(m[1]));
  const m2 = text.match(/(?:дүн|хасагдлаа)[^\d-]*(-?\d[\d,\.]*)/i);
  if (m2) return Math.abs(toNum(m2[1]));
  return null;
}

export function extractBalance(text) {
  const m = (text || '').match(/(?:үлдэгдэл|balance)[^\d-]*(-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/i);
  return m ? toNum(m[1]) : null;
}

// Төрөл — эрэмбээр (найдвартайгаас нь)
function detectType(text) {
  if (/төрөл:\s*орлого/i.test(text)) return 'Орлого';
  if (/төрөл:\s*зарлага/i.test(text)) return 'Зарлага';
  if (/орлог|ирсэн|нэмэгд|\+\s*\d/i.test(text)) return 'Орлого';
  return 'Зарлага';
}

// ===== ХасБанк — PDF текстээс =====
export function parseXacPdf(text) {
  // Дүн: эхний "Дүн:" (шимтгэлийн дүнг алгасахын тулд эхнийхийг л)
  const amtStr = text.match(/Дүн:\s*([\d,.]+)/)?.[1];
  const amount = amtStr ? Math.abs(toNum(amtStr)) : null;

  // Гүйлгээний утга: → шимтгэл/хийсэн/Энэхүү хүртэл
  let description = '—';
  const parts = text.split('Гүйлгээний утга:');
  if (parts[1]) {
    description = parts[1]
      .split(/Гүйлгээний шимтгэл|Гүйлгээ хийсэн|Энэхүү/)[0]
      .replace(/[\n\r]+/g, ' ')
      .trim() || '—';
  }

  const txType = /Төрөл:\s*Орлого/i.test(text) ? 'Орлого' : 'Зарлага';
  return { bank: 'ХасБанк', txType, amount, description };
}

// ===== Хаан банк — имэйлийн текстээс =====
export function parseKhan(text) {
  let description = '—';
  const parts = text.split('Transaction description:');
  if (parts[1]) {
    description = parts[1].split(/Харилцагч|Recipient/)[0].replace(/[\n\r]+/g, ' ').trim() || '—';
  }
  return { bank: 'Хаан банк', txType: detectType(text), amount: parseAmount(text), description };
}

// ===== Ерөнхий (бусад банк) =====
function parseGeneric(text) {
  let description = '—';
  const m = text.match(/(?:утга|гүйлгээний утга|description|narration)[:\s]+(.{3,120})/i);
  if (m) {
    description = m[1].split('\n')[0].split(/үлдэгдэл|balance/i)[0].replace(/[.\s]+$/, '').trim() || '—';
  }
  return { bank: detectBank(text), txType: detectType(text), amount: parseAmount(text), description };
}

// ===== Гол чиглүүлэгч — текстээс банк тааж задална =====
export function parseTransactionBody(text) {
  const lower = (text || '').toLowerCase();
  if (lower.includes('цахим гүйлгээний') || lower.includes('хасбанк') || lower.includes('xacbank')) {
    return parseXacPdf(text);
  }
  if (lower.includes('khan bank') || lower.includes('хаан банк')) {
    return parseKhan(text);
  }
  return parseGeneric(text);
}
